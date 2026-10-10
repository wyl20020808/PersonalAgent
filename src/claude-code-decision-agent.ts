import { nativeAgentEnv } from './workspace.js';
import { agentRules } from './native-agent.js';
import { runProcess } from './process.js';
import { validate, type Config } from './schema.js';
import type { State, Store } from './store.js';
import { recordClaudeCall } from './agent-usage.js';
import { FlowError, classifyFailure } from './failure.js';
import { activityRecorder, claudePublicEvents } from './telemetry.js';
import { CallObservation } from './call-observation.js';

import { assertDecisionRequest, bindDecisionSession, type DecisionAgent, type DecisionRequest, type DecisionResult } from './decision-agent.js';
export class ClaudeCodeDecisionAgent implements DecisionAgent {
  constructor(readonly config: Config, private readonly run: typeof runProcess = runProcess) {}
  async structured<T>(request: DecisionRequest): Promise<DecisionResult<T>> {
    assertDecisionRequest(request);
    const {state, store, signal, schema, prompt, role, context} = request;
    const env = nativeAgentEnv();
    const streaming = this.config.claudeStreaming !== false;
    const args = ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--permission-mode', 'bypassPermissions', '--system-prompt-snapshot', 'off', '--append-system-prompt', agentRules];
    if (this.config.decisionAgent?.backend === 'claude-code' && this.config.decisionAgent.model) args.push('--model', this.config.decisionAgent.model);
    const resumed = !!state.claudeSessionId;
    if (state.claudeSessionId) args.push('--resume', state.claudeSessionId);
    else { state.claudeSessionId = crypto.randomUUID(); store.save(state); args.push('--session-id', state.claudeSessionId); }
    const call = recordClaudeCall(state, store, role);
    const observation = new CallObservation(state, store, role, prompt, context, resumed);
    let completed = false;
    try {
    const record = activityRecorder(state, store, 'claude', `claude:${call}`);
    let streamedResult: any; let characters = 0, lastProgress = 0;
    if (streaming) { args[args.indexOf('--output-format') + 1] = 'stream-json'; args.push('--verbose', '--include-partial-messages'); }
    const onLine = streaming ? (line: string) => {
      if (!line.trim()) return; const event = JSON.parse(line);
      observation.observe(event);
      if (event.type === 'result') { if (streamedResult) throw Error('Duplicate Claude final result'); streamedResult = event; }
      for (const activity of claudePublicEvents(event)) record(activity);
      const delta = event.event?.delta;
      if (event.type === 'stream_event' && ['text_delta', 'input_json_delta'].includes(delta?.type)) {
        characters += String(delta.text ?? delta.partial_json ?? '').length;
        if (Date.now() - lastProgress > 1000) { lastProgress = Date.now(); record({key: `delta:${characters}`, kind: 'receiving', title: 'Claude 输出接收中', text: `已接收 ${characters} 个公开文本或结构化字符；尚未通过 Schema 校验`}); }
      }
    } : undefined;
    const result = await this.run(this.config.claudeExecutable, args, { cwd: state.workspace, env, signal, timeoutMs: state.config.timeoutMs, input: prompt, onLine, streamOutput: streaming });
    let envelope: { is_error?: boolean; session_id?: string; structured_output?: unknown; result?: string; errors?: string[] };
    try { const parsed=streamedResult ?? JSON.parse(streaming ? result.stdout.trim().split(/\r?\n/).at(-1)! : result.stdout);if(streaming&&parsed.type!=='result')throw Error('Missing Claude final result');envelope=parsed; }
    catch { throw new Error(`Claude exited ${result.exitCode} with invalid JSON: ${result.stderr.slice(0, 1000)}`); }
    if (!streaming) observation.observe(envelope);
    store.audit('claude-exit', { call, callId: observation.usage.callId, role, exitCode: result.exitCode, sessionId: envelope.session_id ?? state.claudeSessionId });
    if (result.exitCode !== 0 || envelope.is_error) {
      const message = `Claude exited ${result.exitCode}: ${envelope.errors?.join('; ') || envelope.result || result.stderr.slice(0, 1000) || 'API error without message'}`;
      const classified = classifyFailure(new Error(message), role); throw new FlowError(classified.kind === 'unknown' ? 'supervisor' : classified.kind, message);
    }
    if (envelope.session_id) state.claudeSessionId = envelope.session_id;
    store.save(state);
    const output = validate<T>(schema, envelope.structured_output); completed = true; bindDecisionSession(state, store, state.claudeSessionId!); return { output, sessionId: state.claudeSessionId!, usage: observation.usage };
    } finally { observation.finish(completed ? 'success' : signal.aborted ? 'interrupted' : 'failed'); }
  }
}
