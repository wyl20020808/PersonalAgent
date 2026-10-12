import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FlowError } from './failure.js';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The installed V2 config is read only. Credentials stay in the child environment,
// never in the Controller config, IPC, receipts or a generated config file.
export function v1ProviderConfig(config: Record<string, any>): Record<string, any> {
  if (!config.providers) return { provider: config.provider ?? {}, plugin: [], ...(config.enabled_providers ? { enabled_providers: config.enabled_providers } : {}), ...(config.disabled_providers ? { disabled_providers: config.disabled_providers } : {}) };
  const packages: Record<string, string> = {
    '@opencode/ai/providers/openai-compatible': '@ai-sdk/openai-compatible',
    '@opencode/ai/providers/anthropic': '@ai-sdk/anthropic',
  };
  const provider: Record<string, any> = {};
  for (const [id, value] of Object.entries(config.providers)) {
    const p = value as Record<string, any>, npm = packages[p.package];
    if (!npm) throw new FlowError('supervisor', 'OpenCode V2 provider package cannot be mapped to V1; configure a supported V1 provider');
    provider[id] = { name: p.name, npm, options: p.settings ?? {}, models: Object.fromEntries(Object.entries(p.models ?? {}).map(([key, value]) => {
      const m = value as Record<string, any>;
      // Preserve configured IDs/body/limits; do not invent limits or tool support.
      // V1 reports image input as unsupported for custom models without a declaration, so an
      // undeclared model is projected as accepting images and the provider gives the real answer.
      const input = m.modalities ? { modalities: m.modalities, ...(m.attachment === undefined ? {} : { attachment: m.attachment }) } : m.attachment === false ? { attachment: false } : { attachment: true, modalities: { input: ['text', 'image'], output: ['text'] } };
      // V2 uses an array; V1 expects keyed options. Only declared compatible
      // effort names get the V1 SDK spelling, never invent additional variants.
      const variants = Array.isArray(m.variants) ? Object.fromEntries(m.variants.map((variant: Record<string, any>) => {
        const { reasoning_effort, ...body } = variant.body ?? {};
        const effort = npm === '@ai-sdk/openai-compatible' && ['none','minimal','low','medium','high','xhigh','max'].includes(variant.id) ? variant.id : undefined;
        return [variant.id, { ...(effort ? { reasoningEffort: effort } : {}), ...(variant.settings ?? {}), ...body, ...(reasoning_effort === undefined ? {} : { reasoningEffort: reasoning_effort }) }];
      })) : undefined;
      return [key, { id: m.modelID ?? key, name: m.name, ...input, ...(m.limit ? { limit: m.limit } : {}), ...(m.body ? { options: m.body } : {}), ...(variants ? { variants } : {}) }];
    })) };
  }
  return { provider, plugin: [] };
}
export function opencodeEnvironment(directory: string, runtimeDirectory?: string): NodeJS.ProcessEnv {
  const root = runtimeDirectory ?? path.join(process.env.PERSONAL_AGENT_OPENCODE_RUNTIME_DIR ?? (process.platform === 'win32' ? 'D:/PersonalAgent-data/opencode-v1' : path.join(os.tmpdir(), 'personal-agent-opencode')), 'discovery', createHash('sha256').update(directory).digest('hex'));
  const userConfig = process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE ?? path.join(os.homedir(), '.config/opencode/opencode.json');
  let config: Record<string, any> = {};
  if (fs.existsSync(userConfig)) {
    try { config = JSON.parse(fs.readFileSync(userConfig, 'utf8').replace(/^\uFEFF/, '')); }
    catch { throw new FlowError('supervisor', 'OpenCode config is not valid JSON; contents withheld'); }
  } else if (process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE) throw new FlowError('supervisor', 'OpenCode configured provider file not found');
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_DATA_HOME: path.join(root, 'data'), XDG_STATE_HOME: path.join(root, 'state'), XDG_CONFIG_HOME: path.join(root, 'config'), XDG_CACHE_HOME: path.join(root, 'cache'), TEMP: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), OPENCODE_DB: path.join(root, 'data/opencode.db'), OPENCODE_CONFIG_DIR: path.join(root, 'config/opencode'), OPENCODE_CONFIG_CONTENT: JSON.stringify(v1ProviderConfig(config)), OPENCODE_DISABLE_PROJECT_CONFIG: 'true', OPENCODE_DISABLE_AUTOUPDATE: 'true' };
  const serviceConfig = JSON.parse(env.OPENCODE_CONFIG_CONTENT!);
  serviceConfig.compaction = { ...config.compaction, auto: true };
  // OpenCode appends two 40-character keys to its private Git snapshot path.
  // Windows Git rejects long GIT_DIR values. These optional provider undo
  // snapshots are separate from Controller checkpoints and project backups.
  if(process.platform==='win32'&&path.join(root,'data','opencode','snapshot','x'.repeat(40),'x'.repeat(40)).length>=240)serviceConfig.snapshot=false;
  serviceConfig.plugin = [...(serviceConfig.plugin ?? []), pathToFileURL(fileURLToPath(new URL('../scripts/opencode-interaction-plugin.js', import.meta.url))).href];
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify(serviceConfig);
  fs.mkdirSync(env.TEMP!, { recursive: true }); fs.mkdirSync(env.OPENCODE_CONFIG_DIR!, { recursive: true });
  // Do not inherit paths/content that can reconnect to or mutate the user's V2 state.
  delete env.OPENCODE_CONFIG;
  delete env.OPENCODE_WORKSPACE_ID;
  return env;
}
