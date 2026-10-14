import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun, drive } from '../src/controller.js';
import { git } from '../src/workspace.js';
import { Store } from '../src/store.js';
import type { Agents } from '../src/adapters.js';
import type { Config } from '../src/schema.js';

const root = path.resolve(process.env.PERSONAL_AGENT_TEST_ROOT ?? '.validation', `project-branch-${randomUUID()}`); fs.mkdirSync(root, { recursive: true });
const identity = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid'];

async function fixture(name: string, options: { git?: boolean; testBranch?: boolean } = {}) {
  const dir = path.join(root, name), source = path.join(dir, 'project'); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'answer.cjs'), 'module.exports=0;\n');
  if (options.git !== false) {
    await git(source, ['init', '-b', 'main']); await git(source, ['add', '.']); await git(source, [...identity, 'commit', '-m', 'main base']);
    await git(source, ['branch', 'dev']);
    if (options.testBranch !== false) await git(source, ['branch', 'test']);
  }
  const config: Config = { mode: 'real', executionMode: 'native', projectMode: 'direct', directAuthorization: { projectPath: source, acknowledgedAt: new Date().toISOString() }, runtimeDir: path.join(dir, 'runtime'), allowedRepositories: [source], claudeExecutable: 'NEVER-LAUNCH-PAID', timeoutMs: 5000, maxLoops: 4, maxReworks: 1, tests: [], mockScenario: 'pass' };
  return { dir, source, config };
}
// Commits on `test` without touching the user's checkout.
async function commitOnTest(source: string, file: string, content: string) {
  const side = path.join(path.dirname(source), 'side-' + randomUUID().slice(0, 8));
  await git(source, ['worktree', 'add', side, 'test']);
  fs.writeFileSync(path.join(side, file), content); await git(side, ['add', '.']); await git(side, [...identity, 'commit', '-m', 'user work on test']);
  await git(source, ['worktree', 'remove', side]);
}
function agents(answer = 'module.exports=42;\n'): Agents {
  return {
    executionMode: 'native',
    async plan() { return { humanDecision: null, tasks: [{ id: 'answer', instruction: '本地夹具：修改答案', acceptance: ['answer.cjs 为 42'] }] }; },
    async execute(state) { fs.writeFileSync(path.join(state.workspace, 'answer.cjs'), answer); return { mode: 'native', summary: '本地夹具，无模型调用' }; },
    async review() { return { verdict: 'pass', reason: '本地夹具审查通过' }; }
  };
}
const show = (source: string, spec: string) => git(source, ['show', spec]);
// Checked-out files follow the machine's line-ending settings.
const read = (file: string) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

test('real Run is refused without Git or without a local test branch, and nothing is created', async () => {
  const plain = await fixture('plain', { git: false });
  await assert.rejects(createRun(plain.config, plain.source, '开发', { projectBranch: true }), (error: Error & { runId?: string }) => {
    assert.match(error.message, /不是 Git 仓库/); assert.match(error.message, /用户决定是否新建 test 分支/);
    const state = new Store(plain.config.runtimeDir, error.runId!).load();
    assert.equal(state.phase, 'failed'); assert.equal(state.failure?.kind, 'rejected'); assert.equal(state.failure?.recoverable, false);
    return true;
  });
  assert.equal(fs.existsSync(path.join(plain.source, '.git')), false);

  const missing = await fixture('no-test', { testBranch: false });
  const branches = await git(missing.source, ['branch', '--list']);
  await assert.rejects(createRun(missing.config, missing.source, '开发', { projectBranch: true }), /没有本地 test 分支/);
  assert.equal(await git(missing.source, ['branch', '--list']), branches);
  assert.equal((await git(missing.source, ['worktree', 'list', '--porcelain'])).split('\n').filter(line => line.startsWith('worktree ')).length, 1);
  assert.equal(fs.existsSync(path.join(missing.config.runtimeDir, 'worktrees')), false);
});

