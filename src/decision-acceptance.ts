import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { State, Store } from './store.js';
import { pendingGuidance, processingGuidance } from './steering.js';

// A decision receipt is distinct from user approval and from executed tests.
export function decisionAcceptanceDigest(state: State): string {
  return createHash('sha256').update(JSON.stringify({ runId: state.id, taskIndex: state.taskIndex, task: state.tasks[state.taskIndex], loop: state.loops, evidence: state.evidence && { ...state.evidence, decisionAccepted: undefined, userAccepted: undefined } })).digest('hex');
}

export function recordedPass(store: Store, state: State): boolean {
  let previous = '', taskIndex = -1, loop = -1, evidence: State['evidence'] = null, review: unknown;
  for (const line of readFileSync(store.file('audit.jsonl'), 'utf8').trim().split('\n')) {
    const { hash, ...record } = JSON.parse(line);
    if (record.previousHash !== previous || createHash('sha256').update(JSON.stringify(record)).digest('hex') !== hash) throw Error('Run audit chain invalid');
    previous = hash;
    if (record.event === 'transition') { taskIndex = record.data.taskIndex; loop = record.data.loops; }
    if (taskIndex !== state.taskIndex || loop !== state.loops) continue;
    if (record.event === 'review-evidence') { evidence = record.data; review = undefined; }
    if (record.event === 'review') review = record.data;
  }
  return state.evidence?.decisionReview?.verdict === 'pass' && JSON.stringify(review) === JSON.stringify(state.evidence.decisionReview) && evidence?.snapshotDigest === state.evidence.snapshotDigest && evidence?.head === state.evidence.head && evidence?.acceptanceRulesHash === state.evidence.acceptanceRulesHash;
}

export function advanceReviewedTask(state: State): void {
  const id = state.tasks[state.taskIndex]!.id;
  state.completedTaskIds ??= state.tasks.some(task => task.dependsOn?.length) ? [] : state.tasks.slice(0, state.taskIndex).map(task => task.id);
  if (!state.completedTaskIds.includes(id)) state.completedTaskIds.push(id);
  state.deferredTaskIds = (state.deferredTaskIds ?? []).filter(task => task !== id);
  state.taskIndex = state.tasks.findIndex(task => !state.completedTaskIds!.includes(task.id));
  if (state.taskIndex < 0) state.taskIndex = state.tasks.length;
  state.reworks = 0; state.reviewRepairs = 0; state.reworkPending = false; state.failure = null; state.feedback = '';
}

export function acceptDecision(store: Store, state: State): State {
  if (state.evidence?.decisionReview?.verdict !== 'pass' || state.executorExitCode !== 0 || !recordedPass(store, state)) throw Error('Decision acceptance requires recorded pass for current evidence');
  state.evidence.decisionAccepted = true;
  store.audit('decision-acceptance', { taskId: state.tasks[state.taskIndex]!.id, taskIndex: state.taskIndex, loop: state.loops, digest: decisionAcceptanceDigest(state), evidence: state.evidence, testsExecuted: 0 });
  advanceReviewedTask(state);
  // Rework and recovery continue one task's Session; an accepted task ends it so later tasks do not re-read its history.
  // The last task keeps its Session for history and delivery records.
  const previousSession = state.taskIndex < state.tasks.length ? state.executionSession?.sessionId ?? state.codexThreadId ?? null : null;
  if (previousSession) { delete state.executionSession; delete state.claudeExecutionSessionId; state.codexThreadId = null; }
  state.nextPhase = 'execute';
  state.phase = state.taskIndex === state.tasks.length && !pendingGuidance(store).length && !processingGuidance(store).length ? 'completed' : 'execute';
  state.reason = state.phase === 'completed' ? '全部任务已由决策者验收；正式交付授权另行处理' : '决策者验收通过，自动继续下一任务';
  store.save(state, { executionRotation: !!previousSession });
  if (previousSession) store.audit('execution-session-rotated', { previousSession, loop: state.loops, nextTaskId: state.tasks[state.taskIndex]?.id ?? null, note: '已验收任务的执行 Session 结束；后续任务使用新 Session，工作区成果保留' });
  store.audit('transition', { phase: state.phase, reason: state.reason, taskIndex: state.taskIndex, loops: state.loops, claudeCalls: state.claudeCalls ?? 0 });
  return state;
}
