import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFileSync, lstatSync, realpathSync } from 'node:fs';
import { readInteractionPolicy } from '../src/interaction-policy.js';

export function hookDecision(input: any, policyFile?: string): { allowed: boolean; reason: string } {
  if (readInteractionPolicy(policyFile).mode === 'idle') return { allowed: true, reason: '' };
  const name = input?.tool_name;
  // Native source patching remains possible. Restrict paths so it cannot change
  // the global mode, hook installation, instructions or files outside this workspace.
  if (name === 'apply_patch') {
    const patch = input.tool_input?.command ?? input.tool_input?.patch ?? input.tool_input?.input;
    const cwd = input.cwd;
    if (typeof patch === 'string' && typeof cwd === 'string' && path.isAbsolute(cwd)) {
      const files = [...patch.matchAll(/^\*\*\* (?:Add File:|Update File:|Delete File:|Move to:) (.+)$/gm)].map(match => match[1]!.trim());
      if (files.length && files.every(file => {
        const target = path.resolve(cwd, file), relative = path.relative(cwd, target);
        if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) ||
          relative.split(/[\\/]/).some(part => /^(?:\.codex|\.claude|\.git|AGENTS\.md|CLAUDE\.md|global-interaction-policy\.json)$/i.test(part))) return false;
        if (path.resolve(realpathSync(cwd)).toLowerCase() !== path.resolve(cwd).toLowerCase()) return false;
        let cursor = cwd;
        for (const part of relative.split(path.sep)) {
          cursor = path.join(cursor, part);
          try { if (lstatSync(cursor).isSymbolicLink()) return false; }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false; }
        }
        return true;
      })) return { allowed: true, reason: '' };
    }
  }
  if (name === 'view_image') return { allowed: true, reason: '' };
  return { allowed: false, reason: `工作模式拒绝 ${String(name ?? 'unknown')}：Shell、脚本、浏览器、桌面、MCP 和未知工具无法确认安全；请由用户切换 idle。` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let text = '';
  for await (const chunk of process.stdin) { text += chunk; if (text.length > 1024 * 1024) break; }
  let result: ReturnType<typeof hookDecision>;
  try { result = hookDecision(JSON.parse(text), process.argv[2]); }
  catch { result = { allowed: false, reason: '工作模式 Hook 输入无效，拒绝调用' }; }
  if (process.argv[3]) appendFileSync(process.argv[3], JSON.stringify({event:'PreToolUse',allowed:result.allowed,reason:result.reason})+'\n');
  if (!result.allowed) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: result.reason } }));
    // Structured deny uses successful transport. Windows shell wrappers may
    // translate a child exit 2 into generic exit 1, which Codex treats as failure.
    // The permissionDecision is the denial, not the process exit status.
  }
}
