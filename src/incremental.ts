import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicJson, type Evidence, type State, type Store } from './store.js';
import { workspaceFiles } from './workspace.js';
import { projectFiles } from './project-files.js';
import { gitProcess } from './git-process.js';
import { FlowError } from './failure.js';

interface Baseline { files: Record<string, string>; digest: string }
export async function captureBaseline(store: Store, state: State, name: string, signal: AbortSignal): Promise<void> {
  if (existsSync(store.file(name))) return;
  const files: Record<string, string> = Object.create(null); let bytes = 0;
  for (const relative of state.config.projectMode ? projectFiles(state.workspace) : await workspaceFiles(state.workspace,signal)) {
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
  const current = state.config.projectMode ? projectFiles(state.workspace) : await workspaceFiles(state.workspace,signal);
  const files = new Set([...Object.keys(baseline.files), ...current]); let diff = '', index = 0;
  const temp = store.file(`diff-${name}`); mkdirSync(temp, { recursive: true });
  for (const relative of files) {
    const target = path.resolve(state.workspace, relative);
    if (!target.startsWith(`${state.workspace}${path.sep}`)) throw new FlowError('safety', 'Unsafe baseline path');
    const before = Object.hasOwn(baseline.files, relative) ? Buffer.from(baseline.files[relative]!, 'base64') : Buffer.alloc(0);
    const after = existsSync(target) ? readFileSync(target) : Buffer.alloc(0);
    const beforeExists=Object.hasOwn(baseline.files,relative),afterExists=existsSync(target);
    if (beforeExists===afterExists && before.equals(after)) continue;
    const left = path.join(temp, `${index}-before`), right = path.join(temp, `${index++}-after`);
    writeFileSync(left, before); writeFileSync(right, after);
    const result = await gitProcess(store.dir, ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--', left, right], { signal, timeoutMs: state.config.timeoutMs, allowedExitCodes: [0, 1] });
    // Git quotes native Windows paths. Normalize only the first metadata headers,
    // never hunk contents, so equal deltas compare equal across baseline files.
    const normalized = result.stdout
      .replace(/^diff --git[^\n]*/, `diff --git ${JSON.stringify(`a/${relative}`)} ${JSON.stringify(`b/${relative}`)}`)
      .replace(/^--- [^\n]*/m, `--- ${JSON.stringify(`a/${relative}`)}`)
      .replace(/^\+\+\+ [^\n]*/m, `+++ ${JSON.stringify(`b/${relative}`)}`);
    diff += `\nFILE ${relative}${!beforeExists ? ' (added)' : !afterExists ? ' (deleted)' : ''}\n${normalized}`;
  }
  return diff;
}
export function reviewEvidence(evidence: Evidence | null): unknown {
  if (!evidence) return null;
  const { diff, taskDiff, roundDiff, ...checks } = evidence;
  const selected = roundDiff ?? diff;
  const artifactDiffs: {path:string;characters:number;sha256:string}[] = [];
  const sourceDiff = (value:string) => value.replace(/\nFILE ((?:dist\/[^\n]*|validation\/[^\n]*-result\.json(?: \((?:added|deleted)\))?))\n[\s\S]*?(?=\nFILE |$)/g, (section:string, name:string) => {
    artifactDiffs.push({path:name,characters:section.length,sha256:createHash('sha256').update(section).digest('hex')});
    return '';
  });
  const selectedSource = sourceDiff(selected);
  const additional = taskDiff === selected ? undefined : taskDiff === undefined ? undefined : sourceDiff(taskDiff);
  const limit = 120000;
  return { ...checks, roundDiff: selectedSource.slice(0, limit), taskDiff: additional?.slice(0, limit), artifactDiffs, diffOmitted: selectedSource.length > limit || (additional?.length ?? 0) > limit, fullDiffHash: createHash('sha256').update(diff).digest('hex'), taskDiffHash: taskDiff === undefined ? null : createHash('sha256').update(taskDiff).digest('hex'), roundDiffHash: createHash('sha256').update(selected).digest('hex'), note: 'Compiled dist/ and generated validation/*-result.json artifact sections are summarized with hashes; read the full result files when reviewing browser evidence. Full artifacts and source evidence remain in Controller state/audit. Source and dependency lock diffs remain subject to the context limit. Missing source diff requires human review; do not pass.' };
}