test('real Run develops in its own worktree from test and merges only into test', async () => {
  const f = await fixture('merge');
  await commitOnTest(f.source, 'test-only.txt', 'test 分支已有成果\n');
  fs.writeFileSync(path.join(f.source, 'user-notes.txt'), '用户未提交内容\n');
  const refs = { main: await git(f.source, ['rev-parse', 'main']), dev: await git(f.source, ['rev-parse', 'dev']), test: await git(f.source, ['rev-parse', 'test']) };
  const store = await createRun(f.config, f.source, '把答案改为 42\n附加说明', { projectBranch: true });
  const created = store.load(), owned = created.projectBranch!;
  assert.equal(created.source, fs.realpathSync(f.source)); assert.notEqual(created.workspace, created.source);
  assert.equal(owned.baseCommit, refs.test); assert.equal(owned.branch, 'personalagent/' + store.id.slice(0, 8));
  assert.equal(await git(created.workspace, ['symbolic-ref', '--short', 'HEAD']), owned.branch);
  assert.ok(fs.existsSync(path.join(created.workspace, 'test-only.txt')));

  const state = await drive(store, agents());
  assert.equal(state.phase, 'completed', state.reason); assert.equal(state.projectBranch!.integration!.status, 'merged');
  assert.match(state.reason, /合并到 test/);
  assert.equal(await show(f.source, 'test:answer.cjs'), 'module.exports=42;');
  assert.equal(await show(f.source, 'test:test-only.txt'), 'test 分支已有成果');
  assert.equal(await git(f.source, ['rev-parse', 'test^1']), refs.test);
  assert.match(await git(f.source, ['log', '-1', '--format=%s', owned.branch]), new RegExp(`^PersonalAgent Run ${store.id.slice(0, 8)}：把答案改为 42$`));
  // Other branches and the user's own checkout stay exactly as they were.
  assert.equal(await git(f.source, ['rev-parse', 'main']), refs.main); assert.equal(await git(f.source, ['rev-parse', 'dev']), refs.dev);
  assert.equal(await git(f.source, ['symbolic-ref', '--short', 'HEAD']), 'main');
  assert.equal(fs.readFileSync(path.join(f.source, 'answer.cjs'), 'utf8'), 'module.exports=0;\n');
  assert.equal(fs.readFileSync(path.join(f.source, 'user-notes.txt'), 'utf8'), '用户未提交内容\n');
  assert.equal(fs.existsSync(created.workspace), false);
  const common = await git(f.source, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  assert.equal(fs.existsSync(path.join(common, 'personalagent-test-integration.lock')), false);
  assert.equal((await drive(store, agents())).phase, 'completed');
});

test('test that moved on is merged into the task branch first; a conflict leaves test untouched', async () => {
  const moved = await fixture('moved');
  const store = await createRun(moved.config, moved.source, '答案', { projectBranch: true });
  await commitOnTest(moved.source, 'later.txt', '并发成果\n');
  const result = await drive(store, agents());
  assert.equal(result.phase, 'completed', result.reason);
  assert.equal(await show(moved.source, 'test:later.txt'), '并发成果'); assert.equal(await show(moved.source, 'test:answer.cjs'), 'module.exports=42;');

  const conflict = await fixture('conflict');
  const conflicted = await createRun(conflict.config, conflict.source, '答案', { projectBranch: true });
  await commitOnTest(conflict.source, 'answer.cjs', 'module.exports=7;\n');
  const before = await git(conflict.source, ['rev-parse', 'test']);
  const paused = await drive(conflicted, agents());
  assert.equal(paused.phase, 'paused'); assert.equal(paused.userRequired, true); assert.match(paused.reason, /冲突/);
  assert.equal(await git(conflict.source, ['rev-parse', 'test']), before);
  assert.equal(await show(conflict.source, `${paused.projectBranch!.branch}:answer.cjs`), 'module.exports=42;');
  assert.equal(await git(paused.workspace, ['status', '--porcelain']), '');
});

test('a checked-out clean test moves with its files; a dirty one is protected', async () => {
  const f = await fixture('checked-out');
  await git(f.source, ['switch', 'test']);
  const store = await createRun(f.config, f.source, '答案', { projectBranch: true });
  assert.equal((await drive(store, agents())).phase, 'completed');
  assert.equal(read(path.join(f.source, 'answer.cjs')), 'module.exports=42;\n');

  const dirty = await fixture('checked-out-dirty');
  await git(dirty.source, ['switch', 'test']);
  const blocked = await createRun(dirty.config, dirty.source, '答案', { projectBranch: true });
  fs.writeFileSync(path.join(dirty.source, 'answer.cjs'), 'module.exports=1;\n');
  const paused = await drive(blocked, agents());
  assert.equal(paused.phase, 'paused'); assert.match(paused.reason, /未提交修改/);
  assert.equal(fs.readFileSync(path.join(dirty.source, 'answer.cjs'), 'utf8'), 'module.exports=1;\n');
  // After the user cleans up, resuming retries only the merge.
  await git(dirty.source, ['checkout', '--', 'answer.cjs']);
  const resumed = await drive(blocked, agents(), '已处理 test 工作区，继续合并');
  assert.equal(resumed.phase, 'completed', resumed.reason); assert.equal(resumed.projectBranch!.integration!.status, 'merged');
  assert.equal(read(path.join(dirty.source, 'answer.cjs')), 'module.exports=42;\n');
});
