import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { State, Store } from './store.js';
import { pendingGuidance, processingGuidance } from './steering.js';
import { recordAcceptedTask } from './task-ledger.js';
import { orderTasks } from './dependencies.js';
import { contextLimits, previousContext } from './model-context.js';

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
  const goalReview = state.evidence.decisionReview;
  if(state.config.autonomousDevelopment){
    // Validate before recording acceptance: rejected follow-ups must never silently close the goal.
    const followUps=goalReview.followUpTasks??[],ids=new Set(state.tasks.map(task=>task.id));
    for(const task of followUps){if(ids.has(task.id))throw Error('Autonomous follow-up IDs must be new and unique');ids.add(task.id);}
    orderTasks([...state.tasks,...followUps],state.config);
    const finalTask=state.tasks.every((task,index)=>index===state.taskIndex||state.completedTaskIds?.includes(task.id));
    if(finalTask){
      const assessment=goalReview.goalAssessment;
      if(!assessment)throw Error('Final autonomous acceptance requires goalAssessment');
      if(assessment.complete&&followUps.length||!assessment.complete&&!followUps.length)throw Error('Goal assessment and remaining tasks disagree');
      store.audit('goal-assessment',{...assessment,taskId:state.tasks[state.taskIndex]!.id,followUpTaskIds:followUps.map(task=>task.id)});
    }
  }
  state.evidence.decisionAccepted = true;
  store.audit('decision-acceptance', { taskId: state.tasks[state.taskIndex]!.id, taskIndex: state.taskIndex, loop: state.loops, digest: decisionAcceptanceDigest(state), evidence: state.evidence, testsExecuted: 0 });
  recordAcceptedTask(store, state);
  // Read the decision Session's occupancy while it is still bound.
  const occupancy = state.discussion ? null : previousContext(state, store, 'decision')?.usedTokens ?? null, halfBudget = contextLimits(state, store, 'decision').compactAt / 2;
  advanceReviewedTask(state);
  appendFollowUps(store, state);
  // Rework and recovery continue one task's Session; an accepted task ends it so later tasks do not re-read its history.
  // The last task keeps its Session for history and delivery records.
  const previousSession = state.taskIndex < state.tasks.length ? state.executionSession?.sessionId ?? state.codexThreadId ?? null : null;
  if (previousSession) { delete state.executionSession; delete state.claudeExecutionSessionId; state.codexThreadId = null; }
  // The decision maker starts a fresh Session at a task boundary once the current one holds half its working budget;
  // the task ledger carries what was accepted. Rotation costs no call, compaction does.
  const decisionSession = !state.guidancePending && !pendingGuidance(store).length && !processingGuidance(store).length && state.taskIndex < state.tasks.length && occupancy !== null && occupancy >= halfBudget ? state.decisionSession?.sessionId ?? state.claudeSessionId ?? null : null;
  if (decisionSession) { delete state.decisionSession; state.claudeSessionId = null; }
  state.nextPhase = 'execute';
  state.phase = state.taskIndex === state.tasks.length && !pendingGuidance(store).length && !processingGuidance(store).length ? 'completed' : 'execute';
  state.reason = state.phase === 'completed' ? '全部任务已由决策者验收；正式交付授权另行处理' : '决策者验收通过，自动继续下一任务';
  store.save(state, { executionRotation: !!previousSession });
  if (previousSession) store.audit('execution-session-rotated', { previousSession, loop: state.loops, nextTaskId: state.tasks[state.taskIndex]?.id ?? null, note: '已验收任务的执行 Session 结束；后续任务使用新 Session，工作区成果保留' });
  if (decisionSession) store.audit('decision-session-rotated', { previousSession: decisionSession, occupancy, loop: state.loops, nextTaskId: state.tasks[state.taskIndex]?.id ?? null, note: '决策 Session 占用达到工作预算的一半；后续使用新 Session，任务台账提供已验收成果' });
  store.audit('transition', { phase: state.phase, reason: state.reason, taskIndex: state.taskIndex, loops: state.loops, claudeCalls: state.claudeCalls ?? 0 });
  return state;
}

// A passing review may add work the goal still needs; otherwise the decision maker has to force a replan through rework.
function appendFollowUps(store: Store, state: State): void {
  const requested = state.evidence?.decisionReview?.followUpTasks ?? [];
  if (!requested.length) return;
  const existing = new Set(state.tasks.map(task => task.id)), added = requested.filter(task => !existing.has(task.id));
  const skipped = requested.filter(task => existing.has(task.id)).map(task => task.id);
  try {
    state.tasks = orderTasks([...state.tasks, ...added], state.config);
  } catch (error) {
    store.audit('review-follow-ups-rejected', { tasks: added.map(task => task.id), reason: (error as Error).message, note: '追加任务未通过依赖校验，未加入计划；决策者可在后续验收或重新规划中修正' });
    return;
  }
  state.taskIndex = state.tasks.findIndex(task => !state.completedTaskIds?.includes(task.id));
  if (state.taskIndex < 0) state.taskIndex = state.tasks.length;
  store.audit('review-follow-ups', { added: added.map(task => task.id), skippedExisting: skipped, nextTaskId: state.tasks[state.taskIndex]?.id ?? null });
}
