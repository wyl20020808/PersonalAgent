import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reserveClaudeCall, ClaudeBudgetExceeded } from '../src/budget.js';
import { Store } from '../src/store.js';
import type { State } from '../src/store.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { configSchema, validate } from '../src/schema.js';

function fixture() {
  const config = { allowedRepositories: [process.cwd()], runtimeDir: path.resolve('.validation/budget-tests'), mode: 'real' as const, claudeExecutable: 'claude', timeoutMs: 1000, maxLoops: 4, maxReworks: 1, maxClaudeCalls: 8, tests: [{ executable: process.execPath, args: [] }], mockScenario: 'pass' as const };
  const store = new Store(config.runtimeDir, randomUUID());
  const state: State = { version: 1, id: store.id, goal: 'budget', source: config.allowedRepositories[0]!, workspace: store.file('workspace'), base: '', config, phase: 'planning', nextPhase: 'planning', tasks: [], taskIndex: 0, loops: 0, reworks: 0, claudeSessionId: 'test-session', codexThreadId: null, feedback: '', reason: '', evidence: null, executorExitCode: -1, updatedAt: '', beforeExecution: '' };
  return { store, state };
}
test('CC reservation persists before calls, survives recovery and refuses call nine', () => {
  const { store, state } = fixture();
  for (let index = 1; index <= 8; index++) { assert.equal(reserveClaudeCall(state, store, index === 1 ? 'plan' : 'review'), index); assert.equal(store.load().claudeCalls, index); }
  assert.throws(() => reserveClaudeCall(store.load(), store, 'review'), ClaudeBudgetExceeded);
  assert.equal(store.load().claudeCalls, 8);
});
test('legacy config remains valid; invalid CC limits rejected', () => {
  const { state } = fixture(); const { maxClaudeCalls, ...legacy } = state.config;
  assert.doesNotThrow(() => validate(configSchema, legacy));
  assert.throws(() => validate(configSchema, { ...legacy, maxClaudeCalls: 0 }));
});
