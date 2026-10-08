import { runProcess, type ProcessResult } from './process.js';
import { FlowError } from './failure.js';

// All Git calls share Windows long-path support and disable executable hooks.
const policy = ['-c', 'core.hooksPath=NUL', '-c', 'core.fsmonitor=false', '-c', 'core.longpaths=true'];
export class GitError extends FlowError {
  constructor(readonly cwd: string, readonly args: string[], readonly result: ProcessResult, integrity = false) {
    super(integrity ? 'git-integrity' : 'git', `Git ${integrity ? 'object integrity check failed' : 'failed'} (${result.exitCode}): git ${args.join(' ')}\nWorking directory (${cwd.length} characters): ${cwd}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    this.name = 'GitError';
  }
}
export async function gitProcess(cwd: string, args: string[], options: { signal?: AbortSignal; timeoutMs?: number; allowedExitCodes?: number[]; integrity?: boolean } = {}, runner: typeof runProcess = runProcess): Promise<ProcessResult> {
  let result: ProcessResult;
  try { result = await runner('git', [...policy, ...args], { cwd, signal: options.signal, timeoutMs: options.timeoutMs ?? 30000 }); }
  catch (error) {
    if (options.signal?.aborted) throw new FlowError('interrupted', `Git command interrupted: ${args.join(' ')}\n${String(error)}`);
    throw new FlowError('git', `Git process failed: git ${args.join(' ')}\nWorking directory (${cwd.length} characters): ${cwd}\n${error instanceof Error ? error.message : String(error)}`);
  }
  if (!(options.allowedExitCodes ?? [0]).includes(result.exitCode)) throw new GitError(cwd, args, result, options.integrity);
  return result;
}
export async function gitText(cwd: string, args: string[], signal?: AbortSignal): Promise<string> {
  return (await gitProcess(cwd, args, { signal })).stdout.trimEnd();
}
export async function gitHead(cwd: string, signal?: AbortSignal): Promise<string> {
  const result = await gitProcess(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD'], { signal, allowedExitCodes: [0, 1] });
  if (result.exitCode === 0) return result.stdout.trim();
  // Only a symbolic HEAD whose branch does not exist represents an unborn repo.
  const ref = await gitText(cwd, ['symbolic-ref', 'HEAD'], signal);
  const branch = await gitProcess(cwd, ['show-ref', '--verify', '--quiet', ref], { signal, allowedExitCodes: [0, 1] });
  if (branch.exitCode !== 1) throw new GitError(cwd, ['rev-parse', '--verify', 'HEAD'], result, true);
  return 'unborn';
}
export async function validateGitObjects(cwd: string, head: string, signal?: AbortSignal): Promise<void> {
  if (head !== 'unborn') {
    // Read object contents; resolving a ref or checking its SHA string is insufficient.
    await gitProcess(cwd, ['cat-file', '-p', `${head}^{commit}`], { signal, integrity: true });
    await gitProcess(cwd, ['cat-file', '-p', `${head}^{tree}`], { signal, integrity: true });
    await gitProcess(cwd, ['ls-tree', '-r', '--full-tree', head], { signal, integrity: true });
  }
  // Checks reachable blobs, trees, commits, packs and index references, including hashes.
  await gitProcess(cwd, ['fsck', '--full', '--no-dangling'], { signal, integrity: true });
}
export async function gitDiffCheck(cwd: string, base: string, signal?: AbortSignal, timeoutMs = 30000): Promise<ProcessResult> {
  // `diff --check` returns 2 for whitespace findings, not for infrastructure errors.
  return gitProcess(cwd, ['diff', '--no-ext-diff', '--no-textconv', '--check', base, '--'], { signal, timeoutMs, allowedExitCodes: [0, 2] });
}
