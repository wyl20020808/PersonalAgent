import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { opencodeWindow } from '../src/opencode-context-limits.js';
import { ContextObservation, contextLimits, modelContexts, type ModelContext } from '../src/model-context.js';
import { Store, type State } from '../src/store.js';

test('OpenCode exact model lookup works offline; configured limits override official specifications', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'opencode-window-')), file = path.join(root, 'opencode.json');
  assert.equal(opencodeWindow('custom/gpt-6.1-sol', file)?.windowTokens, 1050000);
  assert.equal(opencodeWindow('custom/gpt-6.1-sol', file)?.windowSource, 'official-local-cache');
  for (const id of ['unknown', 'gpt-6.1-sol-custom', 'toString', 'constructor']) assert.equal(opencodeWindow('custom/' + id, file), undefined);
  writeFileSync(file, JSON.stringify({ providers: { custom: { models: { 'gpt-6.1-sol': { limit: { context: 272000 } } } } } }));
  assert.deepEqual(opencodeWindow('custom/gpt-6.1-sol', file), { windowTokens: 272000, windowSource: 'opencode-config' });
  writeFileSync(file, JSON.stringify({ provider: { custom: { models: { 'gpt-6.1-sol': { limit: { context: 32000 } } } } } }));
  assert.equal(opencodeWindow('custom/gpt-6.1-sol', file)?.windowTokens, 32000);
  writeFileSync(file, '{broken');
  assert.equal(opencodeWindow('custom/gpt-6.1-sol', file)?.windowTokens, 1050000);
});

test('OpenCode fallback is persisted before service launch; native window wins and survives resume', () => {
  const root = path.resolve('.validation', 'opencode-context-limits'), id = randomUUID(), store = new Store(root, id);
  const state = { id, config: { executionAgent: { backend: 'opencode', opencode: { providerID: 'fixture', modelID: 'gpt-6.1-sol' } } }, executionSession: { backend: 'opencode', sessionId: 'session' } } as State;
  const observation = new ContextObservation(state, store, 'execute', '{}');
  assert.equal(observation.snapshot.windowTokens, 1050000);
  assert.equal(observation.snapshot.compactAtTokens, 160000);
  assert.equal(observation.snapshot.usedTokens, null);
  assert.equal(observation.snapshot.windowSource, 'official-local-cache');
  observation.window(1050000, 'fixture/gpt-6.1-sol');
  assert.equal(observation.snapshot.windowSource, 'native');
  assert.equal(observation.snapshot.windowReference, undefined);
  observation.window(64000);
  assert.equal(new ContextObservation(state, store, 'execute', '{}').snapshot.windowTokens, 64000);
  state.executionSession!.sessionId = 'another';
  assert.equal(contextLimits(state, store, 'execution').window, 1050000);
  state.config.contextManagement = { modelWindows: { 'fixture/gpt-6.1-sol': 32000 } };
  assert.equal(new ContextObservation(state, store, 'execute', '{}').snapshot.windowTokens, 32000);
});

test('historical OpenCode unknown windows enrich for display without changing audit data or token usage', () => {
  const row = { role: 'execution', backend: 'opencode', configuredModel: 'fixture/claude-opus-5-5', windowTokens: null, usedTokens: 50000, measurement: 'estimated' } as ModelContext;
  const displayed = modelContexts([{ event: 'model-context', data: row }])[0]!;
  assert.equal(displayed.windowTokens, 1000000);
  assert.equal(displayed.windowCheckedAt, '2026-10-13');
  assert.equal(displayed.usedTokens, 50000);
  assert.equal(row.windowTokens, null);
  assert.equal(modelContexts([{ event: 'model-context', data: { ...row, windowTokens: 272000 } }])[0]!.windowTokens, 272000);
  assert.equal(modelContexts([{ event: 'model-context', data: { ...row, backend: 'codex' } }])[0]!.windowTokens, null);
});
