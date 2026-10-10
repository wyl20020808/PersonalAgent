import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { FlowError } from './failure.js';
import { replaceAtomic } from './store.js';

export type InteractionMode = 'work' | 'idle';
export const globalPolicyFile = 'D:/PersonalAgent-data/global-interaction-policy.json';
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
export class InteractionPolicyError extends FlowError {
  constructor(operation: string) {
    super('supervisor', `工作模式已暂停 ${operation}：无法可靠保证无桌面交互、系统风险或未经评估的负载。请由用户切换为空闲模式后明确恢复。`);
  }
}
export function requireIdle(operation: string): void {
  if (readInteractionPolicy().mode !== 'idle') throw new InteractionPolicyError(operation);
}
export function watchInteractionPolicy(cancel: () => void, intervalMs = 100): () => void {
  const check = () => { if (readInteractionPolicy().mode === 'work') cancel(); };
  const timer = setInterval(check, intervalMs); check();
  return () => clearInterval(timer);
}

// Only fixed, non-shell Git observation forms qualify. Unknown programs, scripts,
// wrappers and even apparently harmless Node/PowerShell snippets defer to idle.
export function safeGitObservation(executable: string, args: string[]): boolean {
  if (executable !== 'git') return false;
  const prefix = ['-c', 'core.hooksPath=NUL', '-c', 'core.fsmonitor=false', '-c', 'core.longpaths=true'];
  if (!prefix.every((value, i) => args[i] === value)) return false;
  const rest = args.slice(prefix.length), command = rest[0];
  if (command === 'diff') return rest.includes('--no-ext-diff') && rest.includes('--no-textconv') &&
    rest.slice(1).every(value => ['--no-ext-diff','--no-textconv','--check','--stat','--numstat','--name-only','--name-status','--cached','--','-z'].includes(value) || /^[a-f0-9]{40}$/.test(value) || value === 'HEAD');
  if (command === 'status') return rest.slice(1).every(value => ['--porcelain','--porcelain=v1','--untracked-files=no','-z'].includes(value));
  if (command === 'rev-parse') return rest.slice(1).every(value => ['--verify','--quiet','--show-toplevel','--is-inside-work-tree','HEAD'].includes(value));
  if (command === 'symbolic-ref') return rest.length === 2 && rest[1] === 'HEAD';
  if (command === 'show-ref') return rest.length === 4 && rest[1] === '--verify' && rest[2] === '--quiet' && /^refs\/heads\/[a-zA-Z0-9._/-]+$/.test(rest[3]!);
  if (command === 'ls-files') return rest.slice(1).every(value => ['--stage','-z','--cached'].includes(value));
  return false;
}
export function assertProcessPolicy(executable: string, args: string[]): boolean {
  const safe = safeGitObservation(executable, args);
  if (!safe) requireIdle(`进程 ${path.basename(executable)}`);
  return safe;
}
export const interactionAgentRules = `\n全局交互策略：读取 D:/PersonalAgent-data/global-interaction-policy.json，缺失/损坏/未知默认 work。只有用户可以切换模式，Agent 禁止修改或绕过状态及策略文件。work 禁止鼠标、键盘、Hook、剪贴板、前台浏览器/桌面、窗口/焦点/显示变更、可见浏览器测试、关机/重启/注销/休眠、驱动/系统配置及未经评估的高负载任务，禁止通过 Shell、MCP、脚本或子进程间接执行。无法确认安全的操作暂停至 idle；源码读取和修改仍允许。idle 仍须遵守原有用户授权和交付审批。规则不是 Windows 进程隔离，禁止将其声明为绝对防护。`;
