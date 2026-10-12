import { nativeAgentEnv } from './workspace.js';
import {DiscussionStream} from './discussion-stream.js';
import { realpathSync, readFileSync } from 'node:fs';
import { assertOperationPolicy, interactionAgentRules } from './interaction-policy.js';
import { fileURLToPath } from 'node:url';
import { agentRules } from './native-agent.js';
import { runProcess } from './process.js';
import { nativeResultSchema, validate, type Config, type NativeResult } from './schema.js';
import { assertExecutionState, type ExecutionAgent } from './opencode-execution-agent.js';
import type { State, Store } from './store.js';
import { recordClaudeCall } from './agent-usage.js';
import { FlowError, classifyFailure } from './failure.js';
import { activityRecorder, claudePublicEvents } from './telemetry.js';
import { CallObservation } from './call-observation.js';
import { contextLimits } from './model-context.js';
import {runAttachments,claudeInput} from './multimodal.js';
import {guidanceTool} from './guidance-handoff.js';

import { assertDecisionRequest, bindDecisionSession, type DecisionAgent, type DecisionRequest, type DecisionResult } from './decision-agent.js';
export class ClaudeCodeDecisionAgent implements DecisionAgent {
  constructor(readonly config: Config, private readonly run: typeof runProcess = runProcess) {}
  async structured<T>(request: DecisionRequest): Promise<DecisionResult<T>> {
    assertDecisionRequest(request);
    return this.invoke<T>(request);
  }
  protected async invoke<T>(request: Omit<DecisionRequest, 'role' | 'phase'> & { role: 'plan' | 'review' | 'execute' }): Promise<DecisionResult<T>> {
    assertOperationPolicy({ kind: 'model' });
    const {state, store, signal, schema, prompt, role, context} = request;
    const execution = role === 'execute';
    const sessionKey = execution ? 'claudeExecutionSessionId' : 'claudeSessionId';
    const bind = (id: string) => {
      if (id !== state[sessionKey]) throw new FlowError('safety', 'Claude Session ownership mismatch');
      if (execution) {
        const choice = state.config.executionAgent;
        if (choice?.backend !== 'claude-code') throw new FlowError('safety', 'Claude execution backend mismatch');
        const directory = realpathSync(state.workspace);
        state.executionSession = { backend: 'claude-code', ...(choice.model ? { model: choice.model } : {}), sessionId: id, runId: state.id, workspace: directory, directory };
        assertExecutionState(state, this.config); store.save(state);
      } else bindDecisionSession(state, store, id);
    };
    const env = nativeAgentEnv();
    // Native compaction keeps the same Session and tool history. This changes only
    // the child invocation, never the user's CLI settings or stored transcripts.
    const limits = contextLimits(state, store, execution ? 'execution' : 'decision');
    if (limits.compactAt) env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(limits.compactAt);
    const attachments=runAttachments(state,store);
    const input=attachments.length?claudeInput(prompt,attachments):prompt;
    // All new invocations stream, including Runs saved with the legacy false flag.
    // Keep that field/envelope readable without rewriting historical configuration.
    const streaming = true;
    const args = ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--permission-mode', 'bypassPermissions', '--system-prompt-snapshot', 'off', '--append-system-prompt', agentRules + interactionAgentRules + (execution ? ' 当前角色为执行者：仅实施 Controller 已校验的当前任务，使用原生工具修改并验证；不得更改 Plan、角色配置或重放已完成任务。' : '')];
    args.push('--autocompact', limits.compactAt ? String(limits.compactAt) : 'auto');
    if (request.readOnly) args.push('--tools', 'Read,Glob,Grep', '--strict-mcp-config', '--mcp-config', JSON.stringify({mcpServers:{}}));
    // Invocation-local settings preserve the user's files and existing hooks.
    const hookScript = fileURLToPath(new URL('../scripts/codex-interaction-hook.js', import.meta.url));
    args.push('--settings', JSON.stringify({ disableAllHooks: false, hooks: { PreToolUse: [{ matcher: '', hooks: [{ type: 'command', command: `"${request.nodeExecutable??process.execPath}" "${hookScript}"`, timeout: 5 }] }] } }));
    const choice = execution ? this.config.executionAgent : this.config.decisionAgent;
    if (choice?.backend === 'claude-code' && choice.model) args.push('--model', choice.model);
    if (choice?.backend === 'claude-code' && choice.reasoningEffort) args.push('--effort', choice.reasoningEffort);
    const resumed = !!state[sessionKey];
    let confirmed = execution ? !!state.executionSession : !!state.decisionSession;
    if (state[sessionKey]) args.push('--resume', state[sessionKey]!);
    else { state[sessionKey] = crypto.randomUUID(); store.save(state); args.push('--session-id', state[sessionKey]!); }
    const call = recordClaudeCall(state, store, role);
    const observation = new CallObservation(state, store, role, prompt, context, resumed, 'claude');
    let completed = false, transportFailed = false;
    const record = activityRecorder(state, store, 'claude', `claude:${execution ? 'execute:' : ''}${call}`, role);
    let discussionStream:DiscussionStream|undefined;
    try {
    let publicSequence=0,publicReply='';
    discussionStream=new DiscussionStream(progress=>{request.onPublicProgress?.(progress);if(progress.reply!==undefined){publicReply=progress.reply;if(publicReply)record({key:'public-stream:'+ ++publicSequence,streamId:'public-answer',kind:'output',title:'Claude 正在回复',text:publicReply});}},100);
    let streamedResult: any; let characters = 0, lastProgress = 0;
    const pendingTools = new Set<string>();
    if (streaming) { args[args.indexOf('--output-format') + 1] = 'stream-json'; args.push('--verbose', '--include-partial-messages'); }
    if(attachments.length)args.push('--input-format','stream-json');
    const onLine = streaming ? (line: string) => {
      if (!line.trim()) return; const event = JSON.parse(line);
      if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
        bind(event.session_id); confirmed = true;
      }
      for (const block of event.message?.content ?? []) {
        if (block.type === 'tool_use') {pendingTools.add(block.id);guidanceTool('claude:'+block.id,true);}
        if (block.type === 'tool_result') {pendingTools.delete(block.tool_use_id);guidanceTool('claude:'+block.tool_use_id,false);}
      }
      observation.observe(event);
      discussionStream!.claude(event);
      if(event.type==='assistant'||event.type==='result')discussionStream!.flush();
      if (event.type === 'result') { if (streamedResult) throw Error('Duplicate Claude final result'); streamedResult = event; }
      for (const activity of claudePublicEvents(event)) record(activity.kind==='output'&&event.type==='assistant'&&publicReply?{...activity,text:publicReply,streamId:'public-answer'}:activity);
      const delta = event.event?.delta;
      if (event.type === 'stream_event' && ['text_delta', 'input_json_delta'].includes(delta?.type)) {
        characters += String(delta.text ?? delta.partial_json ?? '').length;
        if (Date.now() - lastProgress > 1000) { lastProgress = Date.now(); record({key: `delta:${characters}`, kind: 'receiving', title: 'Claude 输出接收中', text: `已接收 ${characters} 个公开文本或结构化字符；尚未通过 Schema 校验`}); }
      }
    } : undefined;
    const result = await this.run(this.config.claudeExecutable, args, { cwd: state.workspace, env, signal, interaction: { kind: 'model' }, timeoutMs: state.config.timeoutMs, input, onLine, streamOutput: streaming }).catch(error=>{
      if(['transport','timeout'].includes(classifyFailure(error,role).kind)&&(!streaming||pendingTools.size))throw new FlowError('interrupted','Claude tool results are unknown; manual recovery required');
      throw error;
    });
    let envelope: { is_error?: boolean; session_id?: string; structured_output?: unknown; result?: string; errors?: string[] },legacyEnvelope=false;
    try { const parsed=streamedResult ?? JSON.parse(streaming ? result.stdout.trim().split(/\r?\n/).at(-1)! : result.stdout);legacyEnvelope=this.config.claudeStreaming===false&&parsed.type===undefined&&(parsed.structured_output!==undefined||typeof parsed.is_error==='boolean');if(streaming&&parsed.type!=='result'&&!legacyEnvelope)throw Error('Missing Claude final result');envelope=parsed; }
    catch {
      if (['transport','timeout'].includes(classifyFailure(new Error(result.stderr), role).kind)) {
        if (!streaming || pendingTools.size) throw new FlowError('interrupted', 'Claude tool results are unknown; manual recovery required');
        throw new FlowError(classifyFailure(new Error(result.stderr),role).kind, `Claude exited ${result.exitCode}: ${result.stderr.slice(0,1000)}`);
      }
      throw new Error(`Claude exited ${result.exitCode} with invalid JSON: ${result.stderr.slice(0, 1000)}`);
    }
    if (!streaming||legacyEnvelope) observation.observe(envelope);
    if(envelope.structured_output&&typeof envelope.structured_output==='object')discussionStream!.json(JSON.stringify(envelope.structured_output));
    if (envelope.session_id) {
      bind(envelope.session_id); confirmed = true;
    }
    if (execution) { state.executorExitCode = result.exitCode; store.save(state); }
    store.audit('claude-exit', { call, callId: observation.usage.callId, role, exitCode: result.exitCode, sessionId: envelope.session_id ?? state[sessionKey] });
    if (result.exitCode !== 0 || envelope.is_error) {
      const message = `Claude exited ${result.exitCode}: ${envelope.errors?.join('; ') || envelope.result || result.stderr.slice(0, 1000) || 'API error without message'}`;
      if (['transport','timeout'].includes(classifyFailure(new Error(message), role).kind) && (!streaming || legacyEnvelope || pendingTools.size))
        throw new FlowError('interrupted', 'Claude tool results are unknown; manual recovery required');
      const classified = classifyFailure(new Error(message), role); throw new FlowError(classified.kind === 'unknown' ? execution ? 'executor' : 'supervisor' : classified.kind, message);
    }
    store.save(state);
    if (execution && (!confirmed || pendingTools.size)) throw new FlowError('interrupted', 'Claude Execute lacks confirmed Session or terminal tool results');
    const output = validate<T>(schema, envelope.structured_output); bind(state[sessionKey]!); completed = true; return { output, sessionId: state[sessionKey]!, usage: observation.usage };
    } catch (error) { transportFailed = classifyFailure(error, role).kind === 'transport'; throw error; }
    finally {
      discussionStream?.flush();
      record.flush();
      observation.finish(completed ? 'success' : signal.aborted ? 'interrupted' : 'failed');
      // A reserved UUID is not a confirmed CLI Session. Keep its invocation in
      // audit history, but do not leave a bogus --resume target after pre-init failure.
      if (!resumed && !confirmed && !completed && (transportFailed || execution || signal.aborted)) { state[sessionKey] = null; store.save(state); }
    }
  }
}

