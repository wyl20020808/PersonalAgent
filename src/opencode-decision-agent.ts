import {runAttachments,opencodeParts} from './multimodal.js';
import {opencodeGuidanceBoundary,blockGuidanceHandoff} from './guidance-handoff.js';
import { spawn } from 'node:child_process';
import { assertOperationPolicy, interactionAgentRules } from './interaction-policy.js';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {DiscussionStream} from './discussion-stream.js';
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/v2';
import { terminateTree } from './process.js';
import { FlowError, providerFailure } from './failure.js';
import { validate, type Config } from './schema.js';
import { recordClaudeCall } from './agent-usage.js';
import { CallObservation } from './call-observation.js';
import { activityRecorder, redact, type PublicActivity } from './telemetry.js';
import { agentRules } from './native-agent.js';
import { assertDecisionRequest, assertDecisionState, bindDecisionSession, type DecisionAgent, type DecisionRequest, type DecisionResult } from './decision-agent.js';
import { opencodeEnvironment } from './opencode-runtime.js';
import { timeoutSignal } from './timeout.js';
import { createOpencodeTransport, transportErrorDetails } from './opencode-transport.js';

export interface OpenCodeService { client: OpencodeClient; openapi: any; fetch?: typeof globalThis.fetch; diagnostics?:()=>{pid?:number;closed:boolean;code:number|null;signal:string|null;requestedClose:boolean}; close(): Promise<void> }
export type OpenCodeLauncher = (executable: string | undefined, directory: string, signal: AbortSignal, runtimeDirectory?: string) => Promise<OpenCodeService>;
export function resolveOpencodeExecutable(explicit?: string): string {
  const configured = explicit ?? process.env.PERSONAL_AGENT_OPENCODE_EXECUTABLE;
  if (configured) { if (!existsSync(configured)) throw new FlowError('supervisor', 'OpenCode executable not found'); return realpathSync(configured); }
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) for (const name of process.platform === 'win32' ? ['opencode.exe','opencode-cli.exe'] : ['opencode']) {
    const candidate = path.join(directory, name); if (existsSync(candidate)) return realpathSync(candidate);
  }
  const desktop = path.join(process.env.LOCALAPPDATA ?? '', 'Programs/@opencodedesktop/resources/opencode-cli.exe');
  if (existsSync(desktop)) return realpathSync(desktop);
  throw new FlowError('supervisor', 'OpenCode executable not found; configure an explicit executable');
}
// Port 0 is assigned atomically by the owned server. Never probe or reuse another service.
export async function startOpencodeService(executable: string | undefined, directory: string, signal: AbortSignal, runtimeDirectory?: string, spawnChild: typeof spawn = spawn): Promise<OpenCodeService> {
  assertOperationPolicy({ kind: 'model' });
  signal.throwIfAborted();
  const password = randomUUID();
  const child = spawnChild(resolveOpencodeExecutable(executable), ['serve','--hostname','127.0.0.1','--port','0'], {
    cwd: directory, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['ignore','pipe','pipe'],
    env: { ...opencodeEnvironment(directory, runtimeDirectory), OPENCODE_SERVER_PASSWORD: password, OPENCODE_SERVER_USERNAME: 'opencode' }
  });
  const transport = createOpencodeTransport();
  let closed = false;
  let exitCode:number|null=null,exitSignal:string|null=null,requestedClose=false;
  const diagnostics=()=>({pid:child.pid,closed,code:exitCode,signal:exitSignal,requestedClose});
  const exited = new Promise<void>(resolve => { child.once('close', (code,signal) => { exitCode=code;exitSignal=signal;closed = true; resolve(); }); child.once('error', () => { closed = true; resolve(); }); });
  const close = async () => { try { if (!closed && child.pid){requestedClose=true;await terminateTree(child.pid);} await exited; } finally { await transport.close(); } };
  try {
    const url = await new Promise<string>((resolve, reject) => {
      let pending = '';
      const timer = setTimeout(() => done(new FlowError('supervisor','OpenCode server startup timeout')), 15000);
      const abort = () => done(new Error('Stopped'));
      const error = () => done(new FlowError('supervisor','OpenCode server failed to start'));
      function done(failure?: Error, url?: string) { clearTimeout(timer); signal.removeEventListener('abort',abort); child.removeListener('error',errorListener); child.removeListener('close',error); failure ? reject(failure) : resolve(url!); }
      const errorListener = () => error();
      child.once('error',errorListener); child.once('close',error); signal.addEventListener('abort',abort,{once:true});
      child.stdout!.on('error',errorListener); child.stderr!.on('error',errorListener);
      if (signal.aborted) abort();
      child.stdout!.on('data', chunk => { pending = (pending + String(chunk)).slice(-4096); const match = pending.match(/(?:server listening on|opencode server listening on) (http:\/\/127\.0\.0\.1:\d+)/); if (match) done(undefined,match[1]); });
      // Discard startup logs; they can contain environment or configuration secrets.
      child.stderr!.resume();
    });
    const auth = 'Basic ' + Buffer.from(`opencode:${password}`).toString('base64');
    // v1 uses OPENCODE_SERVER_PASSWORD; v2 may implement its own pairing. The
    // password must remain closure-local and is never included in receipts.
    const headers = { Authorization: auth };
    const response = await fetch(`${url}/openapi.json`, { signal, headers, redirect:'error' });
    let openapi: any;
    if (response.ok && response.headers.get('content-type')?.includes('json')) openapi = await response.json();
    else { const legacy = await fetch(`${url}/doc`, { signal, headers, redirect:'error' }); openapi = await legacy.json(); }
    if (!openapi?.paths) throw new FlowError('supervisor','OpenCode OpenAPI unavailable');
    const client = createOpencodeClient({ baseUrl: url, directory, throwOnError: true, headers, fetch: transport.fetch });
    return { client, openapi, fetch: transport.fetch, diagnostics, close };
  } catch (error) { await close(); throw new FlowError('supervisor', redact((error as Error)?.message ?? 'OpenCode service startup failed')); }
}

