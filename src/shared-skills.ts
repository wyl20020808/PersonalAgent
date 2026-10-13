import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';

export interface SharedSkill { name: string; description: string; directory: string }

// User-authored skills are portable instructions. Product/plugin caches are not:
// their tools and account sessions must remain owned by their native client.
export function userSkillRoots(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string[] {
  return [...new Set([
    path.join(env.CODEX_HOME ?? path.join(home, '.codex'), 'skills'),
    path.join(env.CLAUDE_CONFIG_DIR ?? path.join(home, '.claude'), 'skills'),
    path.join(home, '.agents', 'skills'),
    path.join(path.dirname(env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE ?? path.join(home, '.config/opencode/opencode.json')), 'skills'),
  ].map(root => path.resolve(root)))];
}

export function sharedSkills(roots = userSkillRoots()): { skills: SharedSkill[]; errors: { path: string; message: string }[] } {
  const skills: SharedSkill[] = [], errors: { path: string; message: string }[] = [], seen = new Set<string>();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.name === 'synced') continue;
      const directory = path.join(root, entry.name), file = path.join(directory, 'SKILL.md');
      if (!fs.existsSync(file)) continue;
      try {
        if (fs.statSync(file).size > 256 * 1024) throw Error('SKILL.md exceeds 256 KiB');
        const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''), front = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        if (!front) throw Error('missing YAML frontmatter delimited by ---');
        const data = parse(front[1]!) as Record<string, unknown>;
        if (!data || typeof data.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.name) || typeof data.description !== 'string' || !data.description.trim()) throw Error('invalid skill name or description');
        if (seen.has(data.name)) continue;
        seen.add(data.name); skills.push({ name: data.name, description: data.description.trim(), directory });
      } catch { errors.push({ path: file, message: 'Invalid SKILL.md metadata or unreadable skill; not imported' }); }
    }
  }
  return { skills, errors };
}

export function claudeSharedSkillPlugin(runtime: string, env: NodeJS.ProcessEnv = process.env): { path?: string; names: string[]; errors: { path: string; message: string }[] } {
  const roots = userSkillRoots(env), native = sharedSkills([roots[1]!]), nativeNames = new Set(native.skills.map(skill => skill.name));
  const discovered = sharedSkills([roots[0]!, roots[2]!, roots[3]!]), skills = discovered.skills.filter(skill => !nativeNames.has(skill.name));
  if (!skills.length) return { names: [], errors: discovered.errors };
  // Content-addressed roots avoid replacing a plugin another Session is reading.
  const hash = createHash('sha256').update(JSON.stringify(skills.map(skill => [skill.name, fs.realpathSync(skill.directory)]))).digest('hex').slice(0, 20);
  const plugin = path.join(runtime, 'native-skills', hash);
  fs.mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true }); fs.mkdirSync(path.join(plugin, 'skills'), { recursive: true });
  const manifest = path.join(plugin, '.claude-plugin/plugin.json');
  if (!fs.existsSync(manifest)) {
    try { fs.writeFileSync(manifest, JSON.stringify({ name: 'personalagent-shared-skills', version: '1.0.0', description: 'Local user skills shared for this PersonalAgent runtime' }), { flag: 'wx' }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  for (const skill of skills) {
    const target = fs.realpathSync(skill.directory), link = path.join(plugin, 'skills', skill.name);
    try { fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || fs.realpathSync(link) !== target) throw error; }
  }
  return { path: plugin, names: skills.map(skill => skill.name), errors: discovered.errors };
}

// Codex has no supported extra-root setting. Keep its native catalog intact and
// give only the missing clients' user skills as a path index, loaded on demand.
export function codexSharedSkillGuidance(env: NodeJS.ProcessEnv = process.env): string {
  const roots = userSkillRoots(env), own = new Set(sharedSkills([roots[0]!, roots[2]!]).skills.map(skill => skill.name));
  const extra = sharedSkills([roots[1]!, roots[3]!]).skills.filter(skill => !own.has(skill.name));
  if (!extra.length) return '';
  return '\n其他客户端的用户技能（按需读取对应 SKILL.md，不能假定专属工具存在；仍遵守只读模式、项目授权和交互策略）：\n' + extra.map(skill => `- ${skill.name}: ${skill.description.slice(0, 1024).replace(/\s+/g, ' ')} (${path.join(skill.directory, 'SKILL.md')})`).join('\n');
}

export function withCodexSharedSkills(prompt: string): string {
  const guidance = codexSharedSkillGuidance();
  if (!guidance) return prompt;
  try {
    const value = JSON.parse(prompt);
    if (value && typeof value === 'object' && !Array.isArray(value)) return JSON.stringify({ ...value, personalAgentSharedSkills: guidance });
  } catch { /* Plain-text prompts remain plain text. */ }
  return prompt + guidance;
}
