import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFileSync, lstatSync, realpathSync } from 'node:fs';
import { decideOperation, readInteractionPolicy } from '../src/interaction-policy.js';

export function hookDecision(input: any, policyFile?: string): { allowed: boolean; reason: string } {
  const policy = readInteractionPolicy(policyFile);
  const name = input?.tool_name;
  const tool = input?.tool_input ?? {};
  const command = tool.cmd ?? tool.command ?? tool.code;
  if (/^(?:Bash|bash|powershell|PowerShell|exec_command|shell_command|shell|functions\.exec)$/.test(name)) {
    if (typeof command !== 'string') return { allowed: false, reason: '工具缺少可检查的具体命令；仅延后该步骤。' };
    const decision = decideOperation({ kind: 'shell', command, cwd: input.cwd }, policy);
    return { allowed: decision.action === 'allow', reason: decision.reason };
  }
  // Risky native tools keep their own classification even in idle.
  if (/shutdown|restart|logoff|hibernate|firmware|driver|format_disk/i.test(name ?? '')) {
    const decision = decideOperation({ kind: 'system' }, policy);
    return { allowed: false, reason: decision.reason };
  }
  // Native source patching remains possible. Restrict paths so it cannot change
  // the global mode, hook installation, instructions or files outside this workspace.
  if (name === 'apply_patch' || name === 'applypatch') {
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
  if (['Read','read','Glob','glob','Grep','grep','view_image','WebSearch','WebFetch','webfetch','websearch','todowrite','todoread','StructuredOutput','Task','Agent'].includes(name)) return { allowed: true, reason: '' };
  if (['Edit','Write','edit','write','multiedit'].includes(name)) {
    const target = tool.file_path ?? tool.filePath ?? tool.path;
    if (typeof target !== 'string' || typeof input.cwd !== 'string') return { allowed: false, reason: '文件操作缺少路径' };
    return hookDecision({ tool_name: 'apply_patch', cwd: input.cwd, tool_input: { command: `*** Begin Patch\n*** Update File: ${target}\n*** End Patch` } }, policyFile);
  }
  if (policy.mode === 'idle') return { allowed: true, reason: '' };
  return { allowed: false, reason: `deferred_by_work_mode：${String(name ?? 'unknown')} 的桌面/原生能力未经确认；仅延后该工具，继续后台开发。` };
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
