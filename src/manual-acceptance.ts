import { createHash } from 'node:crypto';
import { Store, type State } from './store.js';
import { collectEvidence } from './workspace.js';
import { lockProject } from './project-files.js';
import { pendingGuidance, processingGuidance } from './steering.js';
import { advanceReviewedTask } from './decision-acceptance.js';

export function manualAcceptanceDigest(state: State): string | null {
  if (state.phase !== 'paused' || state.nextPhase !== 'verify' || state.evidence?.acceptanceMode !== 'decision-user' || !['pass', 'human'].includes(state.evidence.decisionReview?.verdict ?? '') || state.evidence.userAccepted) return null;
  return createHash('sha256').update(JSON.stringify({runId:state.id,taskIndex:state.taskIndex,task:state.tasks[state.taskIndex],loop:state.loops,snapshot:state.evidence.snapshotDigest,head:state.evidence.head,rules:state.evidence.acceptanceRulesHash,diff:state.evidence.diff,verificationScope:state.evidence.verificationScope,review:state.evidence.decisionReview})).digest('hex');
}
// Human acceptance is separate from independent test success. Recheck the exact
// observed evidence under the same locks as development; never invoke an Agent here.
export async function acceptManual(store: Store, digest: string, observations: string): Promise<State> {
  const unlock=store.lock();let release:(()=>void)|undefined;
  try {
    const state=store.load();release=lockProject({...state,source:state.workspace,config:{...state.config,projectMode:'direct'}});
    if(!observations.trim() || !digest || manualAcceptanceDigest(state)!==digest) throw new Error('Manual acceptance requires exact current digest and observations');
    const evidence=await collectEvidence(state,new AbortController().signal,false,true);
    evidence.decisionReview=state.evidence!.decisionReview;
    evidence.contextReport=state.evidence!.contextReport;
    evidence.taskDiff=state.evidence!.taskDiff; evidence.roundDiff=state.evidence!.roundDiff;
    const checked={...state,evidence};
    if(manualAcceptanceDigest(checked)!==digest) throw new Error('Manual acceptance observed evidence or rules changed');
    evidence.userAccepted=true;
    store.audit('manual-acceptance',{taskId:state.tasks[state.taskIndex]!.id,taskIndex:state.taskIndex,loop:state.loops,digest,observations,verificationScope:evidence.verificationScope,testsExecuted:0,snapshot:evidence.snapshotDigest,rules:evidence.acceptanceRulesHash,evidence});
    state.evidence=evidence;advanceReviewedTask(state);
    const awaitingGuidance=pendingGuidance(store).length>0||processingGuidance(store).length>0;
    state.phase=state.taskIndex===state.tasks.length&&!awaitingGuidance?'completed':'paused';state.nextPhase='execute';
    state.reason=state.phase==='completed'?'人工验收完成；决策者审查及用户确认已记录，Controller 未判定成果或执行验收测试':'当前任务已人工验收；提交恢复决策后开发下一任务';
    store.save(state);store.audit('transition',{phase:state.phase,reason:state.reason,taskIndex:state.taskIndex});return state;
  } finally {release?.();unlock();}
}
