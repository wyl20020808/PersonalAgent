import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRun, drive } from '../src/controller.js';
import { Store, type Evidence } from '../src/store.js';
import { git } from '../src/workspace.js';
import { orderTasks } from '../src/dependencies.js';
import { reviewEvidence } from '../src/incremental.js';
import { recordClaudeCall } from '../src/agent-usage.js';
import { runProcess } from '../src/process.js';
import { configSchema, taskSchema, validate, type Config, type Task } from '../src/schema.js';
import type { Agents } from '../src/adapters.js';
import { RealAgents } from '../src/real-agents.js';

const root = path.resolve('.validation', `v02b-${randomUUID()}`); mkdirSync(root, { recursive: true });
const task = (id: string, dependsOn?: string[]): Task => ({ id, instruction: `Create ${id}.txt`, acceptance: [`${id}.txt exists`], ...(dependsOn ? { dependsOn } : {}) });
async function fixture(label: string, options: Partial<Config> = {}) {
  const dir = path.join(root, label); mkdirSync(dir);
  const repo = path.join(dir, 'source'); mkdirSync(repo); await git(repo, ['init']); writeFileSync(path.join(repo, 'seed.txt'), 'seed\n');
  await git(repo, ['add', '.']); await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'requirements']);
  const a = path.join(dir, 'stage-a.cjs'), b = path.join(dir, 'stage-b.cjs');
  writeFileSync(a, "require('node:assert/strict').ok(require('node:fs').existsSync('a.txt'));console.log('stage-a passed');");
  writeFileSync(b, "const fs=require('node:fs');const a=require('node:assert/strict');a.ok(fs.existsSync('a.txt'));a.ok(fs.existsSync('b.txt'));console.log('stage-b passed');");
  const config: Config = { mode: 'mock', runtimeDir: path.join(dir, 'runtime'), allowedRepositories: [repo], claudeExecutable: 'NEVER-SPAWN-CLAUDE', claudeStreaming: false, timeoutMs: 5000, maxLoops: 6, maxReworks: 1, tests: [{ executable: process.execPath, args: [a] }, { executable: process.execPath, args: [b] }], acceptanceStages: { first: [0], final: [0, 1] }, mockScenario: 'pass', ...options };
  const store = await createRun(config, repo, label); const executed: string[] = [];
  const agents: Agents = {
    async plan(state, storage) { state.claudeSessionId = 'mock-session'; if (state.config.mode === 'real') recordClaudeCall(state, storage, 'plan'); return { humanDecision: null, tasks: [{ ...task('b', ['a']), acceptanceStage: 'final' }, { ...task('a'), acceptanceStage: 'first' }] }; },
    async execute(state, storage) { const id = state.tasks[state.taskIndex]!.id; executed.push(id); state.codexThreadId = 'mock-thread'; storage.save(state); return { summary: id, changes: [{ path: `${id}.txt`, content: `${id}\n` }] }; },
    async review(state, storage) { if (state.config.mode === 'real') recordClaudeCall(state, storage, 'review'); return { verdict: state.evidence?.passed ? 'pass' : 'rework', reason: 'Independent evidence' }; }
  };
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ source: repo, state: store.file('state.json'), audit: store.file('audit.jsonl'), tests: [a, b] }, null, 2));
  return { dir, config, store, agents, executed, repo };
}
test('forward dependencies are topologically ordered and trusted stage tests execute progressively', async () => {
  const f = await fixture('dependencies'); const state = await drive(f.store, f.agents);
  assert.equal(state.phase, 'completed'); assert.deepEqual(f.executed, ['a', 'b']); assert.deepEqual(state.completedTaskIds, ['a', 'b']);
  const records = readFileSync(f.store.file('audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(records.filter(r => r.event === 'independent-check').map(r => r.data.tests.length), [1, 2]); assert.equal(await git(f.repo, ['status', '--porcelain']), '');
});
for (const [label, tasks] of [['missing', [task('a', ['absent'])]], ['cycle', [task('a', ['b']), task('b', ['a'])]], ['self', [task('a', ['a'])]], ['duplicate', [task('a'), task('a')]]] as [string, Task[]][]) test(`invalid dependency graph ${label} fails before executor`, async () => {
  const f = await fixture(`graph-${label}`); f.agents.plan = async () => ({ humanDecision: null, tasks });
  const state = await drive(f.store, f.agents); assert.equal(state.phase, 'failed'); assert.equal(state.failure?.kind, 'validation'); assert.equal(state.loops, 0); assert.equal(f.executed.length, 0);
});
test('duplicate dependsOn and unknown stage commands are rejected by schemas', () => {
  assert.throws(() => validate(taskSchema, task('a', ['b', 'b'])), /Schema/);
  assert.throws(() => validate(taskSchema, { ...task('a'), command: 'unsafe' }), /Schema/);
});
test('invalid stage and out of range configured test indexes fail before execute', async () => {
  const f = await fixture('stage-invalid', { acceptanceStages: { first: [19] } });
  const state = await drive(f.store, f.agents); assert.equal(state.phase, 'failed'); assert.equal(state.loops, 0);
  assert.throws(() => orderTasks([{ ...task('a'), acceptanceStage: 'unknown' }], f.config), /Invalid acceptance/);
});
test('failed prerequisite never advances dependent task, even when supervisor says pass', async () => {
  const f = await fixture('prerequisite-failed', { maxReworks: 0 });
  f.agents.execute = async () => ({ summary: 'wrong output', changes: [{ path: 'wrong.txt', content: 'wrong\n' }] });
  f.agents.review = async () => ({ verdict: 'pass', reason: 'Untrusted assertion' });
  const state = await drive(f.store, f.agents); assert.equal(state.phase, 'paused'); assert.equal(state.taskIndex, 0); assert.deepEqual(state.completedTaskIds, []); assert.equal(existsSync(path.join(state.workspace, 'b.txt')), false);
});
test('resume cannot skip an incomplete prerequisite through changed taskIndex', async () => {
  const f = await fixture('skip-prerequisite'); const state = f.store.load(); state.tasks = [task('a'), task('b', ['a'])]; state.taskIndex = 1; state.phase = 'execute'; delete state.completedTaskIds; f.store.save(state);
  const blocked = await drive(f.store, f.agents); assert.equal(blocked.failure?.kind, 'safety'); assert.equal(blocked.loops, 0);
});
test('task and round diffs exclude prior tasks and retain full run evidence', async () => {
  const f = await fixture('incremental'); const state = await drive(f.store, f.agents);
  assert.equal(state.phase, 'completed'); assert.match(state.evidence!.diff, /NEW FILE a.txt/); assert.match(state.evidence!.diff, /NEW FILE b.txt/);
  assert.match(state.evidence!.roundDiff!, /FILE b.txt/); assert.doesNotMatch(state.evidence!.roundDiff!, /FILE a.txt/); assert.doesNotMatch(state.evidence!.taskDiff!, /FILE a.txt/);
  assert.equal(state.evidence!.roundDiff, state.evidence!.taskDiff); assert.doesNotMatch(state.evidence!.roundDiff!, /PersonalAgent|baseline.json/);
  assert.equal((reviewEvidence(state.evidence) as { diffOmitted: boolean }).diffOmitted, false);
});
test('rework round diff shows previous-to-current while task diff keeps original baseline', async () => {
  const f = await fixture('rework-diff'); const execute = f.agents.execute;
  f.agents.execute = async (...args) => { const edits = await execute(...args); assert.ok('changes' in edits); if (args[0].taskIndex === 0 && args[0].loops === 1) edits.changes[0]!.content = 'wrong\n'; return edits; };
  let review = 0; const original = f.agents.review;
  f.agents.review = async (...args) => { review++; return review === 1 ? { verdict: 'rework', reason: 'Repair content' } : original(...args); };
  const state = await drive(f.store, f.agents); assert.equal(state.phase, 'completed');
  const checks = readFileSync(f.store.file('audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(r => r.event === 'independent-check');
  assert.match(checks[1].data.roundDiff, /-wrong/); assert.doesNotMatch(checks[1].data.taskDiff, /-wrong/); assert.match(checks[1].data.taskDiff, /\+a/);
});
test('context truncation preserves all critical issues, exits and output and prevents pass', async () => {
  const f = await fixture('omitted-context');
  f.agents.execute = async () => ({ summary: 'large file', changes: [{ path: 'a.txt', content: 'x'.repeat(140000) }] });
  f.agents.plan = async () => ({ humanDecision: null, tasks: [{ ...task('a'), acceptanceStage: 'first' }] });
  const state = await drive(f.store, f.agents); assert.equal(state.phase, 'paused'); assert.match(state.reason, /omitted diff/);
  const evidence: Evidence = { ...state.evidence!, issues: ['Deletion detected', 'Independent tests failed'], tests: [{ exitCode: 7, stdout: 'critical-tail', stderr: 'fatal' }], passed: false };
  const compressed = reviewEvidence(evidence) as Evidence & { diffOmitted: boolean };
  assert.deepEqual(compressed.issues, evidence.issues); assert.deepEqual(compressed.tests, evidence.tests); assert.equal(compressed.passed, false); assert.equal(compressed.diffOmitted, true);
});
test('compiled project artifacts do not displace source or dependency lock review', () => {
  const diff = '\nFILE dist/assets/game.js (added)\n+' + 'x'.repeat(500000) + '\nFILE validation/chrome-result.json (added)\n+' + 'x'.repeat(200000) + '\nFILE validation/check.js (added)\n+actual verifier\nFILE package-lock.json (added)\n+locked dependency\nFILE src/main.js (added)\n+actual game logic\n';
  const evidence: Evidence = { diff, roundDiff:diff, taskDiff:diff, head:'head', status:'A src/main.js', snapshotDigest:'snapshot', tests:[], executorExitCode:0, passed:true, issues:[] };
  const result = reviewEvidence(evidence) as {roundDiff:string;diffOmitted:boolean;artifactDiffs:{path:string;sha256:string}[];fullDiffHash:string};
  assert.equal(result.diffOmitted,false);
  assert.match(result.roundDiff,/locked dependency/);
  assert.match(result.roundDiff,/actual game logic/);
  assert.match(result.roundDiff,/actual verifier/);
  assert.equal(result.artifactDiffs.length,2);
  assert.match(result.artifactDiffs[0]!.path,/dist\/assets\/game.js/);
  assert.equal(result.artifactDiffs[0]!.sha256.length,64);
  assert.equal(evidence.diff,diff);
});

test('changed baseline hash fails closed rather than hide diff', async () => {
  const f = await fixture('baseline-tamper'); const execute = f.agents.execute;
  f.agents.execute = async (...args) => { const file = f.store.file('round-1-baseline.json'); const value = JSON.parse(readFileSync(file, 'utf8')); value.files['seed.txt'] = ''; writeFileSync(file, JSON.stringify(value)); return execute(...args); };
  const state = await drive(f.store, f.agents); assert.equal(state.phase, 'failed'); assert.equal(state.failure?.kind, 'safety');
});
test('real review adapter sends compact context with full failed test evidence without spawning CC', async () => {
  const f = await fixture('adapter-context'); let payload = '';
  const real = new RealAgents(f.config, async (_program, _args, options) => { payload = options.input!; return { exitCode: 0, stdout: JSON.stringify({ structured_output: { verdict: 'rework', reason: 'Failed test' } }), stderr: '' }; });
  const state = f.store.load(); state.tasks = [task('a')]; state.evidence = { diff: 'prior'.repeat(20000), taskDiff: 'current', roundDiff: 'current', head: state.base, status: '', snapshotDigest: 'digest', tests: [{ exitCode: 9, stdout: 'complete output', stderr: 'failure' }], executorExitCode: 0, passed: false, issues: ['Deletion detected'] };
  await real.review(state, f.store, new AbortController().signal); const sent = JSON.parse(payload);
  assert.equal(sent.evidence.diff, undefined); assert.equal(sent.evidence.roundDiff, 'current'); assert.deepEqual(sent.evidence.tests, state.evidence.tests); assert.deepEqual(sent.evidence.issues, state.evidence.issues); assert.ok(payload.length < JSON.stringify(state.evidence).length / 10);
  writeFileSync(path.join(f.dir, 'cost-comparison.json'), JSON.stringify({ fullEvidenceBytes: Buffer.byteLength(JSON.stringify(state.evidence)), actualReviewPromptBytes: Buffer.byteLength(payload), simulated: true }, null, 2));
});
for (const condition of ['missing','corrupt','exhausted','locked'] as const) test(`historical ${condition} ledger never gates new real Runs or mutates history`, async () => {
  const file = path.join(root, `legacy-${condition}.json`);
  const bytes = condition === 'corrupt' ? 'broken legacy JSON' : JSON.stringify({version:1,limit:1,used:1,reservations:[{runId:'old',call:1,role:'plan',time:'old'}]});
  if(condition !== 'missing') writeFileSync(file, bytes);
  if(condition === 'locked') writeFileSync(file+'.lock','stranded');
  for(const suffix of ['first','second']) {
    const f = await fixture(`global-${condition}-${suffix}`, {mode:'real',maxClaudeCalls:1,globalBudget:{file,limit:1}});
    const state = await drive(new Store(f.config.runtimeDir,f.store.id),f.agents);
    assert.equal(state.phase,'completed'); assert.equal(state.claudeCalls,3); assert.equal(state.loops,2);
    assert.deepEqual(state.config.globalBudget,{file,limit:1});
  }
  if(condition === 'missing') assert.equal(existsSync(file),false); else assert.equal(readFileSync(file,'utf8'),bytes);
  if(condition === 'locked') assert.equal(readFileSync(file+'.lock','utf8'),'stranded');
});

test('legacy configurations and states without dependencies or global authorization keep existing policy', async () => {
  const f = await fixture('legacy'); const config = { ...f.config }; delete config.acceptanceStages; config.tests = [config.tests[0]!]; validate(configSchema, config);
  const state = f.store.load(); state.config = config; delete state.completedTaskIds; state.tasks = [task('a')]; state.phase = 'execute'; f.store.save(state);
  const result = await drive(new Store(config.runtimeDir, f.store.id), f.agents); assert.equal(result.phase, 'completed'); assert.equal(result.config.globalBudget, undefined);
});
test('trusted task-to-stage mapping cannot be weakened or bypassed by planner', async () => {
  const f = await fixture('trusted-stage', { taskStages: { a: 'first', b: 'final' } });
  assert.equal((await drive(f.store, f.agents)).phase, 'completed');
  assert.throws(() => orderTasks([{ ...task('b'), acceptanceStage: 'first' }], f.config), /conflicts/);
  assert.throws(() => orderTasks([task('unmapped')], f.config), /conflicts/);
});


test('measured multi-task review cost drops while complete independent evidence remains', async () => {
  const f = await fixture('measured-cost'); const execute = f.agents.execute;
  f.agents.execute = async (...args) => { const edits = await execute(...args); assert.ok('changes' in edits); if (args[0].taskIndex === 0) edits.changes[0]!.content = `${'a'.repeat(999)}\n`.repeat(30); return edits; };
  const state = await drive(f.store, f.agents); assert.equal(state.phase, 'completed'); state.taskIndex = 1;
  let actualPrompt = '';
  const real = new RealAgents(f.config, async (_program, _args, options) => { actualPrompt = options.input!; return { exitCode: 0, stdout: JSON.stringify({ structured_output: { verdict: 'pass', reason: 'Evidence passed' } }), stderr: '' }; });
  await real.review(state, f.store, new AbortController().signal);
  const legacyPrompt = JSON.stringify({ action: 'Review current task against every acceptance criterion and independently collected diff, exit code and tests. pass only if every criterion is satisfied; rework with concrete fixes; human for user decisions. Passing advances to the next planned task. Keep reason concise, focus on defects or verified criteria.', task: state.tasks[state.taskIndex], evidence: state.evidence, feedback: state.feedback });
  const before = Buffer.byteLength(legacyPrompt), after = Buffer.byteLength(actualPrompt); assert.ok(after < before / 4);
  const sent = JSON.parse(actualPrompt); assert.deepEqual(sent.evidence.tests, state.evidence!.tests); assert.deepEqual(sent.evidence.issues, state.evidence!.issues); assert.equal(sent.evidence.diffOmitted, false);
  writeFileSync(path.join(f.dir, 'cost-comparison.json'), JSON.stringify({ legacyPromptBytes: before, incrementalPromptBytes: after, reductionPercent: (1 - after / before) * 100, fullDiffBytes: Buffer.byteLength(state.evidence!.diff), roundDiffBytes: Buffer.byteLength(state.evidence!.roundDiff!), realAgentCalls: 0, note: 'Actual isolated repository evidence; adapter process response injected. Bytes are not billed tokens.' }, null, 2));
});
