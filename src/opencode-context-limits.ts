import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface WindowMetadata {
  windowTokens: number;
  windowSource: 'opencode-config' | 'official-local-cache' | 'native' | 'controller-config';
  windowReference?: string;
  windowCheckedAt?: string;
}
// Locally saved official specifications, checked 2026-10-13. Exact IDs only:
// upstream specifications do not establish a reseller's actual serving limit.
export const officialWindows: Record<string, { tokens: number; url: string }> = {
  'gpt-6.1-sol': { tokens: 1050000, url: 'https://developers.openai.com/api/docs/models/gpt-6.1-sol' },
  'claude-opus-5-5': { tokens: 1000000, url: 'https://platform.claude.com/docs/en/models/opus-5-5/overview' },
  'claude-sonnet-5': { tokens: 1000000, url: 'https://platform.claude.com/docs/en/models/sonnet-5/overview' },
  'gemini-3.8-flash': { tokens: 1048576, url: 'https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash' },
  'deepseek-v4.1-flash': { tokens: 1000000, url: 'https://api-docs.deepseek.com/quick_start/pricing/' },
  'deepseek-v4-pro-0813': { tokens: 1000000, url: 'https://api-docs.deepseek.com/quick_start/pricing/' },
  'deepseek-v4-flash-0731': { tokens: 1048576, url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731/blob/main/config.json' },
};
export function validWindow(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
/** No network or model request; credentials never leave the existing config file. */
export function opencodeWindow(model: string | null, configFile = process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE ?? path.join(os.homedir(), '.config/opencode/opencode.json')): WindowMetadata | undefined {
  if (!model) return;
  const slash = model.indexOf('/'); if (slash < 1) return;
  const providerID = model.slice(0, slash), modelID = model.slice(slash + 1);
  try {
    const config = JSON.parse(readFileSync(configFile, 'utf8').replace(/^\uFEFF/, ''));
    const declaration = config.providers?.[providerID]?.models?.[modelID] ?? config.provider?.[providerID]?.models?.[modelID];
    const value = declaration?.limit?.context;
    if (validWindow(value)) return { windowTokens: value, windowSource: 'opencode-config' };
  } catch { /* Missing or invalid configuration cannot block context display. */ }
  if (!Object.hasOwn(officialWindows, modelID)) return;
  const entry = officialWindows[modelID]!;
  return { windowTokens: entry.tokens, windowSource: 'official-local-cache', windowReference: entry.url, windowCheckedAt: '2026-10-13' };
}
