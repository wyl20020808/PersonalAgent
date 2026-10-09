import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createRun, drive as controllerDrive } from '../src/controller.js';
import { Store, type State } from '../src/store.js';
import { git, snapshot } from '../src/workspace.js';
import { prepareApplication } from '../src/application.js';
import { recordClaudeCall } from '../src/agent-usage.js';
import { FlowError, classifyFailure } from '../src/failure.js';
import type { Agents } from '../src/adapters.js';
import type { Config, Review } from '../src/schema.js';
import { RealAgents } from '../src/real-agents.js';

const root = path.resolve('.validation', `v02a-${randomUUID()}`); mkdirSync(root, { recursive: true });
// Local injected adapters exercise real mode without authorization or paid calls.
const drive = controllerDrive;
async function fixture(label: string, options: Partial<Config> = {}) {
  const dir = path.join(root, label); mkdirSync(dir);
  const repo = path.join(dir, 'source'); mkdirSync(repo); await git(repo, ['init']);
  writeFileSync(path.join(repo, 'seed.txt'), 'unchanged\n'); await git(repo, ['add', '.']);
  await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'requirements seed']);
  const control = path.join(dir, 'control.json'), testFile = path.join(dir, 'independent.cjs');
  writeFileSync(control, JSON.stringify({ hang: false }));
  writeFileSync(testFile, `const fs=require('node:fs');const a=require('node:assert/strict');const control=JSON.parse(fs.readFileSync(${JSON.stringify(control)},'utf8'));if(control.hang)setInterval(()=>{},1000);else{a.equal(fs.readFileSync('result.txt','utf8'),'ok\\n');console.log('independent acceptance passed');}`);
  const config: Config = { allowedRepositories: [repo], runtimeDir: path.join(dir, 'runtime'), mode: 'real', claudeExecutable: 'NEVER-SPAWN-CLAUDE', claudeStreaming: false, maxLoops: 4, maxReworks: 1, maxClaudeCalls: 10, timeoutMs: 5000, tests: [{ executable: process.execPath, args: [testFile] }], mockScenario: 'pass', ...options };
  const store = await createRun(config, repo, label);
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ label, source: repo, stateFile: store.file('state.json'), auditFile: store.file('audit.jsonl'), testFile }, null, 2));
  let executions = 0, reviews = 0;
  const agents: Agents = {
    async plan(state, storage) {
      state.claudeSessionId ??= 'fake-cc-session'; recordClaudeCall(state, storage, 'plan');
      return { humanDecision: null, tasks: [{ id: 'result', instruction: 'Produce result.txt', acceptance: ['Fixed external script passes'] }] };
    },
    async execute(state, storage) { executions++; state.codexThreadId ??= 'fake-sdk-thread'; storage.save(state); return { summary: 'Produce result', changes: [{ path: 'result.txt', content: 'ok\n' }] }; },
    async review(state, storage) { reviews++; recordClaudeCall(state, storage, 'review'); return { verdict: state.evidence?.passed ? 'pass' : 'rework', reason: state.evidence?.passed ? 'Evidence passed' : 'Repair independent failure' }; }
  };
  return { store, agents, repo, control, config, executions: () => executions, reviews: () => reviews };
}
test('independent failure then bounded repair uses supervisor and preserves counters', async () => {
  const f = await fixture('repair-success'); const execute = f.agents.execute;
  f.agents.execute = async (...args) => { const edits = await execute(...args); assert.ok('changes' in edits); if (args[0].loops === 1) edits.changes[0]!.content = 'wrong\n'; return edits; };
  const state = await drive(f.store, f.agents); assert.equal(state.phase, 'completed'); assert.equal(state.loops, 2); assert.equal(state.totalReworks, 1); assert.equal(state.claudeCalls, 3); assert.equal(f.reviews(), 2);
  const checks = readFileSync(f.store.file('audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(event => event.event === 'independent-check');
  assert.deepEqual(checks.map(event => event.data.passed), [false, true]); assert.equal(checks[0].data.tests[0].exitCode, 1);
  assert.equal(await git(f.repo, ['status', '--porcelain']), ''); assert.equal(state.codexThreadId, 'fake-sdk-thread');
});
test('rework limit cannot be bypassed by repeated resume; explicit increase preserves totals', async () => {
  const f = await fixture('repair-limit'); const execute = f.agents.execute;
  f.agents.execute = async (...args) => { const edits = await execute(...args); assert.ok('changes' in edits); edits.changes[0]!.content = `wrong-${args[0].loops}\n`; return edits; };
  const paused = await drive(f.store, f.agents); assert.equal(paused.phase, 'paused'); assert.equal(paused.reworks, 1); assert.equal(paused.loops, 2);
  for (let i = 0; i < 2; i++) { const state = await drive(new Store(f.config.runtimeDir, f.store.id), f.agents, 'Retry'); assert.equal(state.loops, 2); assert.equal(state.claudeCalls, 3); assert.equal(state.reason, 'Rework limit reached'); }
  f.agents.execute = execute;
  const recovered = await drive(f.store, f.agents, 'Authorize one more repair', undefined, { maxReworks: 2 });
  assert.equal(recovered.phase, 'completed'); assert.equal(recovered.loops, 3); assert.equal(recovered.claudeCalls, 4);
});
test('ASK_HUMAN stays paused; FAIL is terminal and cannot resubmit', async () => {
  const f = await fixture('human-then-fail');
  f.agents.review = async (state, storage): Promise<Review> => { recordClaudeCall(state, storage, 'review'); return { verdict: state.feedback ? 'fail' : 'human', reason: 'User choice required' }; };
  const paused = await drive(f.store, f.agents); assert.equal(paused.phase, 'paused');
  assert.equal((await drive(f.store, f.agents)).claudeCalls, 2);
  const rejected = await drive(f.store, f.agents, 'Reject this objective'); assert.equal(rejected.phase, 'failed'); assert.equal(rejected.failure?.kind, 'rejected');
  assert.equal((await drive(f.store, f.agents, 'Retry')).claudeCalls, 3); assert.equal(f.executions(), 1);
});
for (const kind of ['executor', 'authentication', 'timeout'] as const) test(`${kind} pauses, consumes attempt, requires explicit resume and keeps IDs`, async () => {
  const f = await fixture(`executor-${kind}`); const execute = f.agents.execute;
  f.agents.execute = async (state, storage, signal) => { await execute(state, storage, signal); throw new FlowError(kind, `Injected ${kind}`); };
  const paused = await drive(f.store, f.agents); assert.equal(paused.phase, 'paused'); assert.equal(paused.failure?.kind, kind); assert.equal(paused.loops, 1); assert.equal(paused.claudeCalls, 1);
  assert.equal((await drive(new Store(f.config.runtimeDir, f.store.id), f.agents)).loops, 1);
  f.agents.execute = execute;
  const recovered = await drive(f.store, f.agents, 'Issue corrected; retry once'); assert.equal(recovered.phase, 'completed'); assert.equal(recovered.loops, 2); assert.equal(recovered.claudeCalls, 2); assert.equal(recovered.codexThreadId, paused.codexThreadId); assert.equal(recovered.claudeSessionId, paused.claudeSessionId);
});
test('actual executor timeout aborts adapter and preserves bounded retry', async () => {
  const f = await fixture('actual-executor-timeout', { timeoutMs: 100 });
  f.agents.execute = async (_state, _store, signal) => { await delay(10000, undefined, { signal }); throw new Error('unreachable'); };
  const state = await drive(f.store, f.agents); assert.equal(state.phase, 'paused'); assert.equal(state.failure?.kind, 'timeout'); assert.equal(state.loops, 1);
});
test('independent test process timeout resumes verification without executing or applying again', async () => {
  const f = await fixture('test-process-timeout', { timeoutMs: 250 }); writeFileSync(f.control, JSON.stringify({ hang: true }));
  const paused = await drive(f.store, f.agents); assert.equal(paused.phase, 'paused'); assert.equal(paused.failure?.kind, 'timeout'); assert.equal(paused.nextPhase, 'verify');
  const file = path.join(paused.workspace, 'result.txt'), mtime = statSync(file).mtimeMs;
  writeFileSync(f.control, JSON.stringify({ hang: false }));
  const recovered = await drive(f.store, f.agents, 'External test hang corrected'); assert.equal(recovered.phase, 'completed'); assert.equal(recovered.loops, 1); assert.equal(f.executions(), 1); assert.equal(statSync(file).mtimeMs, mtime);
});
test('historical CC limit never blocks execution or review; counters remain durable', async () => {
  const f = await fixture('cc-budget', { maxClaudeCalls: 1 });
  const done = await drive(f.store, f.agents);
  assert.equal(done.phase, 'completed'); assert.equal(done.claudeCalls, 2); assert.equal(done.loops, 1);
  assert.equal(f.executions(), 1); assert.equal(new Store(f.config.runtimeDir, f.store.id).load().config.maxClaudeCalls, 1);
});

test('supervisor authentication failure consumes call and resumes same planning session', async () => {
  const f = await fixture('cc-auth'); const plan = f.agents.plan;
  f.agents.plan = async (state, storage) => { await plan(state, storage, new AbortController().signal); throw new FlowError('authentication', '401 OAuth token expired'); };
  const paused = await drive(f.store, f.agents); assert.equal(paused.phase, 'paused'); assert.equal(paused.claudeCalls, 1); assert.equal(paused.loops, 0);
  f.agents.plan = plan; const done = await drive(f.store, f.agents, 'Authentication corrected'); assert.equal(done.phase, 'completed'); assert.equal(done.claudeCalls, 3); assert.equal(done.claudeSessionId, paused.claudeSessionId);
});
test('partial durable application rolls forward without resubmission or rewriting existing content', async () => {
  const f = await fixture('partial-application'); const state = f.store.load(); state.tasks = (await f.agents.plan(state, f.store, new AbortController().signal)).tasks;
  state.codexThreadId = 'fake-sdk-thread'; state.loops = 1; state.beforeExecution = await snapshot(state.workspace); state.phase = 'executing'; state.nextPhase = 'execute'; state.executorExitCode = 0; f.store.save(state);
  prepareApplication(f.store, state, { summary: 'Durable two-file proposal', changes: [{ path: 'result.txt', content: 'ok\n' }, { path: 'extra.txt', content: 'extra\n' }] });
  const file = path.join(state.workspace, 'result.txt'); writeFileSync(file, 'ok\n'); const mtime = statSync(file).mtimeMs;
  const done = await drive(new Store(f.config.runtimeDir, f.store.id), f.agents); assert.equal(done.phase, 'completed'); assert.equal(done.loops, 1); assert.equal(f.executions(), 0); assert.equal(statSync(file).mtimeMs, mtime); assert.equal(readFileSync(path.join(state.workspace, 'extra.txt'), 'utf8'), 'extra\n'); assert.equal(done.claudeCalls, 2);
});
test('application conflict fails closed before another file is written', async () => {
  const f = await fixture('application-conflict'); const state = f.store.load(); state.tasks = (await f.agents.plan(state, f.store, new AbortController().signal)).tasks; state.loops = 1; state.phase = 'applying'; state.executorExitCode = 0; f.store.save(state);
  prepareApplication(f.store, state, { summary: 'proposal', changes: [{ path: 'result.txt', content: 'ok\n' }, { path: 'extra.txt', content: 'extra\n' }] }); writeFileSync(path.join(state.workspace, 'result.txt'), 'unexpected human edit\n');
  const failed = await drive(f.store, f.agents); assert.equal(failed.phase, 'failed'); assert.equal(failed.failure?.kind, 'safety'); assert.equal(existsSync(path.join(state.workspace, 'extra.txt')), false); assert.equal(f.executions(), 0);
});
test('durable review receipt resumes after simulated crash without another CC call', async () => {
  const f = await fixture('review-receipt', { maxClaudeCalls: 2 }); const complete = await drive(f.store, f.agents); assert.equal(complete.phase, 'completed');
  const crash: State = { ...complete, phase: 'review', taskIndex: 0 }; f.store.save(crash); const mtime = statSync(path.join(crash.workspace, 'result.txt')).mtimeMs;
  f.agents.review = async () => { throw new Error('Review must never be called again'); };
  const resumed = await drive(new Store(f.config.runtimeDir, f.store.id), f.agents); assert.equal(resumed.phase, 'completed'); assert.equal(resumed.claudeCalls, 2); assert.equal(resumed.loops, 1); assert.equal(statSync(path.join(crash.workspace, 'result.txt')).mtimeMs, mtime);
  assert.ok(readdirSync(f.store.dir).some(file => file.startsWith('review-')));
});
test('malformed executor output stays fatal; diagnostics distinguish authentication and validation', async () => {
  const f = await fixture('invalid-proposal'); f.agents.execute = async () => ({ unexpected: 'bad' }) as never;
  const failed = await drive(f.store, f.agents); assert.equal(failed.phase, 'failed'); assert.equal(failed.failure?.kind, 'validation');
  assert.equal((await drive(f.store, f.agents, 'Retry')).loops, 1); assert.equal(existsSync(path.join(failed.workspace, 'result.txt')), false);
  assert.equal(classifyFailure(new Error('401 OAuth access token expired'), 'review').kind, 'authentication');
});
test('supervisor review timeout resumes checks, keeps written files and bills both attempts', async () => {
  const f = await fixture('review-timeout', { timeoutMs: 250 }); const review = f.agents.review;
  f.agents.review = async (state, storage, signal) => { recordClaudeCall(state, storage, 'review'); await delay(10000, undefined, { signal }); throw new Error('unreachable'); };
  const paused = await drive(f.store, f.agents); assert.equal(paused.phase, 'paused'); assert.equal(paused.failure?.kind, 'timeout'); assert.equal(paused.claudeCalls, 2);
  const mtime = statSync(path.join(paused.workspace, 'result.txt')).mtimeMs;
  f.agents.review = review;
  const recovered = await drive(f.store, f.agents, 'Review service recovered'); assert.equal(recovered.phase, 'completed'); assert.equal(recovered.claudeCalls, 3); assert.equal(recovered.loops, 1); assert.equal(f.executions(), 1); assert.equal(statSync(path.join(paused.workspace, 'result.txt')).mtimeMs, mtime);
});
test('real supervisor adapter classifies injected 401 JSON without launching CC', async () => {
  const f = await fixture('adapter-cc-auth'); let invocations = 0;
  const real = new RealAgents(f.config, async () => { invocations++; return { exitCode: 1, stdout: JSON.stringify({ is_error: true, result: '401 OAuth access token expired' }), stderr: '' }; });
  const state = await drive(f.store, { ...f.agents, plan: real.plan.bind(real) });
  assert.equal(state.phase, 'paused'); assert.equal(state.failure?.kind, 'authentication'); assert.equal(state.claudeCalls, 1); assert.ok(state.claudeSessionId); assert.equal(invocations, 1); assert.equal(state.loops, 0);
});
test('real SDK adapter classifies injected worker failure without launching SDK', async () => {
  const f = await fixture('adapter-sdk-auth'); mkdirSync(path.join(f.config.runtimeDir, 'codex'), { recursive: true }); writeFileSync(path.join(f.config.runtimeDir, 'codex/auth.json'), '{}');
  const real = new RealAgents(f.config, async (_program, _args, options) => { options.onLine?.(JSON.stringify({ type: 'thread', id: 'fake-sdk-thread' })); return { exitCode: 1, stdout: '', stderr: '401 authentication failed' }; });
  const state = await drive(f.store, { ...f.agents, execute: real.execute.bind(real) });
  assert.equal(state.phase, 'paused'); assert.equal(state.failure?.kind, 'authentication'); assert.equal(state.executorExitCode, 1); assert.equal(state.codexThreadId, 'fake-sdk-thread'); assert.equal(state.loops, 1);
});
test('repeated execution failure cannot evade per-task retry cap', async () => {
  const f = await fixture('persistent-executor-failure'); f.agents.execute = async () => { throw new FlowError('executor', 'worker exits 7'); };
  assert.equal((await drive(f.store, f.agents)).loops, 1);
  assert.equal((await drive(f.store, f.agents, 'Retry once')).loops, 2);
  const blocked = await drive(f.store, f.agents, 'Retry again'); assert.equal(blocked.phase, 'paused'); assert.equal(blocked.reason, 'Rework limit reached'); assert.equal(blocked.loops, 2); assert.equal(blocked.totalReworks, 1);
});
test('read-only execution snapshot conflict rejects proposal before application', async () => {
  const f = await fixture('executor-mutates-workspace'); const execute = f.agents.execute;
  f.agents.execute = async (...args) => { writeFileSync(path.join(args[0].workspace, 'seed.txt'), 'unexpected\n'); return execute(...args); };
  const state = await drive(f.store, f.agents); assert.equal(state.phase, 'failed'); assert.equal(state.failure?.kind, 'safety'); assert.equal(existsSync(path.join(state.workspace, 'result.txt')), false);
});
test('recovery cannot weaken proposal size limits through a corrupted journal', async () => {
  const f = await fixture('journal-size-limit'); const state = f.store.load(); state.tasks = (await f.agents.plan(state, f.store, new AbortController().signal)).tasks; state.loops = 1; state.phase = 'applying'; f.store.save(state);
  prepareApplication(f.store, state, { summary: 'small', changes: [{ path: 'one.txt', content: 'small' }, { path: 'two.txt', content: 'small' }, { path: 'three.txt', content: 'small' }] });
  const file = f.store.file('application-1.json'); const journal = JSON.parse(readFileSync(file, 'utf8')); journal.edits.changes.forEach((change: { content: string }) => { change.content = 'x'.repeat(750000); }); writeFileSync(file, JSON.stringify(journal));
  const failed = await drive(f.store, f.agents); assert.equal(failed.phase, 'failed'); assert.equal(failed.failure?.kind, 'safety'); assert.equal(existsSync(path.join(state.workspace, 'one.txt')), false);
});
