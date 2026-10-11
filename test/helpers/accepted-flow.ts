import { drive as controllerDrive } from '../../src/controller.js';
import { acceptManual, manualAcceptanceDigest } from '../../src/manual-acceptance.js';
import { collectEvidence } from '../../src/workspace.js';
import { MockAgents, type Agents } from '../../src/adapters.js';
import type { State, Store } from '../../src/store.js';

// Explicit local test actors: the fixture decision maker runs its configured
// checks; the fixture user confirms each pass. Production Controller never does
// either. Human/fail/rework and operational pauses remain visible to the test.
export async function driveWithUserAcceptance(store: Store, agents: Agents, ...args: Parameters<typeof controllerDrive> extends [Store, Agents, ...infer Rest] ? Rest : never): Promise<State> {
  const fixtureAgents: Agents = {
    executionMode: agents.executionMode,
    plan: agents.plan.bind(agents), execute: agents.execute.bind(agents),
    async review(state, storage, signal) {
      const finalNode = state.nativeExecution === true && state.tasks.every((task,index)=>index===state.taskIndex||state.completedTaskIds?.includes(task.id));
      const evidence = await collectEvidence(state, signal, finalNode);
      evidence.contextReport = state.evidence?.contextReport;
      evidence.taskDiff = state.evidence?.taskDiff;
      evidence.roundDiff = state.evidence?.roundDiff;
      storage.audit('fixture-decision-check', { ...evidence, note: 'Test-only decision actor; not Controller acceptance' });
      const observed = state.evidence;
      state.evidence = agents instanceof MockAgents ? { ...evidence, acceptanceMode: 'decision-user' } : evidence;
      try { return await agents.review(state, storage, signal); }
      finally { state.evidence = observed; }
    }
  };
  let state = await controllerDrive(store, fixtureAgents, ...args);
  for (let i = 0; i < 100 && state.evidence?.decisionReview?.verdict === 'pass'; i++) {
    const digest = manualAcceptanceDigest(state);
    if (!digest) break;
    state = await acceptManual(store, digest, 'Explicit local fixture user confirms the reviewed task');
    if (state.phase === 'completed') return state;
    state = await controllerDrive(store, fixtureAgents, 'Fixture user authorizes the next task');
  }
  return state;
}
