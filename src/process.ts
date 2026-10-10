import { spawn } from 'node:child_process';
import path from 'node:path';
import { assertOperationPolicy, watchInteractionPolicy, decideOperation, InteractionPolicyError, type OperationMetadata } from './interaction-policy.js';

export interface ProcessResult { exitCode: number; stdout: string; stderr: string; status?: 'deferred_by_work_mode' | 'requires_system_authorization'; classification?: string; testIndex?: number }
export async function terminateTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await new Promise<void>(resolve => {
      const child = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      child.on('error', () => resolve()); child.on('close', () => resolve());
    });
  } else { try { process.kill(-pid, 'SIGKILL'); } catch { /* Already exited. */ } }
}
export function runProcess(executable: string, args: string[], options: {
  cwd: string; env?: NodeJS.ProcessEnv; signal?: AbortSignal; timeoutMs: number; input?: string;
  onLine?: (line: string) => void;
  streamOutput?: boolean;
  interaction?: OperationMetadata;
  onPolicyDecision?: (decision: import('./interaction-policy.js').PolicyDecision) => void;
}, spawnChild: typeof spawn = spawn, terminateOwned: typeof terminateTree = terminateTree): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(new Error('Stopped'));
    const request = { executable, args, cwd: options.cwd, ...options.interaction };
    const decision = decideOperation(request); options.onPolicyDecision?.(decision);
    assertOperationPolicy(request);
    if(process.platform==='win32' && path.resolve(options.cwd).length>=260)return reject(new Error('Windows process working directory exceeds supported 259-character limit; choose a shorter project or runtime path'));
    const child = spawnChild(executable, args, { cwd: options.cwd, env: options.env, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', pending = '', failure: Error | undefined, terminating = false, termination: Promise<void> | undefined;
    const kill = (error: Error) => {
      failure ??= error;
      if (!terminating && child.pid) { terminating = true; termination = terminateOwned(child.pid); }
    };
    const timer = setTimeout(() => kill(new Error(`Timeout after ${options.timeoutMs} ms`)), options.timeoutMs);
    const abort = () => kill(new Error('Stopped'));
    options.signal?.addEventListener('abort', abort, { once: true });
    const unwatch = decision.classification === 'BACKGROUND_SAFE' ? () => {} : watchInteractionPolicy(() => {
      const changed = decideOperation(request);
      if (changed.action !== 'allow') kill(new InteractionPolicyError(`受管理进程 ${path.basename(executable)}`, changed));
    });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('error', kill); child.stderr.on('error', kill);
    child.stdout.on('data', (chunk: string) => {
      if (failure) return;
      stdout += chunk; pending += chunk;
      // Streaming callers persist events as they arrive. Bound memory without
      // terminating a long native development loop for cumulative tool output.
      if (options.streamOutput) stdout = stdout.slice(-1024 * 1024);
      if (stdout.length + stderr.length > 8 * 1024 * 1024) kill(new Error('Process output limit exceeded'));
      let index: number;
      while ((index = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, index); pending = pending.slice(index + 1);
        try { options.onLine?.(line); } catch (error) { kill(error as Error); }
      }
    });
    child.stderr.on('data', (chunk: string) => { if (failure) return; stderr += chunk; if (stdout.length + stderr.length > 8 * 1024 * 1024) kill(new Error('Process output limit exceeded')); });
    const cleanup = () => { clearTimeout(timer); unwatch(); options.signal?.removeEventListener('abort', abort); };
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', async code => { cleanup(); await termination; if (failure) reject(failure); else resolve({ exitCode: code ?? -1, stdout, stderr }); });
    child.stdin.on('error', () => { /* A process may exit before reading input. */ });
    child.stdin.end(options.input ?? '');
  });
}
