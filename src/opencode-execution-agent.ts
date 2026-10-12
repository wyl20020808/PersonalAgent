import {runAttachments,opencodeParts} from './multimodal.js';
import {opencodeGuidanceBoundary,blockGuidanceHandoff} from './guidance-handoff.js';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { FlowError, classifyFailure, providerFailure } from './failure.js';
import { configSchema, nativeResultSchema, validate, type Config, type NativeResult } from './schema.js';
import type { State, Store } from './store.js';
import { CallObservation } from './call-observation.js';
import { activityRecorder, redact } from './telemetry.js';
import { agentRules } from './native-agent.js';
import { interactionAgentRules } from './interaction-policy.js';
import { timeoutSignal } from './timeout.js';
import { transportErrorDetails } from './opencode-transport.js';
import { models, opencodePublicEvents, resolvedSchema, startOpencodeService, supportsStructuredOutput, type ModelDiscovery, type OpenCodeLauncher, type OpenCodeService } from './opencode-decision-agent.js';

// Native permissions are a collaboration boundary, not a Windows sandbox.
// Shell remains able to access resources outside cwd. No unrestricted fallback.
export const executionPermissions = [
  { permission: '*', pattern: '*', action: 'deny' as const },
  ...['read','list','glob','grep','edit','write','bash','apply_patch','todowrite','todoread','StructuredOutput'].map(permission => ({ permission, pattern: '*', action: 'allow' as const })),
  { permission: 'external_directory', pattern: '*', action: 'deny' as const },
];

