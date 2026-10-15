import { readFileSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { FlowError } from './failure.js';
import { replaceAtomic } from './store.js';
import { runtimeHome } from './platform-runtime.js';

export type InteractionMode = 'work' | 'idle';
export const globalPolicyFile = path.join(runtimeHome(), 'global-interaction-policy.json');
export interface InteractionPolicy { version: 1; mode: InteractionMode; reason: string }
// Trusted dependency injection for isolated tests, never an environment variable or Run setting.
export const interactionPolicyContext = new AsyncLocalStorage<string>();
export function readInteractionPolicy(file = interactionPolicyContext.getStore() ?? globalPolicyFile): InteractionPolicy {
  try {
    const text = readFileSync(file, 'utf8');
    if (text.length > 4096) throw Error('Oversized policy');
    const value = JSON.parse(text);
    if (value.version !== 1 || !['work', 'idle'].includes(value.mode)) throw Error('Unknown policy');
    return { version: 1, mode: value.mode, reason: '' };
  } catch { return { version: 1, mode: 'work', reason: '全局配置缺失、损坏或未知，采用工作模式' }; }
}
// Called only by the validated user-facing Desktop IPC operation. Agents have no mode tool.
export function writeUserInteractionMode(mode: InteractionMode, file = interactionPolicyContext.getStore() ?? globalPolicyFile): void {
  if (mode !== 'work' && mode !== 'idle') throw Error('Unknown interaction mode');
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify({ version: 1, mode, updatedAt: new Date().toISOString(), updatedBy: 'user' }) + '\n', { flag: 'wx', flush: true });
    replaceAtomic(temporary, file);
  } finally { rmSync(temporary, { force: true }); }
}
export type OperationClass = 'BACKGROUND_SAFE' | 'DESKTOP_INTERACTIVE' | 'SYSTEM_HIGH_RISK' | 'RESOURCE_HEAVY';
export interface OperationMetadata {
  kind?: 'model' | 'controller' | 'shell' | 'file' | 'browser' | 'desktop' | 'system' | 'resource';
  capability?: OperationClass;
  headless?: boolean;
  isolatedBrowser?: boolean;
}
export interface OperationRequest extends OperationMetadata { executable?: string; args?: string[]; command?: string; cwd?: string }
export interface PolicyDecision { classification: OperationClass; action: 'allow' | 'defer' | 'deny'; reason: string }
export class InteractionPolicyError extends FlowError {
  readonly status: 'deferred_by_work_mode' | 'requires_system_authorization';
  constructor(readonly operation: string, readonly decision: PolicyDecision) {
    super('supervisor', decision.reason);
    this.status = decision.action === 'defer' ? 'deferred_by_work_mode' : 'requires_system_authorization';
  }
}
export function watchInteractionPolicy(cancel: () => void, intervalMs = 100): () => void {
  const check = () => { if (readInteractionPolicy().mode === 'work') cancel(); };
  const timer = setInterval(check, intervalMs); check();
  return () => clearInterval(timer);
}

