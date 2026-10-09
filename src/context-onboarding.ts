import { loadProject, readProject, projectFileHash } from './project-files.js';
import { loadProjectContext, contextRoot } from './project-context.js';
import { FlowError } from './failure.js';
import type { State, Store } from './store.js';
export const onboardingDocumentPath = (name: string): boolean => new RegExp(`^${contextRoot}/(?:overview\\.md|(?:modules|contracts|decisions)/[a-zA-Z0-9_-]{1,64}\\.md)$`).test(name);

export function assertOnboardingScope(state: State, store: Store): void {
  if (state.purpose !== 'context-onboarding') return;
  if (state.snapshotPolicy === 'none') throw new FlowError('safety', '无快照 Run 不提供建档隔离副本范围保证；请在授权 direct 开发中按需维护 Project Context。');
  if (state.config.projectMode !== 'isolated' || state.workspace === state.source) throw new FlowError('safety', '建档 Run 必须使用 isolated 工作副本');
  const before = loadProject(store.file('project-baseline.json')), after = readProject(state.workspace);
  for (const name of new Set([...Object.keys(before.files), ...Object.keys(after.files)])) {
    if (projectFileHash(before,name) === projectFileHash(after,name)) continue;
    if (!onboardingDocumentPath(name) || (after.files[name] === undefined && name === `${contextRoot}/overview.md`)) throw new FlowError('safety', `建档产物范围错误：${name}`);
  }
}
export function assertRunContext(state: State, store: Store): void {
  const context = loadProjectContext(state.workspace, state.projectContextEnabled === true, { runtimeDir: state.config.runtimeDir, source: state.source });
  if (context.enabled && !state.projectContextEnabled) { state.projectContextEnabled = true; store.save(state); }
  assertOnboardingScope(state, store);
}
