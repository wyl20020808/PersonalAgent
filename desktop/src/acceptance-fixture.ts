import type { DesktopService } from './test-service.js';

// Test user explicitly approves each reviewed fixture task through public IPC.
export async function completeFixtureRun(service: DesktopService, profileId: string, runId: string) {
  for (let i = 0; i < 400; i++) {
    const run = service.detail(profileId, runId).run;
    if (!run.active) {
      if (run.phase === 'paused' && run.manualAcceptanceDigest && run.evidence?.decisionReview?.verdict === 'pass') {
        await service.dispatch({ operation: 'manualAccept', profileId, runId, digest: run.manualAcceptanceDigest, decision: 'Explicit local fixture user accepts the reviewed files' });
        const accepted = service.detail(profileId, runId).run;
        if (accepted.phase !== 'completed') await service.dispatch({ operation: 'resume', profileId, runId, decision: 'Fixture user authorizes the next task' });
      } else if (['completed', 'paused', 'failed', 'stopped'].includes(run.phase)) return run;
    }
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw Error('Fixture user acceptance timed out');
}