export interface DiscoveredModel { id: string; name: string; reasoningEfforts?: string[]; capabilities: { tools: boolean | 'unknown'; structuredOutput: boolean | 'unknown'; images?: boolean | 'unknown' } }
export interface DiscoveredProvider { id: string; name: string; models: DiscoveredModel[] }
export interface ModelDiscovery { available: boolean; reason: string; providers: DiscoveredProvider[] }
export function resolvedSchema(api: any, schema: any, seen = new Set<string>()): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return undefined;
    return resolvedSchema(api, api.components?.schemas?.[schema.$ref.split('/').at(-1)], new Set([...seen, schema.$ref]));
  }
  if (Array.isArray(schema)) return schema.map(item => resolvedSchema(api, item, seen));
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, resolvedSchema(api, value, seen)]));
}
export function supportsStructuredOutput(api: any): boolean {
  const body = resolvedSchema(api, api.paths?.['/session/{sessionID}/message']?.post?.requestBody?.content?.['application/json']?.schema);
  const format = resolvedSchema(api, body?.properties?.format);
  return JSON.stringify(format ?? {}).includes('json_schema');
}
export async function models(service: OpenCodeService, directory: string, signal: AbortSignal): Promise<ModelDiscovery> {
  const options = { signal, throwOnError: true as const };
  let providers: DiscoveredProvider[];
  // V1 1.18.35 exposes both API families. Select the family that actually owns
  // the verified JSON Schema contract, rather than preferring /api by presence.
  if (!supportsStructuredOutput(service.openapi) && service.openapi.paths['/api/provider']) {
    const [p,m] = await Promise.all([service.client.v2.provider.list({location:{directory}},options),service.client.v2.model.list({location:{directory}},options)]);
    // 2.0.20 reports activation; the npm SDK's generated ProviderV2Info predates it.
    providers = (p.data?.data ?? []).filter(provider => (provider as unknown as {activation?:string}).activation !== 'disabled').map(provider => ({ id: redact(provider.id), name: redact(provider.name), models: (m.data?.data ?? []).filter(model => model.providerID === provider.id && model.enabled).map(model => ({ id: redact(model.id), name: redact(model.name), capabilities: { tools: model.capabilities?.tools ?? 'unknown', structuredOutput: false, images: 'unknown' as const } })) }));
  } else {
    const p = await service.client.provider.list({directory},options);
    const connected = new Set(p.data?.connected ?? []);
    providers = (p.data?.all ?? []).filter(provider => connected.has(provider.id)).map(provider => ({id:redact(provider.id),name:redact(provider.name),models:Object.values(provider.models).map(model => ({id:redact(model.id),name:redact(model.name),reasoningEfforts:Object.entries(model.variants??{}).filter(([id,options])=>/^[a-zA-Z0-9._-]{1,100}$/.test(id)&&options.disabled!==true).map(([id])=>id),capabilities:{tools:model.capabilities?.toolcall ?? 'unknown',structuredOutput:supportsStructuredOutput(service.openapi) && model.capabilities?.toolcall === true,images:model.capabilities?.input?.image??'unknown'}}))}));
  }
  providers = providers.filter(provider => provider.models.length);
  return { available: providers.length > 0 && supportsStructuredOutput(service.openapi), reason: !supportsStructuredOutput(service.openapi) ? 'OpenCode service lacks official JSON Schema structured output (format); prompt refused' : providers.length ? '' : 'No connected OpenCode providers/models', providers };
}
export async function discoverOpencodeModels(executable?: string, directory = process.cwd(), launcher: OpenCodeLauncher = startOpencodeService): Promise<ModelDiscovery> {
  const signal = AbortSignal.timeout(20000); let service: OpenCodeService | undefined;
  try { service = await launcher(executable,realpathSync(directory),signal); return await models(service,realpathSync(directory),signal); }
  catch (error) { return { available:false,reason:redact((error as Error)?.message ?? 'OpenCode model discovery failed'),providers:[] }; }
  finally { await service?.close(); }
}
export function opencodePublicEvents(event: any, directory: string, sessionID: string): PublicActivity[] {
  if (event.directory !== directory) return [];
  const value = event.payload, part = value?.properties?.part;
  if (part?.sessionID !== sessionID || !['text','tool'].includes(part.type)) return [];
  if (part.type === 'text') return part.synthetic||part.ignored?[]:[{key:`${part.id}:${part.text}`,streamId:part.id,kind:'output',title:'OpenCode 公开输出',text:redact(part.text ?? '')}];
  return [{key:`${part.id}:${part.state?.status}:${JSON.stringify(part.state)}`,kind:'tool',title:`OpenCode 工具 · ${redact(part.tool ?? '')}`,text:redact(JSON.stringify({callID:part.callID,tool:part.tool,status:part.state?.status,input:part.state?.input,output:part.state?.output,error:part.state?.error,metadata:part.state?.metadata}))}];
}

