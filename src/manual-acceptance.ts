import { createHash } from 'node:crypto';
import { Store, type State } from './store.js';
import { collectEvidence } from './workspace.js';
import { lockProject } from './project-files.js';

const missingTests = 'No independent acceptance tests configured; human verification required';
export function manualAcceptanceDigest(state: State): string | null {
  if (state.phase !== 'paused' || state.nextPhase !== 'verify' || state.config.tests.length || !state.evidence || state.evidence.issues.some(issue => issue !== missingTests)) return null;
  return createHash('sha256').update(JSON.stringify({runId:state.id,taskIndex:state.taskIndex,task:state.tasks[state.taskIndex],loop:state.loops,snapshot:state.evidence.snapshotDigest,head:state.evidence.head,rules:state.evidence.acceptanceRulesHash,diff:state.evidence.diff,verificationScope:state.evidence.verificationScope})).digest('hex');
}
// Human acceptance is separate from independent test success. Recheck the exact
// observed evidence under the same locks as development; never invoke an Agent here.
export async function acceptManual(store: Store, digest: string, observations: string): Promise<State> {
  const unlock=store.lock();let release:(()=>void)|undefined;
  try {
    const state=store.load();release=lockProject({...state,source:state.workspace,config:{...state.config,projectMode:'direct'}});
    if(!observations.trim() || !digest || manualAcceptanceDigest(state)!==digest) throw new Error('Manual acceptance requires exact current digest and observations');
    const evidence=await collectEvidence(state,new AbortController().signal);
    const checked={...state,evidence};
    if(manualAcceptanceDigest(checked)!==digest) throw new Error('Manual acceptance observed evidence or rules changed');
    store.audit('manual-acceptance',{taskId:state.tasks[state.taskIndex]!.id,taskIndex:state.taskIndex,digest,observations,verificationScope:evidence.verificationScope,testsExecuted:0,snapshot:evidence.snapshotDigest,rules:evidence.acceptanceRulesHash});
    state.evidence=evidence;state.completedTaskIds??=[];
    state.completedTaskIds.push(state.tasks[state.taskIndex]!.id);state.taskIndex++;state.reworks=0;state.reworkPending=false;
    state.phase=state.taskIndex===state.tasks.length?'completed':'paused';state.nextPhase='execute';
    state.reason=state.phase==='completed'?'人工验收完成；未执行独立测试，不代表自动验收通过':'当前任务已人工验收；提交恢复决策后开发下一任务';
    store.save(state);store.audit('transition',{phase:state.phase,reason:state.reason,taskIndex:state.taskIndex});return state;
  } finally {release?.();unlock();}
}
