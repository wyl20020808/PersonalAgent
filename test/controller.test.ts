import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { MockAgents, type Agents } from '../src/adapters.js';
import { createRun, drive } from '../src/controller.js';
import { git, applyEdits } from '../src/workspace.js';
import { Store } from '../src/store.js';
import { configSchema, validate, type Config } from '../src/schema.js';
import { runProcess } from '../src/process.js';

const root = path.resolve('.validation', randomUUID()); mkdirSync(root, { recursive: true });
async function fixture(scenario: Config['mockScenario'] = 'pass', overrides: Partial<Config> = {}) {
  const dir = path.join(root, randomUUID()); mkdirSync(dir);
  const repo = path.join(dir, 'repo'); mkdirSync(repo);
  await git(repo, ['init']); writeFileSync(path.join(repo, 'seed.txt'), 'seed\n');
  await git(repo, ['add', '.']); await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'seed']);
  const testFile = path.join(dir, 'verify.cjs');
  writeFileSync(testFile, `const fs=require('node:fs'); const assert=require('node:assert/strict'); assert.equal(fs.readFileSync('hello.txt','utf8'),'hello\\n'); if(fs.existsSync('done.txt')) assert.equal(fs.readFileSync('done.txt','utf8'),'done\\n');`);
  const config: Config = { allowedRepositories: [repo], runtimeDir: path.join(dir, 'runtime'), mode: 'mock', claudeExecutable: 'claude', timeoutMs: 5000, maxLoops: 6, maxReworks: 2, tests: [{ executable: process.execPath, args: [testFile] }], mockScenario: scenario, ...overrides };
  const store = await createRun(config, repo, 'Create hello and done text files');
  return { config, repo, store };
}
test('complete mock loop: multiple tasks, independent tests, isolated source, audit chain', async () => {
  const { store, config, repo } = await fixture();
  const state = await drive(store, new MockAgents(config));
  assert.equal(state.phase, 'completed'); assert.equal(state.loops, 2);
  assert.ok(state.claudeSessionId); assert.ok(state.codexThreadId);
  assert.equal(state.evidence?.tests[0]?.exitCode, 0);
  assert.equal(await git(repo, ['status', '--porcelain']), ''); assert.equal(existsSync(path.join(repo, 'hello.txt')), false);
  let previous = '';
  for (const line of readFileSync(store.file('audit.jsonl'), 'utf8').trim().split('\n')) {
    const { hash, ...record } = JSON.parse(line); assert.equal(record.previousHash, previous);
    assert.equal(createHash('sha256').update(JSON.stringify(record)).digest('hex'), hash); previous = hash;
  }
});
test('test failures trigger rework; Claude cannot override independent failures', async () => {
  const { store, config } = await fixture('rework'); const mock = new MockAgents(config);
  mock.review = async () => ({ verdict: 'pass', reason: 'Trust me' });
  const state = await drive(store, mock); assert.equal(state.phase, 'completed'); assert.equal(state.loops, 4);
});
test('human pause and explicit resume persist sessions', async () => {
  const { store, config } = await fixture('human');
  const paused = await drive(store, new MockAgents(config)); assert.equal(paused.phase, 'paused');
  const resumedStore = new Store(config.runtimeDir, store.id);
  assert.equal((await drive(resumedStore, new MockAgents(config))).phase, 'paused');
  const state = await drive(resumedStore, new MockAgents(config), 'Proceed with specified acceptance');
  assert.equal(state.phase, 'paused'); // Next task independently requests another decision.
  assert.equal(state.taskIndex, 1); assert.equal(state.codexThreadId, paused.codexThreadId);
  assert.equal((await drive(resumedStore, new MockAgents(config), 'Proceed again')).phase, 'completed');
});
test('loop and rework bounds pause rather than claim success', async () => {
  const one = await fixture('pass', { maxLoops: 1 }); assert.equal((await drive(one.store, new MockAgents(one.config))).reason, 'Loop limit reached');
  const two = await fixture('rework', { maxReworks: 0 }); assert.equal((await drive(two.store, new MockAgents(two.config))).reason, 'Rework limit reached');
});
for (const scenario of ['invalid', 'escape', 'fail', 'timeout'] as const) test(`${scenario} persists failure and never alters source`, async () => {
  const { store, config, repo } = await fixture(scenario, { timeoutMs: scenario === 'timeout' ? 100 : 5000 });
  const state = await drive(store, new MockAgents(config)); assert.equal(state.phase, ['fail', 'timeout'].includes(scenario) ? 'paused' : 'failed');
  assert.equal(await git(repo, ['status', '--porcelain']), '');
  assert.equal(existsSync(store.file('escape.txt')), false);
});
test('stop request interrupts operation and can explicitly recover', async () => {
  const { store, config } = await fixture('timeout');
  const pending = drive(store, new MockAgents(config));
  const timer = setTimeout(() => writeFileSync(store.file('stop.request'), ''), 100);
  const state = await pending; clearTimeout(timer); assert.equal(state.phase, 'stopped');
  config.mockScenario = 'pass'; state.config = config; store.save(state);
  assert.equal((await drive(store, new MockAgents(config), 'Retry interrupted task')).phase, 'completed');
});
test('interrupted execution requires decision and rejects concurrent owner', async () => {
  const { store, config } = await fixture(); const state = store.load(); state.tasks = (await new MockAgents(config).plan(state)).tasks;
  state.phase = 'executing'; state.nextPhase = 'execute'; store.save(state);
  const unlock = store.lock(); await assert.rejects(drive(store, new MockAgents(config)), /locked/); unlock();
  assert.equal((await drive(store, new MockAgents(config))).phase, 'paused');
  assert.equal((await drive(store, new MockAgents(config), 'Retry')).phase, 'completed');
});
test('reject forbidden paths, duplicate targets, traversal and deletion payloads', async () => {
  const { store } = await fixture(); const workspace = store.load().workspace;
  for (const target of ['../x', '.git/config', 'C:/x', 'foo\\bar', 'NUL.txt', 'x:ads', '.codex/config.toml', 'AGENTS.md', 'foo./bar']) {
    assert.throws(() => applyEdits(workspace, { summary: 'x', changes: [{ path: target, content: 'x' }] }));
  }
  assert.throws(() => applyEdits(workspace, { summary: 'x', changes: [{ path: 'ok.txt', content: 'x' }, { path: '../bad', content: 'x' }] }));
  assert.equal(existsSync(path.join(workspace, 'ok.txt')), false);
  const bad = { ...store.load().config, tests: [{executable:'',args:[]}] }; assert.throws(() => validate(configSchema, bad));
});
test('legacy snapshot: no change cannot pass', async () => {
  const { store, config } = await fixture('nochange', { maxReworks: 0 });
  const legacy=store.load();delete legacy.snapshotPolicy;store.save(legacy);
  const state = await drive(store, new MockAgents(config));
  assert.equal(state.phase, 'paused'); assert.ok(state.evidence?.issues.includes('No verifiable diff'));
});
test('process runner captures nonzero exit and kills on timeout', async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.exit(7)'], { cwd: root, timeoutMs: 1000 }); assert.equal(result.exitCode, 7);
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { cwd: root, timeoutMs: 100 }), /Timeout/);
});
test('invalid persisted state is rejected', async () => {
  const { store } = await fixture(); writeFileSync(store.file('state.json'), '{"version":2}'); assert.throws(() => store.load(), /Schema/);
});
test('unallowed and dirty repositories rejected', async () => {
  const { config, repo } = await fixture();
  await assert.rejects(createRun({ ...config, allowedRepositories: [root] }, repo, 'x'), /allowed/);
  writeFileSync(path.join(repo, 'dirty.txt'), 'dirty'); await assert.rejects(createRun(config, repo, 'x'), /clean/);
});
test('review schema failure cannot advance', async () => {
  const { store, config } = await fixture(); const agents: Agents = new MockAgents(config);
  agents.review = async () => ({ verdict: 'merge', reason: 'x' }) as never;
  assert.equal((await drive(store, agents)).phase, 'failed');
});
test('legacy snapshot: later task cannot pass using previous task diff', async () => {
  const { store, config } = await fixture('pass', { maxReworks: 0 }); const mock = new MockAgents(config), execute = mock.execute.bind(mock);
  const legacy=store.load();delete legacy.snapshotPolicy;store.save(legacy);
  mock.execute = async (state, storage, signal) => state.taskIndex === 0 ? execute(state, storage, signal) : { summary: 'Nothing', changes: [] };
  const state = await drive(store, mock); assert.equal(state.phase, 'paused'); assert.equal(state.taskIndex, 1);
  assert.ok(state.evidence?.issues.includes('Current task made no changes'));
});
test('legacy snapshot: test mutating untracked content invalidates evidence', async () => {
  const { store, config } = await fixture('pass', { maxReworks: 0 });
  config.tests = [{ executable: process.execPath, args: ['-e', 'require("fs").writeFileSync("hello.txt","changed\\n")'] }];
  const state = store.load();delete state.snapshotPolicy; state.config = config; store.save(state);
  const result = await drive(store, new MockAgents(config)); assert.equal(result.phase, 'failed');
  assert.ok(result.evidence?.issues.includes('Tests modified workspace; review snapshot is invalid'));
});
test('absent loop and rework limits never pause the workflow', async () => {
  const { store, config } = await fixture('rework', { maxLoops: undefined, maxReworks: undefined });
  const state = await drive(store, new MockAgents(config));
  assert.equal(state.phase, 'completed'); assert.equal(state.config.maxLoops, undefined); assert.equal(state.config.maxReworks, undefined); assert.ok(state.loops >= 3); assert.ok((state.totalReworks ?? 0) >= 1);
});
test('manual decision can raise loop limit', async () => {
  const { store, config } = await fixture('pass', { maxLoops: 1 });
  assert.equal((await drive(store, new MockAgents(config))).phase, 'paused');
  assert.equal((await drive(store, new MockAgents(config), 'Allow one additional task', undefined, { maxLoops: 2 })).phase, 'completed');
});
test('unsafe persisted workspace and broken state release lock', async () => {
  const { store, config } = await fixture(); const state = store.load(); state.workspace = path.join(root, 'wrong'); store.save(state);
  await assert.rejects(drive(store, new MockAgents(config)), /path mismatch/); assert.equal(existsSync(store.file('lock.json')), false);
});
test('ignored agent output is rejected before application', async () => {
  const { store, config } = await fixture();
  writeFileSync(path.join(store.load().workspace, '.gitignore'), 'hidden.txt\n');
  const mock = new MockAgents(config); mock.execute = async () => ({ summary: 'hidden', changes: [{ path: 'hidden.txt', content: 'hidden' }] });
  const state = await drive(store, mock); assert.equal(state.phase, 'failed'); assert.match(state.reason, /Ignored edit target/);
  assert.equal(existsSync(path.join(state.workspace, 'hidden.txt')), false);
});
test('UTF-8 output survives byte boundaries', async () => {
  const result = await runProcess(process.execPath, ['-e', 'const b=Buffer.from("验收通过");let i=0;const t=setInterval(()=>{process.stdout.write(b.subarray(i,i+1));if(++i===b.length)clearInterval(t)},1)'], { cwd: root, timeoutMs: 5000 });
  assert.equal(result.stdout, '验收通过');
});
test('planner can pause before any executor work', async () => {
  const { store, config } = await fixture(); const mock = new MockAgents(config), plan = mock.plan.bind(mock);
  mock.plan = async state => state.feedback ? plan(state) : { humanDecision: 'Which behavior?', tasks: [] };
  const paused = await drive(store, mock); assert.equal(paused.phase, 'paused'); assert.equal(paused.loops, 0);
  assert.equal((await drive(store, mock, 'Use the stated behavior')).phase, 'completed');
});
test('timeout kills descendant process on Windows', { skip: process.platform !== 'win32' }, async () => {
  let pid: number | undefined;
  await assert.rejects(runProcess(process.execPath, ['-e', 'const {spawn}=require("child_process");const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore",windowsHide:true});console.log(c.pid);setInterval(()=>{},1000)'], { cwd: root, timeoutMs: 1000, onLine: line => { pid = Number(line.trim()); } }), /Timeout/);
  assert.ok(pid); assert.throws(() => process.kill(pid!, 0));
});
