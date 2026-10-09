import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordClaudeCall } from '../src/agent-usage.js';
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
test('CC usage persists across recovery beyond historical call limit', () => {
  const { store, state } = fixture();
  for (let index = 1; index <= 8; index++) { assert.equal(recordClaudeCall(state, store, index === 1 ? 'plan' : 'review'), index); assert.equal(store.load().claudeCalls, index); }
  assert.equal(recordClaudeCall(store.load(), store, 'review'), 9);
  assert.equal(store.load().claudeCalls, 9);
});
test('legacy config remains valid; invalid CC limits rejected', () => {
  const { state } = fixture(); const { maxClaudeCalls, ...legacy } = state.config;
  assert.doesNotThrow(() => validate(configSchema, legacy));
  assert.throws(() => validate(configSchema, { ...legacy, maxClaudeCalls: 0 }));
});