export function supportsExecutionProtocol(api: any): boolean {
  const body = (route: string) => resolvedSchema(api, api.paths?.[route]?.post?.requestBody?.content?.['application/json']?.schema);
  return supportsStructuredOutput(api) && !!body('/session')?.properties?.permission && !!body('/session/{sessionID}/message')?.properties?.agent &&
    ['/agent','/experimental/tool','/experimental/tool/ids','/global/event','/session/{sessionID}','/session/status','/session/{sessionID}/abort'].every(route => !!api.paths?.[route]);
}
export async function executionModels(service: OpenCodeService, workspace: string, signal: AbortSignal): Promise<ModelDiscovery> {
  const discovery = await models(service, workspace, signal);
  if (!discovery.available) return discovery;
  if (!supportsExecutionProtocol(service.openapi)) return { ...discovery, available: false, reason: 'OpenCode service lacks native Execute permissions, agent, events or Session lifecycle APIs' };
  const options = { signal, throwOnError: true as const };
  const tools = await service.client.tool.ids({ directory: workspace }, options);
  const agents = await service.client.app.agents({ directory: workspace }, options);
  if (!tools.data?.includes('read') || !tools.data.includes('bash') || !['write','apply_patch'].some(id => tools.data?.includes(id)) ||
    !agents.data?.some(agent => agent.name === 'build' && agent.mode !== 'subagent')) return { ...discovery, available: false, reason: 'OpenCode native read/create/edit/bash tools or build agent unavailable' };
  return discovery;
}
export async function discoverOpencodeExecutionModels(executable?: string, directory = process.cwd(), launcher: OpenCodeLauncher = startOpencodeService): Promise<ModelDiscovery> {
  let service: OpenCodeService | undefined;
  try { const workspace = realpathSync(directory), signal = AbortSignal.timeout(20000); service = await launcher(executable, workspace, signal); return await executionModels(service, workspace, signal); }
  catch (error) { return { available: false, reason: redact((error as Error).message), providers: [] }; }
  finally { await service?.close(); }
}
export function assertExecutionState(state: State, config = state.config): void {
  const choice = state.config.executionAgent ?? { backend: 'codex' };
  if (JSON.stringify(choice) !== JSON.stringify(config.executionAgent ?? { backend: 'codex' })) throw new FlowError('safety', 'Immutable Execution Agent backend/model mismatch');
  const session = state.executionSession;
  if (!session) return;
  const directory = realpathSync(state.workspace);
  const decisionIds = [state.claudeSessionId, state.decisionSession?.sessionId, ...state.discussion?.participants.map(p => p.session?.sessionId) ?? []];
  const modelMatches = choice.backend === 'opencode' && session.backend === 'opencode'
    ? session.providerID === choice.opencode.providerID && session.modelID === choice.opencode.modelID
    : choice.backend === 'claude-code' && session.backend === 'claude-code' && session.model === choice.model && session.sessionId === state.claudeExecutionSessionId;
  if (!modelMatches || session.runId !== state.id || session.workspace !== directory || session.directory !== directory || decisionIds.includes(session.sessionId)) throw new FlowError('safety', 'Execution Session ownership or role isolation mismatch');
}
/** User-requested recovery: rebind a halted Run to another execution backend/model. Workspace changes stay; the next Execute opens a fresh Session. */
export function switchExecutionAgent(store: Store, choice: NonNullable<Config['executionAgent']>): State {
  const unlock = store.lock();
  try {
    const state = store.load();
    if (!['paused', 'failed', 'stopped'].includes(state.phase)) throw new Error('仅暂停、失败、停止的 Run 可以切换执行模型');
    const previous = state.config.executionAgent ?? { backend: 'codex' as const };
    if (JSON.stringify(previous) === JSON.stringify(choice)) return state;
    state.config = validate<Config>(configSchema, { ...state.config, executionAgent: choice });
    const previousSession = state.executionSession?.sessionId ?? state.codexThreadId ?? null;
    delete state.executionSession; delete state.claudeExecutionSessionId; state.codexThreadId = null;
    store.save(state, { executionSwitch: true }); store.audit('execution-agent-switched', { from: previous, to: choice, previousSession, loop: state.loops, taskId: state.tasks[state.taskIndex]?.id ?? null });
    return state;
  } finally { unlock(); }
}
export interface ExecutionAgent {
  execute(state: State, store: Store, signal: AbortSignal, prompt: string, context?: Record<string, any>): Promise<NativeResult>;
}
// Explicit extension point for a future Controller execution policy. It runs
// before service launch/prompt and cannot select another role, model or workspace.
export type ExecutionPolicy = (state: Readonly<State>, signal: AbortSignal) => Promise<void>;
export class OpenCodeExecutionAgent implements ExecutionAgent {
  constructor(private readonly config: Config, private readonly launcher: OpenCodeLauncher = startOpencodeService, private readonly policy: ExecutionPolicy = async () => {}) {}
  async execute(state: State, store: Store, externalSignal: AbortSignal, prompt: string, context?: Record<string, any>): Promise<NativeResult> {
    assertExecutionState(state, this.config);
    const choice = state.config.executionAgent, task = state.tasks[state.taskIndex], persisted = store.load();
    if (choice?.backend !== 'opencode' || state.phase !== 'executing' || !state.nativeExecution || !task || state.discussion && !state.discussion.closed || state.completedTaskIds?.includes(task.id)) throw new FlowError('safety', 'OpenCode Execute requires Controller-validated pending native task');
    if (persisted.id !== state.id || store.id !== state.id || persisted.workspace !== state.workspace || persisted.phase !== 'executing' || persisted.loops !== state.loops ||
      JSON.stringify(persisted.tasks) !== JSON.stringify(state.tasks) || JSON.stringify(persisted.config) !== JSON.stringify(state.config)) throw new FlowError('safety', 'OpenCode Execute persisted Run/Plan/workspace mismatch');
    const source = realpathSync(state.source);
    if (!state.config.allowedRepositories.some(directory => realpathSync(directory) === source) || realpathSync(state.workspace) !== (state.config.projectMode === 'direct' ? source : realpathSync(store.file('workspace'))) ||
      state.config.projectMode === 'direct' && (!state.config.directAuthorization?.acknowledgedAt || realpathSync(state.config.directAuthorization.projectPath) !== source)) throw new FlowError('safety', 'OpenCode Execute workspace authorization mismatch');
    if (state.executionAttempt) {
      if (state.executionAttempt.status !== 'success') {
        const events = readFileSync(store.file('audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
        let last = -1; events.forEach((e, index) => { if (e.event === 'opencode-execute-dispatch' || e.event === 'claude-execute-dispatch') last = index; });
        const following=events.slice(last+1);
        const safeIndex=following.findIndex(e=>e.event==='opencode-execute-retry-safe'&&e.data.loop===state.loops&&e.data.sessionId===state.executionSession?.sessionId);
        const automatic=state.executionAttempt.loop===state.loops&&safeIndex>=0&&following.slice(safeIndex+1).some(e=>e.event==='transport-recovery-start'&&e.data.role==='execute'&&e.data.sessionId===state.executionSession?.sessionId);
        const guided=following.some(e=>e.event==='guidance-interrupted'&&e.data.loop===state.executionAttempt!.loop)&&following.some(e=>e.event==='guidance-applied');
        if (state.executionAttempt.loop===state.loops&&!automatic) throw new FlowError('interrupted', 'Execute attempt already dispatched; require Controller recovery, never replay');
        if (last < 0 || !following.some(e => e.event === 'human-decision')&&!guided&&!automatic) throw new FlowError('interrupted', 'Unknown or failed Execute status requires explicit human recovery');
      } else if(state.executionAttempt.loop===state.loops){
        throw new FlowError('interrupted', 'Execute attempt already dispatched; require Controller recovery, never replay');
      }
    }
    const workspace = realpathSync(state.workspace), timeout = timeoutSignal(state.config.timeoutMs), signal = AbortSignal.any([externalSignal, timeout]);
    await this.policy(structuredClone(state), signal); signal.throwIfAborted();
    const observation = new CallObservation(state, store, 'execute', prompt, context, !!state.executionSession, 'opencode');
    const record = activityRecorder(state, store, 'opencode', `opencode-execute:${observation.usage.callId}`);
    let service: OpenCodeService | undefined, sessionID: string | undefined, completed = false, dispatched = false;
    let retrySafe=false;
    const tools=new Map<string,any>();
    const eventsStop = new AbortController(); let eventTask: Promise<void> | undefined;
    try {
      service = await this.launcher(choice.opencode.executable, workspace, signal, path.join(state.config.runtimeDir, 'opencode', state.id, 'execution'));
      const discovery = await executionModels(service, workspace, signal);
      const model = discovery.providers.find(p => p.id === choice.opencode.providerID)?.models.find(m => m.id === choice.opencode.modelID);
      if (!discovery.available || model?.capabilities.tools !== true || model.capabilities.structuredOutput !== true) throw new FlowError('supervisor', discovery.reason || 'OpenCode execution model unavailable or lacks tools/structured output');
      if (choice.opencode.variant && !model.reasoningEfforts?.includes(choice.opencode.variant)) throw new FlowError('supervisor','OpenCode reasoning variant unavailable; refresh model selection');
      const parts=opencodeParts(prompt,runAttachments(state,store),model.capabilities.images);
      const client = service.client, options = { signal, throwOnError: true as const };
      const owner = `PersonalAgent:${state.id}:execution:${workspace}`;
      if (state.executionSession) {
        sessionID = state.executionSession.sessionId;
        const session = await client.session.get({ sessionID, directory: workspace }, options);
        if (session.data?.directory !== workspace || session.data.title !== owner || JSON.stringify(session.data.permission) !== JSON.stringify(executionPermissions)) throw new FlowError('safety', 'OpenCode remote Execution Session ownership/permissions mismatch');
        const status = await client.session.status({ directory: workspace }, options);
        if (!status.data || Array.isArray(status.data) || typeof status.data !== 'object' || status.data[sessionID] && status.data[sessionID]?.type !== 'idle') throw new FlowError('interrupted', 'OpenCode Execution Session not confirmed idle; manual recovery required');
      } else {
        const session = await client.session.create({ directory: workspace, title: owner, permission: executionPermissions }, options);
        if (!session.data?.id || session.data.directory !== workspace || session.data.title !== owner || JSON.stringify(session.data.permission) !== JSON.stringify(executionPermissions)) throw new FlowError('safety', 'OpenCode created Execution Session ownership/permissions mismatch');
        sessionID = session.data.id;
        state.executionSession = { backend: 'opencode', ...{ providerID: choice.opencode.providerID, modelID: choice.opencode.modelID }, sessionId: sessionID, runId: state.id, workspace, directory: workspace };
        assertExecutionState(state); store.save(state);
      }
      store.audit('opencode-execution-session', { ...state.executionSession, role: 'execution', phase: 'execute', resumed: observation.usage.resumed });
      let readyResolve!: () => void, readyReject!: (error: Error) => void;
      const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
      const consumePart = (part: any) => {
        if(part.type==='tool')tools.set(part.id,part);
        for (const activity of opencodePublicEvents({ directory: workspace, payload: { properties: { part } } }, workspace, sessionID!)) {
          record({ ...activity, text: JSON.stringify({ role: 'execution', phase: 'execute', sessionId: sessionID, runId: state.id, taskId: task.id, providerID: choice.opencode.providerID, modelID: choice.opencode.modelID, receipt: activity.kind === 'tool' ? JSON.parse(activity.text) : activity.text }) });
        }
        if (part.sessionID === sessionID) {opencodeGuidanceBoundary(part);observation.observeOpencodePart(part);}
      };
      const stream = await client.global.event({ signal: AbortSignal.any([eventsStop.signal, signal]), sseMaxRetryAttempts: 0, fetch: async input => {
        try { const response = await (service!.fetch ?? fetch)(input, { redirect: 'error' }); if (!response.ok) throw new Error('OpenCode execution event subscription failed'); readyResolve(); return response; }
        catch { const error = new Error('OpenCode execution event subscription failed'); readyReject(error); throw error; }
      } });
      eventTask = (async () => { for await (const event of stream.stream) {
        const e = event as any;
        if (e.directory !== workspace) continue;
        const part = e.payload?.properties?.part;
        if (part?.sessionID === sessionID) consumePart(part);
        const info = e.payload?.properties?.info;
        if (info?.sessionID === sessionID) observation.observeOpencodeMessage(info);
      } })(); eventTask.catch(() => {});
      await ready;
      state.executionAttempt = { loop: state.loops, taskId: task.id, status: 'running' }; store.save(state); dispatched = true;
      store.audit('opencode-execute-dispatch', { callId: observation.usage.callId, runId: state.id, taskId: task.id, loop: state.loops, workspace, sessionId: sessionID, providerID: choice.opencode.providerID, modelID: choice.opencode.modelID, role: 'execution', mode: state.config.mode });
      const response = await Promise.race([
        client.session.prompt({ sessionID, directory: workspace, agent: 'build', model: { providerID: choice.opencode.providerID, modelID: choice.opencode.modelID }, ...(choice.opencode.variant ? {variant:choice.opencode.variant}:{}), system: agentRules + interactionAgentRules + ' 你是执行者，仅实施 Controller 派发的当前任务；不能更改 Plan、角色配置或执行历史已完成任务。工作目录绑定当前 workspace；禁止后台写入进程。', format: { type: 'json_schema', schema: nativeResultSchema, retryCount: 0 }, parts }, options),
        eventTask.then(() => { throw new FlowError('interrupted', 'OpenCode Execute event stream ended before confirmed result'); })
      ]);
      const data = response.data;
      if (!data || data.info.sessionID !== sessionID || data.info.role !== 'assistant' || data.info.path?.cwd !== workspace || data.info.providerID !== choice.opencode.providerID || data.info.modelID !== choice.opencode.modelID) throw new FlowError('safety', 'OpenCode Execute response Session/workspace/model mismatch');
      for (const part of data.parts ?? []) { if (part.sessionID !== sessionID) throw new FlowError('safety', 'OpenCode Execute part Session mismatch'); consumePart(part); }
      observation.observeOpencodeMessage(data.info);
      if (data.info.error) throw providerFailure(data.info.error, 'executor');
      if (!data.info.finish || !['stop','tool-calls'].includes(data.info.finish) || data.parts.some(part => part.type === 'tool' && ['pending','running'].includes(part.state.status))) throw new FlowError('interrupted', 'OpenCode Execute lacks confirmed terminal result');
      const output = validate<NativeResult>(nativeResultSchema, data.info.structured);
      const status = await client.session.status({ directory: workspace }, options);
      if (!status.data || Array.isArray(status.data) || typeof status.data !== 'object' || status.data[sessionID] && status.data[sessionID]?.type !== 'idle') throw new FlowError('interrupted', 'OpenCode Execute has no idle Session confirmation');
      signal.throwIfAborted(); assertExecutionState(state);
      if (JSON.stringify(store.load().tasks) !== JSON.stringify(state.tasks)) throw new FlowError('safety', 'Controller Plan changed during Execute');
      state.executionAttempt.status = 'success'; state.executorExitCode = 0; store.save(state); completed = true;
      return output;
    } catch (error) {
      if (service && sessionID && dispatched) {
        let idle=false;
        try {
          const cleanupSignal=AbortSignal.timeout(5000);
          await service.client.session.abort({ sessionID, directory: workspace }, { signal: cleanupSignal, throwOnError: true });
          while(!cleanupSignal.aborted){
            const status=await service.client.session.status({directory:workspace},{signal:cleanupSignal,throwOnError:true});
            if(status.data&&!Array.isArray(status.data)&&(!status.data[sessionID]||status.data[sessionID]?.type==='idle')){idle=true;break;}
            await new Promise(resolve=>setTimeout(resolve,25));
          }
        } catch { store.audit('opencode-execute-abort-incomplete', { sessionId: sessionID }); }
        if(!idle){blockGuidanceHandoff('OpenCode 执行调用退出未确认；保留现场，不能并发派发下一调用');throw new FlowError('interrupted','OpenCode Execute idle state unknown; manual recovery required');}
        if([...tools.values()].some(part=>part.tool!=='StructuredOutput'&&(['pending','running'].includes(part.state.status)||part.state.metadata?.interrupted)))throw new FlowError('interrupted','OpenCode tool results are unknown; manual recovery required');
        retrySafe=['transport','timeout'].includes(classifyFailure(error,'execute').kind)||timeout.aborted;
      }
      store.audit('opencode-execute-error', { callId: observation.usage.callId, sessionId: sessionID, taskId: task.id, message: redact((error as Error).message), interrupted: signal.aborted, ...transportErrorDetails(error) });
      if (timeout.aborted) throw new FlowError('timeout', `OpenCode Execute Timeout after ${state.config.timeoutMs} ms`);
      if (externalSignal.aborted) throw new Error('Stopped');
      const failure=error instanceof FlowError?error:providerFailure(error,'supervisor');
      throw new FlowError(failure.kind,redact(failure.message));
    } finally {
      eventsStop.abort(); await eventTask?.catch(() => {});
      try {
        await service?.close();
        if(retrySafe&&!externalSignal.aborted)store.audit('opencode-execute-retry-safe',{loop:state.loops,sessionId:sessionID,taskId:task.id,note:'Session idle, tool results terminal, owned process closed; inspect existing results before retry'});
        if (completed) store.audit('opencode-execute-exit', { callId: observation.usage.callId, sessionId: sessionID, taskId: task.id, exitCode: 0, mode: state.config.mode });
      }
      catch {
        blockGuidanceHandoff('OpenCode 执行进程退出未确认；保留现场');
        completed = false;
        store.audit('opencode-execute-exit-unconfirmed', { callId: observation.usage.callId, sessionId: sessionID, taskId: task.id });
        throw new FlowError('supervisor', 'OpenCode Execute process exit unconfirmed; manual recovery required');
      }
      finally {
        if (dispatched && !completed) { state.executionAttempt!.status = signal.aborted ? 'interrupted' : 'failed'; state.executorExitCode = -1; store.save(state); }
        observation.finish(completed ? 'success' : signal.aborted ? 'interrupted' : 'failed');
      }
    }
  }
}
