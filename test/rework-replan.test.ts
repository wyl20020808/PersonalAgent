import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun, drive, REWORK_REPLAN_AFTER } from '../src/controller.js';
import { git } from '../src/workspace.js';
import type { Agents } from '../src/adapters.js';
import type { Config } from '../src/schema.js';

const root = path.resolve('.validation', 'rework-replan-' + randomUUID().slice(0, 8));

test('repeated rework hands the remaining work back for replanning and keeps accepted tasks', async () => {
  const dir = path.join(root, randomUUID().slice(0, 8)), source = path.join(dir, 'source'); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'result.txt'), 'before\n');
  await git(source, ['init']); await git(source, ['add', 'result.txt']);
  await git(source, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
  const config: Config = { mode: 'mock', mockScenario: 'pass', executionMode: 'native', projectMode: 'direct', directAuthorization: { projectPath: source, acknowledgedAt: new Date().toISOString() }, allowedRepositories: [source], runtimeDir: path.join(dir, 'runtime'), claudeExecutable: 'NEVER-PAID', timeoutMs: 5000, tests: [] };
  const store = await createRun(config, source, 'Finish first, then a task that is too large for one round');
  const plans: { replan: boolean; completed: string[] }[] = [], executed: string[] = [];
  const agents: Agents = { executionMode: 'native',
    async plan(state) {
      plans.push({ replan: !!state.reworkReplan, completed: [...state.completedTaskIds ?? []] });
      if (!state.reworkReplan) return { humanDecision: null, tasks: [{ id: 'first', instruction: 'Write first', acceptance: ['first exists'] }, { id: 'large', instruction: 'Too much for one round', acceptance: ['everything'] }] };
      assert.deepEqual(state.reworkReplan, { taskId: 'large', reworks: REWORK_REPLAN_AFTER });
      return { humanDecision: null, tasks: [{ id: 'large-a', instruction: 'Accept what is done', acceptance: ['done part'] }, { id: 'large-b', instruction: 'Finish the rest', acceptance: ['rest'] }] };
    },
    async execute(state) { const id = state.tasks[state.taskIndex]!.id; executed.push(id); fs.appendFileSync(path.join(state.workspace, 'result.txt'), id + ' ' + executed.length + '\n'); return { mode: 'native', summary: 'Local executor fixture' }; },
    async review(state) { return state.tasks[state.taskIndex]!.id === 'large' ? { verdict: 'rework', reason: 'Part is still missing' } : { verdict: 'pass', reason: 'Local decision fixture' }; } };
  const state = await drive(store, agents);
  assert.equal(state.phase, 'completed');
  assert.deepEqual(plans, [{ replan: false, completed: [] }, { replan: true, completed: ['first'] }]);
  assert.deepEqual(executed, ['first', ...Array(REWORK_REPLAN_AFTER + 1).fill('large'), 'large-a', 'large-b']);
  assert.deepEqual(state.tasks.map(task => task.id), ['first', 'large-a', 'large-b']);
  assert.deepEqual(state.completedTaskIds, ['first', 'large-a', 'large-b']);
  assert.equal(state.reworkReplan, undefined); assert.equal(state.feedback, '');
  const audit = fs.readFileSync(store.file('audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(audit.filter(event => event.event === 'rework-replan').length, 1);
  assert.equal(audit.find(event => event.event === 'rework-replan').data.taskId, 'large');
});
