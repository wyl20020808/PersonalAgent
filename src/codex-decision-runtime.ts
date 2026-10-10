import type { CodexOptions } from '@openai/codex-sdk';

/** Use an explicitly selected official Windows sandbox without altering shared config. */
export function codexDecisionRuntime(env: Record<string, string>, platform = process.platform): CodexOptions {
  const selection = env.PERSONAL_AGENT_CODEX_DECISION_WINDOWS_SANDBOX;
  if (selection && !['elevated', 'unelevated'].includes(selection)) {
    throw Error('Unsupported Codex Decision Windows sandbox selection');
  }
  return { env, ...(platform === 'win32' && selection ? { config: { 'windows.sandbox': selection } } : {}) };
}
