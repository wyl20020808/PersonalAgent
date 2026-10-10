import { realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { decisionIdentity, assertDecisionState, type DecisionSession } from './decision-agent.js';
import { planSchema, validate, type DecisionChoice, type DecisionDiscussion, type Plan } from './schema.js';
import { Store, type State } from './store.js';
import { FlowError, classifyFailure } from './failure.js';
import { redact } from './telemetry.js';

export type DiscussionStage = 'draft' | 'discussion' | 'synthesis' | 'replan' | 'review';
export interface DiscussionOpinion { summary: string; disagreements: string[]; amendments: string[] }
export const opinionSchema = { type: 'object', additionalProperties: false, required: ['summary', 'disagreements', 'amendments'], properties: {
  summary: { type: 'string', minLength: 1, maxLength: 100000 },
  disagreements: { type: 'array', maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 10000 } },
  amendments: { type: 'array', maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 10000 } }
} };
export interface DiscussionParticipant { id: 'a' | 'b'; agent: DecisionChoice; session?: DecisionSession; claudeSessionId: string | null; calls: number }
export interface DiscussionStep { key: string; participantId: 'a' | 'b'; stage: DiscussionStage; status: 'running' | 'success' | 'failed' | 'interrupted'; output?: Plan | DiscussionOpinion; error?: string }
export interface DiscussionState { config: DecisionDiscussion; participants: DiscussionParticipant[]; steps: DiscussionStep[]; closed: boolean }
export function initializeDiscussion(state: State): void {
  if (!state.config.decisionDiscussion) return;
  state.discussion = { config: structuredClone(state.config.decisionDiscussion), participants: state.config.decisionDiscussion.participants.map(p => ({ ...structuredClone(p), claudeSessionId: null, calls: 0 })), steps: [], closed: false };
}
export function assertDiscussion(state: State): void {
  const discussion = state.discussion;
  if (!state.config.decisionDiscussion && !discussion) return;
  if (!discussion || JSON.stringify(discussion.config) !== JSON.stringify(state.config.decisionDiscussion) ||
      JSON.stringify(discussion.participants.map(({ id, agent }) => ({ id, agent }))) !== JSON.stringify(discussion.config.participants)) throw new FlowError('safety', 'Immutable discussion participants/configuration mismatch');
  for (const participant of discussion.participants) {
    const view = participantView(state, participant);
    assertDecisionState(view);
  }
  const sessions = discussion.participants.flatMap(p => p.session ? [`${p.session.backend}:${p.session.sessionId}`] : p.claudeSessionId ? [`claude-code:${p.claudeSessionId}`] : []);
  if (new Set(sessions).size !== sessions.length) throw new FlowError('safety', 'Decision participants cannot share a Session');
}
export function assertDiscussionPlan(state: State, plan: Plan): void {
  const discussion = state.discussion;
  if (!discussion || discussion.closed) return;
  const expected = discussion.config.participants.map(p=>`draft:${p.id}`);
  if (discussion.config.rounds === 1) expected.push(...discussion.config.participants.map(p=>`discussion:${p.id}`));
  expected.push(`synthesis:${discussion.config.primary}`);
  if (discussion.steps.length !== expected.length || expected.some(key=>discussion.steps.filter(s=>s.key===key&&s.status==='success').length!==1) || JSON.stringify(discussion.steps.find(s=>s.key===`synthesis:${discussion.config.primary}`)?.output) !== JSON.stringify(plan)) throw new FlowError('supervisor', '双决策周期未完成或最终 Plan 与主决策者输出不一致；禁止 Execute。');
}
function participantView(state: State, participant: DiscussionParticipant): State {
  const { decisionDiscussion, ...config } = state.config;
  return { ...state, discussion: undefined, config: { ...config, decisionAgent: participant.agent }, decisionAgent: decisionIdentity({ ...config, decisionAgent: participant.agent }), decisionSession: participant.session, claudeSessionId: participant.claudeSessionId };
}
/** Existing adapters operate on one scoped identity. Only session/call mutations are
 * merged back into the real Run; all events receive immutable participant ownership.
 * Calls remain sequential under the Controller's Run and project locks. */
