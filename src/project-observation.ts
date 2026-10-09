import { existsSync, readdirSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gitText, gitHead } from './git-process.js';
import { readProject } from './project-files.js';
import { loadProjectContext, contextRoot, type ProjectContext } from './project-context.js';
import type { State } from './store.js';

export const observationScope = '未验证全量项目变更：Git Diff 仅含 Git 跟踪内容，包含任务前已有修改；未跟踪、忽略文件及非 Git 文件不提供完整 Diff。Project Context 仅检查文档和 checked_files；不提供全项目备份、恢复或自动 Apply 保证。';
export const hasGit = (root: string) => existsSync(path.join(root, '.git'));
export async function gitObservation(root: string, signal?: AbortSignal) {
  if (!hasGit(root)) return { head: 'no-git', status: '非 Git 项目；文件变更未自动验证', diff: '', digest: createHash('sha256').update('no-git:unverified').digest('hex') };
  const head = await gitHead(root, signal);
  const status = await gitText(root, ['status', '--porcelain=v1', '--untracked-files=no'], signal);
  const args = ['diff', '--no-ext-diff', '--no-textconv'];
  let diff: string;
  try {
    diff = await gitText(root, [...args, ...(head === 'unborn' ? ['--cached'] : [head]), '--'], signal);
    if (head === 'unborn') diff += '\n' + await gitText(root, [...args, '--'], signal);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Process output limit exceeded')) throw error;
    diff = 'Git Diff exceeds output limit; file content diff is unverified.\n' + await gitText(root, [...args, '--stat', ...(head === 'unborn' ? ['--cached'] : [head]), '--'], signal);
  }
  return { head, status, diff, digest: createHash('sha256').update(JSON.stringify({ head, status, diff })).digest('hex') };
}
// This list comes from Git metadata, never a recursive project walk.
export function gitChangedPaths(root: string): string[] {
  if (!hasGit(root)) return [];
  const args = ['-c', 'core.hooksPath=NUL', '-c', 'core.fsmonitor=false', '-c', 'core.longpaths=true'];
  const options = { cwd: root, encoding: 'utf8' as const, timeout: 30000, maxBuffer: 2 * 1024 * 1024 };
  let unborn = false;
  try { execFileSync('git', [...args, 'rev-parse', '--verify', '--quiet', 'HEAD'], options); }
  catch { unborn = true; }
  const diff = ['diff', '--name-only', '--no-renames', '-z'];
  return [...new Set((execFileSync('git', [...args, ...diff, ...(unborn ? ['--cached'] : ['HEAD']), '--'], options) + (unborn ? execFileSync('git', [...args, ...diff, '--'], options) : '')).split('\0').filter(Boolean))];
}
// Only explicit knowledge documents and stamped source files are hashed.
export function contextObservation(state: State, frozen?: ProjectContext) {
  if (state.snapshotPolicy !== 'none') return readProject(state.workspace);
  let context: ProjectContext = frozen ?? { enabled: false, modules: [], contracts: [], decisions: [] };
  try { context = loadProjectContext(state.workspace, state.projectContextEnabled === true, { runtimeDir: state.config.runtimeDir, source: state.source }); }
  catch { /* Validation belongs to Context checks; still record malformed document changes. */ }
  const contexts = frozen ? [context, frozen] : [context];
  const documents = contexts.flatMap(entry => [entry.overview, ...entry.modules, ...entry.contracts, ...entry.decisions]).filter(doc => !!doc);
  const names = new Set(documents.map(doc => doc!.relative));
  names.add(`${contextRoot}/overview.md`);
  for (const folder of ['modules', 'contracts', 'decisions']) {
    const relative = `${contextRoot}/${folder}`, directory = path.join(state.workspace, relative);
    if (!existsSync(directory)) continue;
    if (lstatSync(directory).isSymbolicLink()) throw new Error('Project Context symlink directory rejected');
    for (const name of readdirSync(directory)) if (name.endsWith('.md')) names.add(`${relative}/${name}`);
  }
  for (const module of contexts.flatMap(entry => entry.modules)) for (const name of Object.keys(module.metadata.checked_files)) names.add(name);
  return readProject(state.workspace, undefined, [...names].sort());
}
