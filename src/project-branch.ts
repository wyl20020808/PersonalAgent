import { closeSync, existsSync, openSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { FlowError, classifyFailure } from './failure.js';
import { gitProcess, gitText } from './git-process.js';
import { hasGit } from './project-observation.js';
import { assertD, atomicJson, INTEGRATION_BRANCH, type ProjectBranch, type Store, type State } from './store.js';

// PersonalAgent develops a target project only on top of its local `test` branch.
// Each Run works in its own Git worktree and its accepted result can only be merged into `test`.
export { INTEGRATION_BRANCH };
const BRANCH_PREFIX = 'personalagent/';
const LOCK_NAME = 'personalagent-test-integration.lock';
const IDENTITY = ['-c', 'user.name=PersonalAgent', '-c', 'user.email=personalagent@localhost'];
const SLOW = { timeoutMs: 10 * 60 * 1000 };

const ref = (branch: string) => `refs/heads/${branch}`;
async function resolve(cwd: string, name: string): Promise<string | null> {
  const result = await gitProcess(cwd, ['rev-parse', '--verify', '--quiet', `${name}^{commit}`], { allowedExitCodes: [0, 1] });
  return result.exitCode === 0 ? result.stdout.trim() : null;
}
async function ancestor(cwd: string, older: string, newer: string): Promise<boolean> {
  return (await gitProcess(cwd, ['merge-base', '--is-ancestor', older, newer], { allowedExitCodes: [0, 1] })).exitCode === 0;
}

/** The hard rule: no Git repository root or no local `test` branch means no development; the user decides. */
export async function assertProjectTestBranch(source: string): Promise<{ repository: string; target: string }> {
  const repository = realpathSync(source);
  const refuse = (problem: string) => new FlowError('rejected', `${problem}PersonalAgent 只在目标项目本地 ${INTEGRATION_BRANCH} 分支的基础上开发，并且只能把成果合并到 ${INTEGRATION_BRANCH}。本次未创建分支、未修改项目；请由用户决定是否新建 ${INTEGRATION_BRANCH} 分支（例如在项目根目录执行 git branch ${INTEGRATION_BRANCH} <基线分支>）后重新发起。`);
  if (!hasGit(repository)) throw refuse(`项目 ${repository} 不是 Git 仓库。`);
  const top = await gitText(repository, ['rev-parse', '--show-toplevel']);
  if (realpathSync(top).toLowerCase() !== repository.toLowerCase()) throw refuse(`项目 ${repository} 不是 Git 仓库根目录。`);
  const target = await resolve(repository, ref(INTEGRATION_BRANCH));
  if (!target) throw refuse(`项目 ${repository} 没有本地 ${INTEGRATION_BRANCH} 分支。`);
  return { repository, target };
}

export function projectWorktreePath(runtimeDir: string, runId: string): string {
  return path.join(assertD(runtimeDir), 'worktrees', runId.slice(0, 8));
}
/** The only directory this Run may work in. */
export function runWorkspace(state: State, store: Store): string {
  if (state.projectBranch) return projectWorktreePath(state.config.runtimeDir, store.id);
  return state.config.projectMode === 'direct' ? realpathSync(state.source) : store.file('workspace');
}
export function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/** Creates `personalagent/<run>` from the current `test` commit in a worktree owned by this Run. */
export async function createProjectWorktree(source: string, runtimeDir: string, runId: string): Promise<ProjectBranch> {
  const { repository, target } = await assertProjectTestBranch(source);
  const branch = BRANCH_PREFIX + runId.slice(0, 8), worktree = projectWorktreePath(runtimeDir, runId);
  if (existsSync(worktree)) throw new FlowError('safety', `Run 工作树路径已存在，拒绝覆盖：${worktree}`);
  if (await resolve(repository, ref(branch))) throw new FlowError('safety', `任务分支已存在，拒绝覆盖：${branch}`);
  await gitProcess(repository, ['worktree', 'add', '-b', branch, worktree, target], SLOW);
  const head = await gitText(worktree, ['rev-parse', 'HEAD']);
  if (head !== target) throw new FlowError('safety', `${INTEGRATION_BRANCH} 在创建工作树期间变化`);
  return { repository, integrationBranch: INTEGRATION_BRANCH, branch, baseCommit: target, worktree: realpathSync(worktree) };
}

/** Rejects a persisted worktree that is not this Run's own branch checkout. */
export async function assertRunWorktree(state: State, store: Store): Promise<void> {
  const owned = state.projectBranch!;
  if (path.resolve(owned.worktree).toLowerCase() !== path.resolve(projectWorktreePath(state.config.runtimeDir, store.id)).toLowerCase()) throw new FlowError('safety', 'Run 工作树与 Run 不匹配');
  if (realpathSync(owned.repository).toLowerCase() !== realpathSync(state.source).toLowerCase()) throw new FlowError('safety', 'Run 工作树不属于所选项目');
  if (await gitText(owned.worktree, ['symbolic-ref', '--short', 'HEAD']) !== owned.branch) throw new FlowError('safety', `Run 工作树必须停留在 ${owned.branch}`);
}

function lockFile(commonDir: string, state: State, store: Store): () => void {
  const file = path.join(commonDir, LOCK_NAME);
  let fd: number;
  try { fd = openSync(file, 'wx'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new FlowError('rejected', `${INTEGRATION_BRANCH} 集成锁被占用（${file}）；保留已提交的任务分支 ${state.projectBranch!.branch}，等占用方完成后恢复本 Run 即可重试合并。`);
    throw error;
  }
  try { writeFileSync(fd, JSON.stringify({ runId: store.id, holder: 'PersonalAgent', source: state.projectBranch!.branch, pid: process.pid, at: new Date().toISOString() })); }
  finally { closeSync(fd); }
  return () => { try { unlinkSync(file); } catch { /* already released */ } };
}

/** Finds the worktree that has `test` checked out, if any. */
async function checkedOut(repository: string): Promise<string | null> {
  const list = await gitText(repository, ['worktree', 'list', '--porcelain']);
  let current: string | null = null;
  for (const line of list.split('\n')) {
    if (line.startsWith('worktree ')) current = line.slice(9).trim();
    else if (line.trim() === `branch ${ref(INTEGRATION_BRANCH)}`) return current;
  }
  return null;
}

/**
 * Commits the accepted Run result on its own branch and merges it into `test` only.
 * Never touches any other branch, never pushes, never resets; conflicts leave `test` unchanged.
 */
export async function integrateProjectBranch(state: State, store: Store): Promise<NonNullable<ProjectBranch['integration']>> {
  const owned = state.projectBranch!;
  if (owned.integration) return owned.integration;
  await assertRunWorktree(state, store);
  const worktree = owned.worktree;
  if (await gitText(worktree, ['status', '--porcelain=v1', '--untracked-files=all'])) {
    await gitProcess(worktree, ['add', '--all'], SLOW);
    const title = state.goal.split('\n').map(line => line.trim()).find(Boolean)?.slice(0, 60) ?? '';
    await gitProcess(worktree, [...IDENTITY, 'commit', '--no-verify', '-m', `PersonalAgent Run ${store.id.slice(0, 8)}：${title}`, '-m', `Run ID: ${store.id}\n决策者已验收全部任务；Controller 合并到 ${INTEGRATION_BRANCH}。`], SLOW);
  }
  let head = await gitText(worktree, ['rev-parse', 'HEAD']);
  // Later work in this Run (after a failed merge) is reviewed against the committed result.
  atomicJson(store.file('project-git.json'), { head });
  const commonDir = await gitText(owned.repository, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const release = lockFile(commonDir, state, store);
  try {
    const target = await resolve(owned.repository, ref(INTEGRATION_BRANCH));
    if (!target) throw new FlowError('rejected', `项目已没有本地 ${INTEGRATION_BRANCH} 分支；保留任务分支 ${owned.branch}，由用户决定后恢复。`);
    const at = new Date().toISOString();
    if (await ancestor(worktree, head, target)) return { status: 'no-changes', commit: target, previousTarget: target, at };
    if (!await ancestor(worktree, target, head)) {
      // `test` moved on: merge it into the task branch first; a conflict keeps `test` untouched.
      const merged = await gitProcess(worktree, [...IDENTITY, 'merge', '--no-ff', '--no-verify', '-m', `merge: ${INTEGRATION_BRANCH} into ${owned.branch}`, target], { ...SLOW, allowedExitCodes: [0, 1] });
      if (merged.exitCode !== 0) {
        await gitProcess(worktree, ['merge', '--abort'], { allowedExitCodes: [0, 128] });
        throw new FlowError('rejected', `合并到 ${INTEGRATION_BRANCH} 有冲突，${INTEGRATION_BRANCH} 未改变；成果保留在任务分支 ${owned.branch}（工作树 ${worktree}）。请决定如何处理冲突后恢复本 Run。\n${merged.stdout}\n${merged.stderr}`.trim());
      }
      head = await gitText(worktree, ['rev-parse', 'HEAD']);
      atomicJson(store.file('project-git.json'), { head });
    }
    const message = `merge: PersonalAgent Run ${store.id.slice(0, 8)} into ${INTEGRATION_BRANCH}`;
    const checkout = await checkedOut(owned.repository);
    if (checkout) {
      // A checked-out `test` moves with its files, and only when that worktree has nothing to lose.
      if (await gitText(checkout, ['status', '--porcelain=v1', '--untracked-files=no'])) throw new FlowError('rejected', `${INTEGRATION_BRANCH} 已在 ${checkout} 检出且有未提交修改；为保护这些修改未合并。成果保留在 ${owned.branch}，处理后恢复本 Run 即可重试。`);
      await gitProcess(checkout, [...IDENTITY, 'merge', '--no-ff', '--no-verify', '-m', message, head], SLOW);
    } else {
      const tree = await gitText(worktree, ['rev-parse', `${head}^{tree}`]);
      const commit = (await gitProcess(worktree, [...IDENTITY, 'commit-tree', tree, '-p', target, '-p', head, '-m', message])).stdout.trim();
      // Compare-and-swap: a concurrent update of `test` fails instead of being overwritten.
      await gitProcess(owned.repository, ['update-ref', '-m', message, ref(INTEGRATION_BRANCH), commit, target]);
    }
    const result = await resolve(owned.repository, ref(INTEGRATION_BRANCH));
    if (!result || !await ancestor(worktree, head, result) || !await ancestor(worktree, target, result)) throw new FlowError('git', `${INTEGRATION_BRANCH} 合并后核对失败；保留现场`);
    return { status: 'merged', commit: result, previousTarget: target, at };
  } finally { release(); }
}

/** After a merge the Run's checkout is no longer needed; its branch keeps the history. */
export async function removeProjectWorktree(state: State): Promise<boolean> {
  const owned = state.projectBranch!;
  if (!existsSync(owned.worktree)) return true;
  const result = await gitProcess(owned.repository, ['worktree', 'remove', owned.worktree], { ...SLOW, allowedExitCodes: [0, 128] });
  return result.exitCode === 0;
}

/** Merging into `test` is the last step of a completed Run; a failure pauses it for the user and keeps the branch. */
export async function finishProjectRun(store: Store, current: State): Promise<State> {
  if (current.phase !== 'completed' || !current.projectBranch || current.projectBranch.integration) return current;
  const unlock = store.lock();
  try {
    const state = store.load();
    if (state.phase !== 'completed' || !state.projectBranch || state.projectBranch.integration) return state;
    try {
      const integration = await integrateProjectBranch(state, store);
      state.projectBranch = { ...state.projectBranch, integration };
      atomicJson(store.file('project-integration.json'), { runId: store.id, ...state.projectBranch });
      const removed = await removeProjectWorktree(state);
      state.reason = integration.status === 'merged' ? `全部任务已验收，成果已提交到 ${state.projectBranch.branch} 并合并到 ${INTEGRATION_BRANCH}（${integration.commit.slice(0, 12)}）；未推送` : `全部任务已验收；没有需要合并到 ${INTEGRATION_BRANCH} 的修改`;
      store.save(state);
      store.audit('project-branch-integrated', { ...integration, branch: state.projectBranch.branch, worktreeRemoved: removed });
    } catch (error) {
      const failure = classifyFailure(error, 'integrate');
      state.phase = 'paused'; state.nextPhase = 'execute'; state.userRequired = true; state.reason = failure.message;
      store.save(state);
      store.audit('transition', { phase: 'paused', reason: failure.message, loops: state.loops, taskIndex: state.taskIndex });
      store.audit('project-branch-integration-failed', failure);
    }
    return state;
  } finally { unlock(); }
}