/** Reuses the CLI protocol while keeping Execute ownership separate from Plan/Review. */
export class ClaudeCodeExecutionAgent extends ClaudeCodeDecisionAgent implements ExecutionAgent {
  async execute(state: State, store: Store, signal: AbortSignal, prompt: string, context?: Record<string, any>): Promise<NativeResult> {
    assertExecutionState(state, this.config);
    const task = state.tasks[state.taskIndex], persisted = store.load();
    if (state.config.executionAgent?.backend !== 'claude-code' || state.phase !== 'executing' || !state.nativeExecution || !task || state.discussion && !state.discussion.closed || state.completedTaskIds?.includes(task.id)) throw new FlowError('safety', 'Claude Execute requires Controller-validated pending native task');
    if (store.id !== state.id || persisted.id !== state.id || persisted.phase !== state.phase || persisted.workspace !== state.workspace || persisted.loops !== state.loops || JSON.stringify(persisted.tasks) !== JSON.stringify(state.tasks) || JSON.stringify(persisted.config) !== JSON.stringify(state.config)) throw new FlowError('safety', 'Claude Execute persisted Run/Plan/workspace mismatch');
    const source = realpathSync(state.source), workspace = realpathSync(state.workspace);
    if (!state.config.allowedRepositories.some(directory => realpathSync(directory) === source) || workspace !== (state.config.projectMode === 'direct' ? source : realpathSync(store.file('workspace'))) || state.config.projectMode === 'direct' && (!state.config.directAuthorization?.acknowledgedAt || realpathSync(state.config.directAuthorization.projectPath) !== source)) throw new FlowError('safety', 'Claude Execute workspace authorization mismatch');
    if (state.executionAttempt) {
      if (state.executionAttempt.status !== 'success') {
        const events = readFileSync(store.file('audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
        let last = -1;
        events.forEach((e, index) => { if (e.event === 'claude-execute-dispatch' || e.event === 'opencode-execute-dispatch') last = index; });
        const following=events.slice(last+1);
        const safeIndex=following.findIndex(e=>e.event==='claude-execute-retry-safe'&&e.data.loop===state.loops&&e.data.sessionId===state.executionSession?.sessionId);
        const automatic=state.executionAttempt.loop===state.loops&&safeIndex>=0&&following.slice(safeIndex+1).some(e=>e.event==='transport-recovery-start'&&e.data.role==='execute'&&e.data.sessionId===state.executionSession?.sessionId);
        const guided=following.some(e=>e.event==='guidance-interrupted'&&e.data.loop===state.executionAttempt!.loop)&&following.some(e=>e.event==='guidance-applied');
        if(state.executionAttempt.loop===state.loops&&!automatic)throw new FlowError('interrupted', 'Execute attempt already dispatched; require Controller recovery, never replay');
        if (last < 0 || !following.some(e => e.event === 'human-decision' || e.event === 'automatic-decision' && ['transport','timeout','executor','supervisor'].includes(e.data?.failureKind))&&!guided&&!automatic) throw new FlowError('interrupted', 'Unknown or failed Execute status requires explicit human recovery');
      } else if(state.executionAttempt.loop===state.loops){
        throw new FlowError('interrupted', 'Execute attempt already dispatched; require Controller recovery, never replay');
      }
    }
    if (state.claudeExecutionSessionId && [state.claudeSessionId, state.decisionSession?.sessionId, ...state.discussion?.participants.map(p => p.session?.sessionId) ?? []].includes(state.claudeExecutionSessionId)) throw new FlowError('safety', 'Claude execution cannot share a Decision Session');
    signal.throwIfAborted();
    state.executionAttempt = { loop: state.loops, taskId: task.id, status: 'running' }; store.save(state);
    store.audit('claude-execute-dispatch', { role: 'execute', taskId: task.id, loop: state.loops, configuredModel: state.config.executionAgent.model ?? null });
    try {
      const result = await this.invoke<NativeResult>({ state, store, signal, prompt, context, role: 'execute', schema: nativeResultSchema, workspace, runId: state.id, taskId: task.id, timeoutMs: state.config.timeoutMs });
      signal.throwIfAborted(); assertExecutionState(state, this.config);
      state.executionAttempt.status = 'success'; state.executorExitCode = 0; store.save(state);
      return result.output;
    } catch (error) {
      if(!signal.aborted&&['transport','timeout'].includes(classifyFailure(error,'execute').kind))store.audit('claude-execute-retry-safe',{loop:state.loops,sessionId:state.executionSession?.sessionId,taskId:task.id,note:'Owned process ended and streaming tool results known'});
      state.executionAttempt.status = signal.aborted ? 'interrupted' : 'failed'; state.executorExitCode = -1; store.save(state); throw error;
    }
  }
}
