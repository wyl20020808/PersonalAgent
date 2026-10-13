import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { sharedSkills, userSkillRoots, claudeSharedSkillPlugin, codexSharedSkillGuidance } from '../src/shared-skills.js';
import { v1ProviderConfig, opencodeEnvironment, opencodeNativeCapabilities } from '../src/opencode-runtime.js';
import { nativeExecutionPermissions } from '../src/opencode-execution-agent.js';
import { hookDecision } from '../scripts/codex-interaction-hook.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'personalagent-skills-'));
function skill(directory: string, name: string, text = 'Instruction-only local skill') {
  fs.mkdirSync(path.join(directory, name), { recursive: true });
  fs.writeFileSync(path.join(directory, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${text}\n---\nRead references/proof.txt when invoked.\n`);
  fs.mkdirSync(path.join(directory, name, 'references')); fs.writeFileSync(path.join(directory, name, 'references/proof.txt'), name);
}

test('shared user skills use native roots, reject invalid metadata and retain source precedence', () => {
  const home = path.join(root, 'home'), env = { CODEX_HOME: path.join(home, 'custom-codex'), CLAUDE_CONFIG_DIR: path.join(home, 'custom-claude'), PERSONAL_AGENT_OPENCODE_CONFIG_FILE: path.join(home, 'opencode/user.json') };
  const roots = userSkillRoots(env, home); skill(roots[0]!, 'shared-proof'); skill(roots[1]!, 'shared-proof', 'Native Claude wins'); skill(roots[3]!, 'open-proof');
  fs.mkdirSync(path.join(roots[0]!, 'broken')); fs.writeFileSync(path.join(roots[0]!, 'broken/SKILL.md'), 'not a skill');
  const result = sharedSkills(roots); assert.deepEqual(result.skills.map(s => s.name), ['shared-proof', 'open-proof']); assert.equal(result.errors.length, 1);
  const plugin = claudeSharedSkillPlugin(path.join(root, 'runtime'), env); assert.deepEqual(plugin.names, ['open-proof']); assert.ok(plugin.path);
  assert.equal(fs.readFileSync(path.join(plugin.path!, 'skills/open-proof/references/proof.txt'), 'utf8'), 'open-proof');
  assert.equal(claudeSharedSkillPlugin(path.join(root, 'runtime'), env).path, plugin.path);
  const catalog = codexSharedSkillGuidance(env); assert.match(catalog, /open-proof/); assert.doesNotMatch(catalog, /shared-proof:/);
});

test('OpenCode conversion preserves MCP, native instructions, tools, plugins and skill roots without mutating user config', () => {
  const source = { providers: {}, plugins: ['user-plugin'], mcp: { servers: { serena: { type: 'local', command: ['fixture'], disabled: false, timeout: { startup: 120000 }, env: { FIXTURE: 'local' } }, disabled: { type: 'remote', url: 'https://example.invalid', disabled: true } } }, skills: ['/fixture/skills', 'https://example.invalid/skills'], instructions: ['RULES.md'], agent: { build: { description: 'Native agent' } }, tools: { webfetch: false }, permission: { skill: { private: 'deny' } } };
  const bytes = JSON.stringify(source), converted = v1ProviderConfig(source);
  assert.deepEqual(converted.plugin, ['user-plugin']); assert.equal(converted.mcp.serena.enabled, true); assert.equal(converted.mcp.serena.timeout, 120000); assert.deepEqual(converted.mcp.serena.environment, { FIXTURE: 'local' }); assert.equal(converted.mcp.disabled.enabled, false);
  assert.deepEqual(converted.skills, { paths: ['/fixture/skills'], urls: ['https://example.invalid/skills'] }); assert.deepEqual(converted.agent, source.agent); assert.deepEqual(converted.instructions, source.instructions); assert.deepEqual(converted.permission, source.permission); assert.deepEqual(converted.tools, source.tools); assert.equal(JSON.stringify(source), bytes);
  const prior = process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE, file = path.join(root, 'user.json'); fs.writeFileSync(file, JSON.stringify({ ...source, skills: { paths: ['skills'] } })); process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE = file;
  try { const env = opencodeEnvironment(root, path.join(root, 'opencode')); const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT!); assert.equal(config.skills.paths[0], path.join(root, 'skills')); assert.equal(config.plugin[0], 'user-plugin'); assert.match(config.plugin.at(-1), /opencode-interaction-plugin/); const capabilities = opencodeNativeCapabilities(env); assert.deepEqual(capabilities.mcpNames, ['serena']); const permissions = nativeExecutionPermissions(capabilities); assert.ok(permissions.some(rule => rule.permission === 'skill' && rule.action === 'allow')); assert.ok(permissions.some(rule => rule.permission === 'serena_*' && rule.action === 'allow')); assert.ok(permissions.some(rule => rule.permission === 'external_directory' && rule.pattern === '*' && rule.action === 'deny')); assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).plugins, ['user-plugin']); }
  finally { if (prior === undefined) delete process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE; else process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE = prior; }
});

test('work Hook permits instruction loading and scoped Serena reads while rejecting desktop, edits and other projects', () => {
  const policy = path.join(root, 'work.json'); fs.writeFileSync(policy, JSON.stringify({ version: 1, mode: 'work', updatedAt: 'fixture', updatedBy: 'user' }));
  for (const name of ['Skill', 'skill', 'mcp__serena__initial_instructions', 'serena_find_symbol', 'mcp__serena__get_symbols_overview']) assert.equal(hookDecision({ tool_name: name, cwd: root, tool_input: {} }, policy).allowed, true, name);
  assert.equal(hookDecision({ tool_name: 'serena_activate_project', cwd: root, tool_input: { project: root } }, policy).allowed, true);
  for (const name of ['mcp__serena__replace_symbol_body', 'serena_onboarding', 'mcp__browser__click', 'unknown']) assert.equal(hookDecision({ tool_name: name, cwd: root, tool_input: {} }, policy).allowed, false, name);
  assert.equal(hookDecision({ tool_name: 'serena_activate_project', cwd: root, tool_input: { project: os.tmpdir() } }, policy).allowed, false);
  assert.equal(hookDecision({ tool_name: 'Write', cwd: root, tool_input: { file_path: path.join(root, '../outside.ts') } }, policy).allowed, false);
});
