import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun, drive } from '../src/controller.js';
import { git } from '../src/workspace.js';
import { reviewSchema, validate, type Review } from '../src/schema.js';
import { codexOutputSchema, restoreOptionalFields } from '../src/codex-decision-turn.js';
import type { Agents } from '../src/adapters.js';
import type { Config } from '../src/schema.js';

const root = path.resolve('.validation', 'review-follow-ups-' + randomUUID().slice(0, 8));
async function run(followUps: (taskId: string) => Review['followUpTasks']) {
  const dir = path.join(root, randomUUID().slice(0, 8)), source = path.join(dir, 'source'); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'result.txt'), 'before\n');
  await git(source, ['init']); await git(source, ['add', 'result.txt']);
  await git(source, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
  const config: Config = { mode: 'mock', mockScenario: 'pass', executionMode: 'native', projectMode: 'direct', directAuthorization: { projectPath: source, acknowledgedAt: new Date().toISOString() }, allowedRepositories: [source], runtimeDir: path.join(dir, 'runtime'), claudeExecutable: 'NEVER-PAID', timeoutMs: 5000, tests: [] };
  const store = await createRun(config, source, 'Grow the plan from reviews'), executed: string[] = [];
  let plans = 0;
  const agents: Agents = { executionMode: 'native',
    async plan() { plans++; return { humanDecision: null, tasks: [{ id: 'a', instruction: 'Write a', acceptance: ['a written'] }] }; },
    async execute(state) { const id = state.tasks[state.taskIndex]!.id; executed.push(id); fs.appendFileSync(path.join(state.workspace, 'result.txt'), id + '\n'); return { mode: 'native', summary: 'Local executor ' + id }; },
    async review(state) { const id = state.tasks[state.taskIndex]!.id, more = followUps(id); return { verdict: 'pass', reason: 'Checked ' + id, ...(more ? { followUpTasks: more } : {}) }; } };
  const state = await drive(store, agents);
  const audit = fs.readFileSync(store.file('audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  return { state, executed, plans, audit };
}

test('a passing review appends follow-up tasks without another planning call or rework', async () => {
  const { state, executed, plans, audit } = await run(id => id === 'a' ? [{ id: 'b', instruction: 'Write b', acceptance: ['b written'] }, { id: 'c', instruction: 'Write c', acceptance: ['c written'], dependsOn: ['b'] }] : undefined);
  assert.equal(state.phase, 'completed'); assert.equal(plans, 1);
  assert.deepEqual(executed, ['a', 'b', 'c']); assert.deepEqual(state.completedTaskIds, ['a', 'b', 'c']);
  assert.equal(audit.filter(event => event.event === 'review' && event.data.verdict === 'rework').length, 0);
  assert.deepEqual(audit.find(event => event.event === 'review-follow-ups').data.added, ['b', 'c']);
});

test('follow-ups that reuse an ID are skipped and an unknown dependency is rejected without failing the Run', async () => {
  const reused = await run(id => id === 'a' ? [{ id: 'a', instruction: 'Again', acceptance: ['x'] }] : undefined);
  assert.equal(reused.state.phase, 'completed'); assert.deepEqual(reused.executed, ['a']);
  assert.deepEqual(reused.audit.find(event => event.event === 'review-follow-ups').data.skippedExisting, ['a']);
  const broken = await run(id => id === 'a' ? [{ id: 'd', instruction: 'Write d', acceptance: ['d'], dependsOn: ['missing'] }] : undefined);
  assert.equal(broken.state.phase, 'completed'); assert.deepEqual(broken.executed, ['a']);
  assert.match(broken.audit.find(event => event.event === 'review-follow-ups-rejected').data.reason, /missing/);
});

test('the structured-output form of the review schema round-trips follow-ups and their absence', () => {
  const wire = codexOutputSchema(reviewSchema);
  assert.ok(wire.required.includes('followUpTasks'));
  assert.deepEqual(validate(reviewSchema, restoreOptionalFields(reviewSchema, { verdict: 'pass', reason: 'ok', contextReview: null, contextConfirmations: null, followUpTasks: null })), { verdict: 'pass', reason: 'ok' });
  const task = { id: 'b', instruction: 'Write b', acceptance: ['b'], dependsOn: null, acceptanceStage: null, moduleIds: null };
  assert.deepEqual(restoreOptionalFields(reviewSchema, { verdict: 'pass', reason: 'ok', contextReview: null, contextConfirmations: null, followUpTasks: [task] }).followUpTasks, [{ id: 'b', instruction: 'Write b', acceptance: ['b'] }]);
});