/** New servers send separate deltas. Only previously owned public text accepts them. */
export class OpenCodePublicStream {
 private texts=new Map<string,any>();
 constructor(private directory:string,private sessionID:string){}
 accept(event:any):PublicActivity[]{
  if(event.directory!==this.directory)return [];
  const props=event.payload?.properties,part=props?.part;
  if(part?.sessionID===this.sessionID){if(part.type==='text'){if(!part.synthetic&&!part.ignored)this.texts.set(part.id,{...part});else this.texts.delete(part.id);}return opencodePublicEvents(event,this.directory,this.sessionID);}
  if(event.payload?.type!=='message.part.delta'||props?.sessionID!==this.sessionID||props.field!=='text'||typeof props.delta!=='string')return [];
  const previous=this.texts.get(props.partID);if(!previous||previous.messageID!==props.messageID)return [];
  const updated={...previous,text:(previous.text??'')+props.delta};this.texts.set(props.partID,updated);
  return opencodePublicEvents({directory:this.directory,payload:{properties:{part:updated}}},this.directory,this.sessionID);
 }
}
export class OpenCodeDecisionAgent implements DecisionAgent {
  constructor(private readonly config: Config, private readonly launcher: OpenCodeLauncher = startOpencodeService) {}
  async structured<T>(request: DecisionRequest): Promise<DecisionResult<T>> {
    assertOperationPolicy({ kind: 'model' });
    assertDecisionRequest(request); const identity = assertDecisionState(request.state,this.config);
    if (identity.backend !== 'opencode') throw new FlowError('safety','OpenCode adapter backend mismatch');
    const { state,store,role,prompt,schema,workspace } = request;
    const call = recordClaudeCall(state,store,role);
    const observation = new CallObservation(state,store,role,prompt,request.context,!!state.decisionSession,'opencode');
    const timeout = timeoutSignal(request.timeoutMs), signal = AbortSignal.any([request.signal,timeout]);
    let service: OpenCodeService | undefined, sessionID: string | undefined, completed = false;
    const tools=new Map<string,any>();
    const discussionStream=new DiscussionStream(request.onPublicProgress,100);
    const eventsStop = new AbortController(); let eventTask: Promise<void> | undefined;
    let record:ReturnType<typeof activityRecorder>|undefined;
    try {
      const executable = this.config.decisionAgent?.backend === 'opencode' ? this.config.decisionAgent.opencode.executable : undefined;
      service = await this.launcher(executable,workspace,signal,path.join(state.config.runtimeDir,'opencode',state.id,...(store.decisionParticipant?[store.decisionParticipant.participantId]:[])));
      const discovery = await models(service,workspace,signal);
      const model = discovery.providers.find(p => p.id === identity.providerID)?.models.find(m => m.id === identity.modelID);
      if (!discovery.available) throw new FlowError('supervisor',discovery.reason);
      if (!model || model.capabilities.tools !== true || model.capabilities.structuredOutput !== true) throw new FlowError('supervisor','OpenCode model unavailable or lacks native tools/structured output');
      if (identity.variant && !model.reasoningEfforts?.includes(identity.variant)) throw new FlowError('supervisor','OpenCode reasoning variant unavailable; refresh model selection');
      const parts=opencodeParts(prompt,runAttachments(state,store),model.capabilities.images);
      const client = service.client, options = { signal,throwOnError:true as const };
      const permission = request.readOnly ? [{permission:'*',pattern:'*',action:'deny' as const},...['read','glob','grep','list'].map(permission=>({permission,pattern:'*',action:'allow' as const}))] : [{permission:'*',pattern:'*',action:'allow' as const}];
      const owner = `PersonalAgent:${state.id}:${workspace}${store.decisionParticipant?':'+store.decisionParticipant.participantId:''}`;
      if (state.decisionSession) {
        sessionID = state.decisionSession.sessionId;
        const session = await client.session.get({sessionID,directory:workspace},options);
        if (session.data?.directory !== workspace || session.data?.title !== owner) throw new FlowError('safety','OpenCode remote Session ownership mismatch');
        // A primary participant resumes the same Session after read-only synthesis.
        // Update only the owned Session so discussion permissions do not persist
        // into authorized development (or vice versa).
        if (request.readOnly || session.data?.permission?.some(rule=>rule.action==='deny')) {
          const updated = await client.session.update({sessionID,directory:workspace,permission},options);
          if (updated.data?.directory !== workspace || updated.data?.title !== owner || JSON.stringify(updated.data.permission)!==JSON.stringify(permission)) throw new FlowError('safety','OpenCode Session mode permissions mismatch');
        }
      } else {
        const session = await client.session.create({directory:workspace,title:owner,permission},options);
        if (!session.data?.id || session.data.directory !== workspace || session.data.title !== owner) throw new FlowError('safety','OpenCode created Session ownership mismatch');
        sessionID = session.data.id; bindDecisionSession(state,store,sessionID);
      }
      record = activityRecorder(state,store,'opencode',`opencode:${call}`,role);
      const publicStream=new OpenCodePublicStream(workspace,sessionID!);
      let readyResolve!: () => void, readyReject!: (error: Error) => void;
      const ready = new Promise<void>((resolve,reject) => { readyResolve = resolve; readyReject = reject; });
      const stream = await client.global.event({signal:AbortSignal.any([eventsStop.signal,signal]),sseMaxRetryAttempts:0,fetch:async input => {
        try { const response = await (service!.fetch ?? fetch)(input,{redirect:'error'}); if (!response.ok) throw new Error('OpenCode event subscription failed'); readyResolve(); return response; }
        catch (error) { readyReject(new Error('OpenCode event subscription failed')); throw error; }
      }});
      eventTask = (async () => { for await (const event of stream.stream) {
        for (const activity of publicStream.accept(event)) {record!(activity);if(activity.kind==='output')discussionStream.text(activity.streamId!,activity.text);}
        const e = event as any, part = e.payload?.properties?.part;
        if (e.directory === workspace && part?.sessionID === sessionID) {if(part.type==='tool'){tools.set(part.id,part);discussionStream.opencode(part);}opencodeGuidanceBoundary(part);observation.observeOpencodePart(part);}
        const info = e.payload?.properties?.info;
        if (e.directory === workspace && info?.sessionID === sessionID) observation.observeOpencodeMessage(info);
      } })();
      eventTask.catch(() => {});
      await ready;
      const result = await client.session.prompt({sessionID,directory:workspace,model:{providerID:identity.providerID,modelID:identity.modelID},...(identity.variant?{variant:identity.variant}:{}),system:agentRules + interactionAgentRules,format:{type:'json_schema',schema:schema as Record<string,unknown>,retryCount:0},parts},options);
      if (result.data?.info.sessionID !== sessionID || result.data.info.role !== 'assistant' || result.data.info.path?.cwd !== workspace) throw new FlowError('safety','OpenCode response Session/workspace mismatch');
      // Final native parts also carry public tool/text receipts. Capture them
      // even when the HTTP result overtakes the tail of the volatile SSE stream.
      for (const part of result.data.parts ?? []) {
        for (const activity of publicStream.accept({directory:workspace,payload:{properties:{part}}})) {record(activity);if(activity.kind==='output')discussionStream.text(activity.streamId!,activity.text);}
        if (part.sessionID === sessionID) {if(part.type==='tool')tools.set(part.id,part);opencodeGuidanceBoundary(part);observation.observeOpencodePart(part);}
      }
      observation.observeOpencodeMessage(result.data.info);
      if (result.data.info.error) throw providerFailure(result.data.info.error,'supervisor');
      // SDK 1.18.35 calls the native field "structured". Never parse text parts.
      const output = validate<T>(schema,result.data.info.structured);
      completed = true; store.audit('opencode-exit',{call,callId:observation.usage.callId,role,sessionId:sessionID});
      return {output,sessionId:sessionID,usage:observation.usage};
    } catch (error) {
      store.audit('opencode-request-error', { role, sessionId: sessionID, message: redact((error as Error)?.message ?? 'OpenCode SDK request failed'), ...transportErrorDetails(error) });
      if (service && sessionID) {
        const cleanupSignal = AbortSignal.timeout(5000);
        let idle=false;
        try {
          await service.client.session.abort({sessionID,directory:workspace},{signal:cleanupSignal,throwOnError:true});
          while (!cleanupSignal.aborted) {
            const status = await service.client.session.status({directory:workspace},{signal:cleanupSignal,throwOnError:true});
            if (status.data&&!Array.isArray(status.data)&&(!status.data[sessionID] || status.data[sessionID]?.type === 'idle')) {idle=true;break;}
            await new Promise(resolve => setTimeout(resolve,25));
          }
        } catch { store.audit('opencode-abort-incomplete',{role,sessionId:sessionID}); }
        if(!idle){blockGuidanceHandoff('OpenCode 决策调用退出未确认；保留现场，不能并发派发下一调用');throw new FlowError('interrupted','OpenCode Decision idle state unknown; manual recovery required');}
        if([...tools.values()].some(part=>part.tool!=='StructuredOutput'&&(['pending','running'].includes(part.state.status)||part.state.metadata?.interrupted)))throw new FlowError('interrupted','OpenCode tool results are unknown; manual recovery required');
      }
      if (timeout.aborted) throw new FlowError('timeout',`OpenCode Timeout after ${request.timeoutMs} ms`);
      if (request.signal.aborted) throw new Error('Stopped');
      const message = (error as Error)?.message ?? 'OpenCode SDK request failed';
      const failure=error instanceof FlowError?error:providerFailure(error,'supervisor');
      throw new FlowError(failure.kind,redact(message));
    } finally {
      eventsStop.abort(); await eventTask?.catch(() => {});
      discussionStream.flush();
      record?.flush();
      try{await service?.close();}catch(error){blockGuidanceHandoff('OpenCode 决策进程退出未确认；保留现场');throw error;}
      finally{if(service?.diagnostics)store.audit('opencode-service-exit',{role,sessionId:sessionID,...service.diagnostics()});}
      observation.finish(completed?'success':signal.aborted?'interrupted':'failed');
    }
  }
}