// Capability metadata is supplied by the application's launcher, not by a model.
// Text inspection supplements it for ordinary Shell tools; it is not an OS sandbox.
function inspectedText(request: OperationRequest): { text: string; opaque: boolean } {
  let text = [request.executable ?? '', ...(request.args ?? []), request.command ?? ''].join('\n');
  let opaque = false;
  const encoded = text.match(/-(?:enc|encodedcommand)\s+["']?([a-z0-9+/=]+)/i);
  if (encoded) { try { text += '\n' + Buffer.from(encoded[1]!, 'base64').toString('utf16le'); } catch { opaque = true; } opaque = true; }
  const seen = new Set<string>();
  const inspect = (source: string, depth: number) => {
    if (depth > 4) { opaque = true; return; }
    // Follow literal entry/wrapper script references, bounded and read only.
    // Do not scan entire projects or unit-test suites as executable scripts.
    const entries = [...source.matchAll(/\b(?:node|python(?:3)?|pwsh|powershell|cmd|bash|sh)(?:\.exe)?\s+(?:(?:-[\w-]+)\s+)*["']?([^\s"'`<>|;()]+\.(?:ps1|bat|cmd|py|mjs|cjs|js|ts))/gi)].map(match=>match[1]!);
    // Only execution/import references are followed. Compiler/bundler inputs
    // and readFileSync("source.ts") are data, not launched desktop operations.
    for (const expression of source.matchAll(/(?:\b(?:spawn|exec|execFile|Popen|run|system)\s*\([^\n;]{0,1000}|\b(?:require|import)\s*\(\s*["'][^"']+["']\s*\)|\bimport\s+[^\n;]{0,300})/g)) {
      entries.push(...[...expression[0].matchAll(/["']([^"']+\.(?:ps1|bat|cmd|py|mjs|cjs|js|ts))["']/g)].map(match=>match[1]!));
    }
    for (const entry of entries) {
      if (/\.(?:test|spec)\.[cm]?[jt]s$/.test(entry)) continue;
      const file = path.resolve(request.cwd ?? process.cwd(), entry);
      if (seen.has(file)) continue;
      seen.add(file);
      try {
        if (seen.size > 16 || statSync(file).size > 200000) { opaque = true; continue; }
        const content = readFileSync(file, 'utf8'); text += '\n' + content; inspect(content, depth + 1);
      } catch { /* A missing ordinary development script is a process error, not a desktop capability. */ }
    }
  };
  inspect(text, 0);
  const npm = text.match(/\b(?:npm|pnpm|yarn)(?:\.cmd)?\s+(?:run\s+)?([\w:-]+)/i) ?? text.match(/npm-cli\.js\s+(?:run\s+)?([\w:-]+)/i);
  if (npm && request.cwd) {
    try {
      const scripts = JSON.parse(readFileSync(path.join(request.cwd, 'package.json'), 'utf8')).scripts ?? {};
      for (const name of ['pre' + npm[1], npm[1]!, 'post' + npm[1]]) if (typeof scripts[name] === 'string') { text += '\n' + scripts[name]; inspect(scripts[name], 0); }
    } catch { /* Package manager reports its own invalid/missing manifest. */ }
  }
  return { text, opaque };
}
export function classifyOperation(request: OperationRequest): OperationClass {
  // Native model prompts are untrusted prose, not commands to scan or execute.
  if (request.kind === 'model' || request.kind === 'controller') return 'BACKGROUND_SAFE';
  const { text, opaque } = inspectedText(request);
  if (request.kind === 'system' || request.capability === 'SYSTEM_HIGH_RISK' ||
      /\b(?:shutdown(?:\.exe)?|restart-computer|stop-computer|logoff(?:\.exe)?|bcdedit|diskpart|format\.com|pnputil|devcon|rundll32.*(?:powrprof|suspend)|sfc|netsh\s+\S*\s*reset)\b/i.test(text) ||
      /\b(?:reboot|hibernate|firmware|bios-flash|stress-ng|prime95|furmark|gpu-burn)\b/i.test(text) ||
      /\b(?:diskutil\s+(?:erase\w*|partition\w*|apfs\s+delete\w*)|pmset\s+sleepnow|nvram|csrutil)\b/i.test(text) || /(?:tell\s+(?:application\s+)?["']?System Events["']?\s+to\s+(?:shut down|restart|sleep|log out))/i.test(text) ||
      /\b(?:reg(?:\.exe)?\s+(?:add|delete|import)|sc(?:\.exe)?\s+(?:delete|config|stop))\b/i.test(text) || /HKLM[\\:]/i.test(text) ||
      /(?:remove-item|rmdir|rm\s+-|del\s+).*(?:[cC]:[\\/](?:windows|program files)|\/system\b)/i.test(text) ||
      /(?:taskkill|stop-process).*(?:csrss|lsass|wininit|winlogon|services)(?:\.exe)?/i.test(text)) return 'SYSTEM_HIGH_RISK';
  if (request.kind === 'resource' || request.capability === 'RESOURCE_HEAVY' || /\b(?:benchmark|stress(?:-test)?|shadercompileworker|unrealbuildtool|blender.*(?:--background|-b))\b/i.test(text)) return 'RESOURCE_HEAVY';
  if (request.kind === 'desktop' || request.capability === 'DESKTOP_INTERACTIVE' || opaque ||
      /\b(?:ClipCursor|SetCursorPos|SendInput|SetWindowsHookEx|SendKeys|SetForegroundWindow|ShowWindow|ChangeDisplaySettings|pyautogui|pynput|robotjs|clipboard|Set-Clipboard|clip\.exe|xdotool|autohotkey)\b/i.test(text) ||
      /\b(?:osascript|pbcopy|pbpaste|screencapture)\b/i.test(text) || /(?:^|[\s;&|/])open\s+(?:-[aAbgjnRWF]|["']?(?:https?:|\/|\.\/|~\/))/im.test(text) ||
      /(?:--headed|headless\s*[:=]\s*false|connectOverCDP|remote-debugging-port|user32\.(?:dll|so))/i.test(text) ||
      /\b(?:start-process|start\s+")\b/i.test(text) ||
      /^(?:electron|mouse|keyboard|window)(?:\.exe)?$/i.test(path.basename(request.executable ?? '')) ||
      /(?:^|[\s;&|])(?:npx\s+)?electron(?:\.exe)?\s+(?:\.|--|["']?[\w./\\])/im.test(text) ||
      /\b(?:spawn|execFile|Popen)\s*\(\s*["'](?:electron|mouse|keyboard|window)(?:\.exe)?["']/i.test(text)) return 'DESKTOP_INTERACTIVE';
  const browser = request.kind === 'browser' || /\b(?:playwright|puppeteer|chrome(?:\.exe)?|msedge(?:\.exe)?|firefox(?:\.exe)?)\b/i.test(text);
  if (browser) {
    const headless = request.headless === true || /(?:--headless|headless\s*[:=]\s*true)/i.test(text);
    const isolated = request.isolatedBrowser === true || /(?:--user-data-dir|browser\.newContext|chromium\.launch|firefox\.launch)/i.test(text);
    return headless && isolated ? 'BACKGROUND_SAFE' : 'DESKTOP_INTERACTIVE';
  }
  // Ordinary project commands are permitted. Dynamic imports, obfuscation and
  // unobserved descendant processes remain explicit coverage gaps.
  return request.capability ?? 'BACKGROUND_SAFE';
}
export function decideOperation(request: OperationRequest, policy = readInteractionPolicy()): PolicyDecision {
  const classification = classifyOperation(request);
  const action = classification === 'SYSTEM_HIGH_RISK' ? 'deny' : classification !== 'BACKGROUND_SAFE' && policy.mode === 'work' ? 'defer' : 'allow';
  const reason = action === 'deny' ? 'requires_system_authorization：系统高风险操作拒绝执行；idle 不授予独立授权。' : action === 'defer' ? `deferred_by_work_mode：${classification} 需要空闲模式完成；继续其他安全开发步骤。` : '';
  return { classification, action, reason };
}
export function assertOperationPolicy(request: OperationRequest): PolicyDecision {
  const decision = decideOperation(request);
  if (decision.action !== 'allow') throw new InteractionPolicyError(request.executable ?? request.kind ?? 'operation', decision);
  return decision;
}
export const interactionAgentRules = `\n工作模式 = AI 持续开发，但不碰用户的桌面。读取 ${globalPolicyFile}，缺失/损坏/未知默认 work；只有用户可以切换，Agent 禁止修改或绕过策略及 Hook。work 正常规划、开发、Review、讨论、Session/resume、Context、源码编辑、Git（仍遵守提交审批）、普通 Shell、后台编译/单测/lint/typecheck；真正 headless 且隔离用户浏览器的测试允许。鼠标/键盘/输入 Hook/剪贴板、用户浏览器/窗口/焦点/显示、可见 GUI 验收记录 deferred_by_work_mode，仅延后该步骤并继续不依赖它的工作，GUI 验收 pending 不能虚报 PASS。idle→work 不停止模型或普通 build/test，仅取消受管理的交互/重型任务。明确重型构建、benchmark/stress 延后。关机/重启/注销/休眠、驱动/BIOS/磁盘/关键系统修改和极端压力测试属于 SYSTEM_HIGH_RISK，idle 也不自动授权，必须另行明确授权；不得用 Shell/MCP/脚本/子进程绕过。应用策略不是 Windows 权限隔离，原生工具未覆盖路径须如实报告，不能因此停止整个 Agent。idle 不扩大原有任务、交付、发布或推送授权。`;
