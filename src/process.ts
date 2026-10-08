import { spawn } from 'node:child_process';

export interface ProcessResult { exitCode: number; stdout: string; stderr: string }
export async function terminateTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await new Promise<void>(resolve => {
      const child = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
      child.on('error', () => resolve()); child.on('close', () => resolve());
    });
  } else { try { process.kill(-pid, 'SIGKILL'); } catch { /* Already exited. */ } }
}
export function runProcess(executable: string, args: string[], options: {
  cwd: string; env?: NodeJS.ProcessEnv; signal?: AbortSignal; timeoutMs: number; input?: string;
  onLine?: (line: string) => void;
  streamOutput?: boolean;
}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(new Error('Stopped'));
    const child = spawn(executable, args, { cwd: options.cwd, env: options.env, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', pending = '', failure: Error | undefined, terminating = false, termination: Promise<void> | undefined;
    const kill = (error: Error) => {
      failure ??= error;
      if (!terminating && child.pid) { terminating = true; termination = terminateTree(child.pid); }
    };
    const timer = setTimeout(() => kill(new Error(`Timeout after ${options.timeoutMs} ms`)), options.timeoutMs);
    const abort = () => kill(new Error('Stopped'));
    options.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
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
    const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); };
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', async code => { cleanup(); await termination; if (failure) reject(failure); else resolve({ exitCode: code ?? -1, stdout, stderr }); });
    child.stdin.on('error', () => { /* A process may exit before reading input. */ });
    child.stdin.end(options.input ?? '');
  });
}
