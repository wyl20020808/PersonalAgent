import { taskContextBaseline } from '../src/context-review.js';
import { belongsToModule } from '../src/project-context.js';
import { readProject } from '../src/project-files.js';
import { auditRecords } from '../src/context-trust.js';
import { FlowError } from '../src/failure.js';
import type { State, Store } from '../src/store.js';

// Fixed T2 harness assertion only; Controller remains responsible for acceptance.
export function assertT2ReviewStage(state: State, store: Store) {
  const baseline = taskContextBaseline(state, store), report = state.evidence?.contextReport;
  const world = baseline?.context.modules.find(doc => doc.metadata.id === 'world');
  const geometry = baseline?.context.contracts.find(doc => doc.metadata.id === 'geometry');
  if (!baseline || !report || !world || !geometry) throw new FlowError('safety', 'T2 frozen Review context missing');
  const current = readProject(state.workspace);
  const worldChanges = [...new Set([...Object.keys(baseline.snapshot.files), ...Object.keys(current.files)])]
    .filter(file => belongsToModule(world, file) && baseline.snapshot.files[file] !== current.files[file]);
  const injectedCandidate = state.loops === 1 && !auditRecords(store.file('audit.jsonl')).some(event => event.event === 'review-modified-workspace');
  if (report.snapshot !== current.digest || report.baselineDigest !== baseline.digest) throw new FlowError('safety', 'T2 Review snapshot mismatch');
  if (!report.contracts.some(doc => doc.id === 'geometry' && doc.path === geometry.relative && doc.source === 'task-baseline' && doc.content === geometry.content))
    throw new FlowError('safety', 'Cross-module Review contract missing');
  if ((injectedCandidate || worldChanges.length > 0) && !report.expandedModules.includes('world'))
    throw new FlowError('safety', 'Cross-module Review expansion missing');
  if (injectedCandidate && (!worldChanges.length || !state.evidence?.tests.some(test => test.exitCode !== 0)))
    throw new FlowError('safety', 'Injected candidate must change world and fail independent tests');
  return { stage: injectedCandidate ? 'test-injected-candidate' : 'correction', worldRestored: worldChanges.length === 0, worldChanges, expandedModules: report.expandedModules };
}
