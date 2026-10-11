import fs from 'node:fs';
import path from 'node:path';
import { createRun } from '../../src/controller.js';
import { captureProject, copyProject } from '../../src/project-files.js';
import { atomicJson } from '../../src/store.js';
import { git, workspaceHead } from '../../src/workspace.js';
import type { Config } from '../../src/schema.js';

// Reconstruct a local persisted pre-snapshot-policy Run for legacy recovery and
// delivery tests. This is a test fixture, never a production startup fallback.
export async function createHistoricalRun(config: Config, source: string, goal: string, options: { purpose?: 'context-onboarding' } = {}) {
  if(options.purpose) config={...config,projectMode:'isolated',executionMode:'native'};
  const generic = !!config.projectMode || !!options.purpose;
  const temporary = generic ? { ...config, projectMode: 'direct' as const, executionMode: 'native' as const, directAuthorization: { projectPath: source, acknowledgedAt: new Date().toISOString() } } : config;
  const store = await createRun(temporary, source, goal);
  const state = store.load();
  if (generic && config.projectMode !== 'direct') {
    const workspace = store.file('workspace');
    if (fs.existsSync(path.join(source, '.git'))) {
      await git(path.dirname(workspace), ['clone', '--no-hardlinks', '--no-local', '--', source, workspace]);
      await git(workspace, ['remote', 'remove', 'origin']);
      copyProject(source, workspace, true);
    } else copyProject(source, workspace);
    state.workspace = workspace;
  }
  state.config = { ...config };
  if (config.projectMode === 'direct') state.config.executionMode = 'native';
  delete state.snapshotPolicy;
  if (options.purpose) state.purpose = options.purpose;
  if (generic) {
    const baseline = captureProject(state.workspace, store.file('snapshot-objects'));
    atomicJson(store.file('project-baseline.json'), baseline);
    state.base = baseline.digest;
    atomicJson(store.file('project-git.json'), { head: fs.existsSync(path.join(state.workspace, '.git')) ? await git(state.workspace, ['rev-parse', 'HEAD']).catch(() => 'unborn') : state.base });
  } else if (fs.existsSync(path.join(state.workspace, '.git'))) state.base=await git(state.workspace,['rev-parse','HEAD']);
  store.save(state);
  store.audit('historical-fixture', { note: 'Explicit local pre-policy snapshot replay; not production initialization' });
  return store;
}
