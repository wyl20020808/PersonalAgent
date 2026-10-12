import {runAttachments} from './multimodal.js';
import { fileURLToPath } from 'node:url';
import { assertDecisionRequest, bindDecisionSession, type DecisionAgent, type DecisionRequest, type DecisionResult } from './decision-agent.js';
import { CallObservation } from './call-observation.js';
import { FlowError, classifyFailure } from './failure.js';
import { runProcess } from './process.js';
import { validate, type Config } from './schema.js';
import { activityRecorder, redact } from './telemetry.js';
import { agentRules } from './native-agent.js';
import { assertOperationPolicy, interactionAgentRules } from './interaction-policy.js';
import { nativeAgentEnv } from './workspace.js';
import {DiscussionStream} from './discussion-stream.js';
import { codexGuidanceBoundary } from './guidance-handoff.js';
import {observeCodexImages} from './codex-images.js';

export class CodexDecisionAgent implements DecisionAgent {
  constructor(readonly config: Config, private readonly run: typeof runProcess = runProcess) {}
  async structured<T>(request: DecisionRequest): Promise<DecisionResult<T>> {
    assertOperationPolicy({ kind: 'model' });
    assertDecisionRequest(request);
    const { state, store, role, prompt, schema, signal, context } = request;
    if (state.decisionAgent?.backend !== 'codex') throw new FlowError('safety', 'Codex Decision backend mismatch');
    const threadId = state.decisionSession?.sessionId ?? null;
    const scope = { runId: request.runId, workspace: request.workspace, role,
      participantId: store.decisionParticipant?.participantId ?? null,
      discussionStage: store.decisionParticipant?.discussionStage ?? null };
    state.claudeCalls = (state.claudeCalls ?? 0) + 1; store.save(state);
    const observation = new CallObservation(state, store, role, prompt, context, !!threadId, 'codex');
    const pendingTools=new Set<string>();
    const record = activityRecorder(state, store, 'codex', observation.usage.callId, role);
    const discussionStream=new DiscussionStream(request.onPublicProgress);
    store.audit('codex-decision-call-start', { ...scope, callId: observation.usage.callId, call: state.claudeCalls, threadId, configuredModel: state.decisionAgent.model ?? null });
    let output: unknown, seenResult = false, ownedThread: string | null = null, completed = false, turnCompleted = false;
    const images=observeCodexImages(request.workspace,()=>ownedThread,record);
    try {
      const result = await this.run(request.nodeExecutable??process.execPath, [fileURLToPath(new URL('./codex-decision-worker.js', import.meta.url))], {
        cwd: store.dir, env: nativeAgentEnv(), signal, interaction: { kind: 'model' }, timeoutMs: request.timeoutMs, streamOutput: true,
        input: JSON.stringify({ ...scope, participantId: scope.participantId ?? undefined, discussionStage: scope.discussionStage ?? undefined,
          threadId, readOnly: request.readOnly, attachments:runAttachments(state,store), model: state.decisionAgent.model, reasoningEffort: state.decisionAgent.reasoningEffort, schema, prompt: JSON.stringify({ ...JSON.parse(prompt), rules: agentRules + interactionAgentRules,
            decisionPermissions: request.readOnly ? 'Current mode is read-only discussion: inspect and return the requested structured result without changing project files.' : 'Current mode is authorized development: choose native inspection, verification, direct repair or delegation as needed. Return the requested structured result; respect project scope, interaction policy and delivery authorization.' }) }),
        onLine(line) {
          if (!line.trim()) return;
          const event = JSON.parse(line);
          if (JSON.stringify(event.scope) !== JSON.stringify(scope)) throw new FlowError('safety', 'Codex Decision worker scope mismatch');
          if (seenResult) throw Error('Codex Decision event after result');
          if (event.type === 'thread') {
            if (ownedThread || typeof event.id !== 'string' || !event.id.trim() || (threadId && threadId !== event.id) || event.id === state.codexThreadId) throw new FlowError('safety', 'Codex Decision Thread ownership mismatch');
            ownedThread = event.id; bindDecisionSession(state, store, event.id);
            images.poll();
            store.audit('codex-decision-thread', { ...scope, callId: observation.usage.callId, sessionId: event.id, resumed: !!threadId });
          } else {
            if (!ownedThread) throw new FlowError('safety', 'Codex Decision event without owned Thread');
            if (event.type === 'observation') { const data=event.data;if(data?.item&&['command_execution','file_change','mcp_tool_call'].includes(data.item.type)){if(data.type==='item.completed')pendingTools.delete(data.item.id);else pendingTools.add(data.item.id);}discussionStream.codex(event.data);codexGuidanceBoundary(event.data); if (event.data?.type === 'turn.completed') { if (turnCompleted) throw Error('Duplicate Codex Decision completed turn'); turnCompleted = true; } observation.observe(event.data); }
            else if (event.type === 'activity') {record(event.data);if(event.data?.kind==='output')discussionStream.text(event.data.streamId??'codex',event.data.text??'');}
            else if (event.type === 'result') { seenResult = true; output = event.data; }
            else throw Error('Unexpected Codex Decision worker protocol');
          }
        }
      });
      store.audit('codex-decision-exit', { ...scope, callId: observation.usage.callId, sessionId: ownedThread, exitCode: result.exitCode, stderr: redact(result.stderr).slice(0, 2000) });
      if (result.exitCode !== 0) throw Error(`Codex Decision SDK worker exited ${result.exitCode}: ${redact(result.stderr).slice(0, 1500)}`);
      signal.throwIfAborted();
      if (!seenResult || !ownedThread || !turnCompleted) throw Error('Codex Decision missing owned structured result');
      const validated = validate<T>(schema, output); completed = true;
      return { output: validated, sessionId: ownedThread, usage: observation.usage };
    } catch (error) {
      if(pendingTools.size&&['transport','timeout'].includes(classifyFailure(error,role).kind))throw new FlowError('interrupted','Codex tool results are unknown; manual recovery required');
      if (error instanceof FlowError) throw error;
      const classified = classifyFailure(error, role);
      throw new FlowError(classified.kind === 'unknown' || classified.kind === 'validation' || classified.kind === 'executor' ? 'supervisor' : classified.kind, (error as Error).message);
    } finally { images.finish();observation.finish(completed ? 'success' : signal.aborted ? 'interrupted' : 'failed'); }
  }
}
