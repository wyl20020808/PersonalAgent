import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codexDecisionRuntime } from '../src/codex-decision-runtime.js';

test('Windows compatibility selection is process-scoped, explicit and rejects unsandboxed values', () => {
  const env = { PERSONAL_AGENT_CODEX_DECISION_WINDOWS_SANDBOX: 'unelevated', CODEX_HOME: 'existing-home' };
  assert.deepEqual(codexDecisionRuntime(env, 'win32'), { env, config: { 'windows.sandbox': 'unelevated' } });
  assert.deepEqual(codexDecisionRuntime(env, 'linux'), { env });
  assert.deepEqual(codexDecisionRuntime({}, 'win32'), { env: {} });
  assert.throws(() => codexDecisionRuntime({ PERSONAL_AGENT_CODEX_DECISION_WINDOWS_SANDBOX: 'danger-full-access' }, 'win32'), /Unsupported/);
  assert.equal(env.CODEX_HOME, 'existing-home');
});