export async function withParticipant<T>(state: State, store: Store, id: 'a' | 'b', stage: DiscussionStage, operation: (view: State, scoped: Store) => Promise<T>): Promise<T> {
  assertDiscussion(state);
  const participant = state.discussion!.participants.find(p => p.id === id)!;
  const view = participantView(state, participant);
  let previousCalls = view.claudeCalls ?? 0;
  const metadata = { participantId: id, participantAgent: structuredClone(participant.agent), primary: state.discussion!.config.primary === id, discussionStage: stage, mode: state.config.mode };
  class ParticipantStore extends Store {
    override readonly decisionParticipant = { participantId: id, discussionStage: stage };
    override save(updated: State): void {
      const calls = updated.claudeCalls ?? 0;
      participant.calls += calls - previousCalls; previousCalls = calls;
      state.claudeCalls = calls;
      participant.claudeSessionId = updated.claudeSessionId;
      if (updated.decisionSession) participant.session = updated.decisionSession;
      if (metadata.primary) { state.claudeSessionId = participant.claudeSessionId; state.decisionSession = participant.session; }
      assertDiscussion(state); store.save(state);
    }
    override audit(event: string, data: any = {}): void { store.audit(event, { ...data, ...metadata }); }
  }
  const scoped = new ParticipantStore(state.config.runtimeDir, state.id);
  try { return await operation(view, scoped); }
  finally { scoped.save(view); }
}
export type DiscussionCall = (participant: 'a' | 'b', stage: DiscussionStage, schema: object, exchange?: object) => Promise<Plan | DiscussionOpinion>;
/** Only one initial collaborative cycle. Successful steps survive restart; retries
 * need the Controller's explicit resume decision. Replan is primary-only and labeled. */
export async function discussPlan(state: State, store: Store, signal: AbortSignal, call: DiscussionCall): Promise<Plan> {
  assertDiscussion(state);
  const discussion = state.discussion!;
  if (discussion.closed) {
    const output = validate<Plan>(planSchema, await call(discussion.config.primary, 'replan', planSchema));
    store.audit('discussion-replan-output', { participantId: discussion.config.primary, participantAgent: discussion.participants.find(p=>p.id===discussion.config.primary)!.agent, primary: true, discussionStage: 'replan', mode: state.config.mode, output });
    return output;
  }
  async function step(id: 'a' | 'b', stage: DiscussionStage, exchange?: object): Promise<Plan | DiscussionOpinion> {
    const key = `${stage}:${id}`;
    let saved = discussion.steps.find(s => s.key === key);
    if (saved?.status === 'success') return saved.output!;
    signal.throwIfAborted();
    if (!saved) { saved = { key, participantId: id, stage, status: 'running' }; discussion.steps.push(saved); }
    else { saved.status = 'running'; delete saved.error; }
    store.save(state);
    const participant = discussion.participants.find(p => p.id === id)!;
    const meta = { participantId: id, participantAgent: participant.agent, primary: id === discussion.config.primary, discussionStage: stage, mode: state.config.mode };
    store.audit('discussion-step-start', meta);
    try {
      const schema = stage === 'discussion' ? opinionSchema : planSchema;
      const output = validate<Plan | DiscussionOpinion>(schema, await call(id, stage, schema, exchange));
      signal.throwIfAborted();
      saved.output = output; saved.status = 'success'; store.save(state);
      store.audit('discussion-output', { ...meta, output });
      return output;
    } catch (error) {
      saved.status = signal.aborted ? 'interrupted' : 'failed'; saved.error = redact((error as Error).message); store.save(state);
      store.audit('discussion-step-failed', { ...meta, status: saved.status, error: saved.error });
      const failure = classifyFailure(error, 'planning');
      // A bad structured response can be explicitly retried; ownership/safety
      // failures keep the existing terminal guard instead of becoming recoverable.
      const kind = signal.aborted ? 'interrupted' : ['unknown','validation'].includes(failure.kind) ? 'supervisor' : failure.kind;
      throw new FlowError(kind, `决策者 ${id.toUpperCase()} ${stage} ${saved.status}: ${saved.error}。未形成最终计划；未降级或切换模型。`);
    }
  }
  // Initial drafts receive neither the peer's output nor prior discussion.
  const drafts: Record<string, Plan> = {};
  for (const participant of discussion.participants) drafts[participant.id] = await step(participant.id, 'draft') as Plan;
  const opinions: Record<string, DiscussionOpinion> = {};
  if (discussion.config.rounds === 1) for (const participant of discussion.participants) {
    const peer = discussion.participants.find(p => p.id !== participant.id)!;
    // Both see the same fixed drafts; B never receives A's round-one opinion.
    opinions[participant.id] = await step(participant.id, 'discussion', { ownDraft: drafts[participant.id], peer: peer.id, peerDraft: drafts[peer.id] }) as DiscussionOpinion;
  }
  return await step(discussion.config.primary, 'synthesis', { drafts, opinions, rounds: discussion.config.rounds }) as Plan;
}
export function mockParticipantSession(view: State, store: Store): void {
  view.claudeSessionId ??= `mock-${randomUUID()}`;
  view.claudeCalls = (view.claudeCalls ?? 0) + 1;
  const directory = realpathSync(view.workspace);
  view.decisionSession = { backend: view.decisionAgent!.backend, sessionId: view.claudeSessionId, runId: view.id, workspace: directory, directory };
  store.save(view); store.audit('mock-decision-call', { sessionId: view.decisionSession.sessionId, call: view.claudeCalls, note: '本地 Mock 适配器，没有真实模型调用' });
}
