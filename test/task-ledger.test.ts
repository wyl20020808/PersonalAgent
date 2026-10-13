import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun, drive } from '../src/controller.js';
import { git } from '../src/workspace.js';
import { atomicJson, type State, type Store } from '../src/store.js';
import { bindDecisionSession } from '../src/decision-agent.js';
import { ledgerBrief, taskLedger } from '../src/task-ledger.js';
import type { Agents } from '../src/adapters.js';
import type { Config } from '../src/schema.js';

const root = path.resolve('.validation', 'task-ledger-' + randomUUID().slice(0, 8));
async function fixture() {
  const dir = path.join(root, randomUUID().slice(0, 8)), source = path.join(dir, 'source'); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'result.txt'), 'before\n');
  await git(source, ['init']); await git(source, ['add', 'result.txt']);
  await git(source, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
  const config: Config = { mode: 'mock', mockScenario: 'pass', executionMode: 'native', projectMode: 'direct', directAuthorization: { projectPath: source, acknowledgedAt: new Date().toISOString() }, allowedRepositories: [source], runtimeDir: path.join(dir, 'runtime'), claudeExecutable: 'NEVER-PAID', timeoutMs: 5000, tests: [] };
  return { store: await createRun(config, source, 'Three small tasks') };
}
// A local decision Session of a given size, bound the way an adapter binds a real one.
function decisionSession(state: State, store: Store, id: string, usedTokens: number) {
  state.claudeSessionId = id; bindDecisionSession(state, store, id);
  atomicJson(store.file('context-window-decision.json'), { role: 'decision', backend: 'claude-code', configuredModel: null, model: null, sessionId: id, usedTokens, windowTokens: null, compactAtTokens: 120000, measurement: 'estimated', source: 'fixture', status: 'normal', compactions: 0, promptEstimate: 0, updatedAt: new Date().toISOString() });
}
function agents(sizes: number[], seen: (string | undefined)[]): Agents {
  let reviews = 0;
  return { executionMode: 'native',
    async plan() { return { humanDecision: null, tasks: ['a', 'b', 'c'].map(id => ({ id, instruction: `Write ${id}`, acceptance: [`${id} is written`] })) }; },
    async execute(state) { const id = state.tasks[state.taskIndex]!.id; fs.appendFileSync(path.join(state.workspace, 'result.txt'), id + '\n'); return { mode: 'native', summary: `Local executor wrote ${id}` }; },
    async review(state, store) { seen.push(state.decisionSession?.sessionId); if (!state.decisionSession) decisionSession(state, store, 'decision-' + reviews, sizes[reviews]!); reviews++; return { verdict: 'pass', reason: `Checked ${state.tasks[state.taskIndex]!.id}` }; } };
}

test('accepted tasks are written to the ledger from the Run\'s own records', async () => {
  const { store } = await fixture(), state = await drive(store, agents([10, 10, 10], []));
  assert.equal(state.phase, 'completed');
  const ledger = taskLedger(store);
  assert.deepEqual(ledger.map(entry => entry.id), ['a', 'b', 'c']);
  assert.deepEqual([ledger[1]!.instruction, ledger[1]!.outcome, ledger[1]!.review], ['Write b', 'Local executor wrote b', 'Checked b']);
  assert.ok(ledger[1]!.files?.some(line => line.includes('result.txt')));
  assert.deepEqual(ledgerBrief(store, state).map(entry => entry.id), ['a', 'b', 'c']);
  // Older entries shrink first when the brief is over its size.
  const small = ledgerBrief(store, state, 300);
  assert.equal(small[0]!.outcome, undefined); assert.equal(small.at(-1)!.id, 'c');
});

test('the decision Session rotates at a task boundary once it holds half its working budget, never after the last task', async () => {
  const seen: (string | undefined)[] = [], { store } = await fixture();
  // First Session reaches 70k of the 120k budget; its successor stays small.
  const state = await drive(store, agents([70000, 1000, 1000], seen));
  assert.equal(state.phase, 'completed');
  assert.deepEqual(seen, [undefined, undefined, 'decision-1']);
  assert.equal(state.decisionSession?.sessionId, 'decision-1');
  const rotated = fs.readFileSync(store.file('audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(event => event.event === 'decision-session-rotated');
  assert.equal(rotated.length, 1);
  assert.deepEqual([rotated[0].data.previousSession, rotated[0].data.occupancy, rotated[0].data.nextTaskId], ['decision-0', 70000, 'b']);
});

test('a small decision Session is kept across tasks', async () => {
  const seen: (string | undefined)[] = [], { store } = await fixture();
  await drive(store, agents([1000, 1000, 1000], seen));
  assert.deepEqual(seen, [undefined, 'decision-0', 'decision-0']);
});
