import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicJson, type Evidence, type State, type Store } from './store.js';
import { git } from './workspace.js';
import { runProcess } from './process.js';
import { FlowError } from './failure.js';

interface Baseline { files: Record<string, string>; digest: string }
export async function captureBaseline(store: Store, state: State, name: string, signal: AbortSignal): Promise<void> {
  if (existsSync(store.file(name))) return;
  const files: Record<string, string> = Object.create(null); let bytes = 0;
  for (const relative of (await git(state.workspace, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], signal)).split('\0').filter(Boolean).sort()) {
    const target = path.resolve(state.workspace, relative);
    if (!target.startsWith(`${state.workspace}${path.sep}`)) throw new FlowError('safety', 'Unsafe baseline path');
    if (!existsSync(target)) continue;
    const content = readFileSync(target); bytes += content.length;
    if (bytes > 50 * 1024 * 1024) throw new FlowError('safety', 'Baseline size limit exceeded');
    files[relative] = content.toString('base64');
  }
  atomicJson(store.file(name), { files, digest: createHash('sha256').update(JSON.stringify(files)).digest('hex') });
}
export async function baselineDiff(store: Store, state: State, name: string, signal: AbortSignal): Promise<string | undefined> {
  if (!existsSync(store.file(name))) return undefined;
  const baseline = JSON.parse(readFileSync(store.file(name), 'utf8')) as Baseline;
  if (createHash('sha256').update(JSON.stringify(baseline.files)).digest('hex') !== baseline.digest) throw new FlowError('safety', 'Baseline hash mismatch');
  const current = (await git(state.workspace, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], signal)).split('\0').filter(Boolean);
  const files = new Set([...Object.keys(baseline.files), ...current]); let diff = '', index = 0;
  const temp = store.file(`diff-${name}`); mkdirSync(temp, { recursive: true });
  for (const relative of files) {
    const target = path.resolve(state.workspace, relative);
    if (!target.startsWith(`${state.workspace}${path.sep}`)) throw new FlowError('safety', 'Unsafe baseline path');
    const before = Object.hasOwn(baseline.files, relative) ? Buffer.from(baseline.files[relative]!, 'base64') : Buffer.alloc(0);
    const after = existsSync(target) ? readFileSync(target) : Buffer.alloc(0);
    if (before.equals(after)) continue;
    const left = path.join(temp, `${index}-before`), right = path.join(temp, `${index++}-after`);
    writeFileSync(left, before); writeFileSync(right, after);
    const result = await runProcess('git', ['-c', 'core.hooksPath=NUL', 'diff', '--no-index', '--no-ext-diff', '--no-textconv', '--', left, right], { cwd: store.dir, signal, timeoutMs: state.config.timeoutMs });
    if (![0, 1].includes(result.exitCode)) throw new FlowError('safety', 'Incremental diff generation failed');
    // Git quotes native Windows paths. Normalize only the first metadata headers,
    // never hunk contents, so equal deltas compare equal across baseline files.
    const normalized = result.stdout
      .replace(/^diff --git[^\n]*/, `diff --git ${JSON.stringify(`a/${relative}`)} ${JSON.stringify(`b/${relative}`)}`)
      .replace(/^--- [^\n]*/m, `--- ${JSON.stringify(`a/${relative}`)}`)
      .replace(/^\+\+\+ [^\n]*/m, `+++ ${JSON.stringify(`b/${relative}`)}`);
    diff += `\nFILE ${relative}\n${normalized}`;
  }
  return diff;
}
export function reviewEvidence(evidence: Evidence | null): unknown {
  if (!evidence) return null;
  const { diff, taskDiff, roundDiff, ...checks } = evidence;
  const selected = roundDiff ?? diff;
  const limit = 60000, omitted = selected.length > limit;
  const additional = taskDiff === selected ? undefined : taskDiff;
  return { ...checks, roundDiff: selected.slice(0, limit), taskDiff: additional?.slice(0, 20000), diffOmitted: omitted || (additional?.length ?? 0) > 20000, fullDiffHash: createHash('sha256').update(diff).digest('hex'), taskDiffHash: taskDiff === undefined ? null : createHash('sha256').update(taskDiff).digest('hex'), roundDiffHash: createHash('sha256').update(selected).digest('hex'), note: 'Full evidence remains in Controller state/audit. Missing diff requires human review; do not pass.' };
}
