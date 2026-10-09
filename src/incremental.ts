import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicJson, type Evidence, type State, type Store } from './store.js';
import { workspaceFiles } from './workspace.js';
import { projectFiles, captureProject, loadProject, readProject, projectFileHash, projectBytes, projectCategory } from './project-files.js';
import { gitProcess } from './git-process.js';
import { FlowError } from './failure.js';

export async function captureBaseline(store: Store, state: State, name: string, signal: AbortSignal): Promise<void> {
  if (existsSync(store.file(name))) return;
  if (state.snapshotPolicy === 'none') return; // No content baseline or full-project scan.
  if (state.config.projectMode) {
    atomicJson(store.file(name), captureProject(state.workspace, store.file('snapshot-objects'), signal));
    store.audit('snapshot-baseline', { name, format: 2, coverage: 'all project files except .git and node_modules', content: 'deduplicated external objects' });
    return;
  }
  atomicJson(store.file(name), captureProject(state.workspace, store.file('snapshot-objects'), signal, await workspaceFiles(state.workspace,signal)));
}
export async function baselineDiff(store: Store, state: State, name: string, signal: AbortSignal): Promise<string | undefined> {
  if (state.snapshotPolicy === 'none' || !existsSync(store.file(name))) return undefined;
  const baseline = loadProject(store.file(name));
  if (createHash('sha256').update(JSON.stringify(baseline.files)).digest('hex') !== baseline.digest) throw new FlowError('safety', 'Baseline hash mismatch');
  const current = state.config.projectMode ? projectFiles(state.workspace) : await workspaceFiles(state.workspace,signal);
  const files = new Set([...Object.keys(baseline.files), ...current]); let diff = '', index = 0;
  const temp = store.file(`diff-${name}`); mkdirSync(temp, { recursive: true });
  const fingerprint = readProject(state.workspace, signal, current);
  for (const relative of files) {
    const target = path.resolve(state.workspace, relative);
    if (!target.startsWith(`${state.workspace}${path.sep}`)) throw new FlowError('safety', 'Unsafe baseline path');
    if (fingerprint && projectFileHash(baseline, relative) === projectFileHash(fingerprint, relative)) continue;
    const beforeExists=Object.hasOwn(baseline.files,relative),afterExists=existsSync(target);
    // Assets and large files have exact hashes in evidence. Never allocate them
    // as text or truncate a source diff and pretend it was reviewed.
    if (projectCategory(relative) === 'resource' || (beforeExists && baseline.version === 2 && statSync(path.join(baseline.objectDir!, baseline.files[relative]!)).size > 1024 * 1024) || afterExists && statSync(target).size > 1024 * 1024) {
      diff += `\nFILE ${relative}${!beforeExists ? ' (added)' : !afterExists ? ' (deleted)' : ''}\nContent requires asset/large-file review; SHA-256 before ${projectFileHash(baseline,relative) ?? 'absent'}, after ${projectFileHash(fingerprint,relative) ?? 'absent'}.\n`;
      continue;
    }
    const before = beforeExists ? projectBytes(baseline, relative) : Buffer.alloc(0);
    const after = existsSync(target) ? readFileSync(target) : Buffer.alloc(0);
    if (beforeExists===afterExists && before.equals(after)) continue;
    if (before.includes(0) || after.includes(0)) {
      diff += `\nFILE ${relative}${!beforeExists ? ' (added)' : !afterExists ? ' (deleted)' : ''}\nContent requires asset/large-file review; SHA-256 before ${projectFileHash(baseline,relative) ?? 'absent'}, after ${projectFileHash(fingerprint,relative) ?? 'absent'}.\n`;
      continue;
    }
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
  return { ...checks, roundDiff: selectedSource.slice(0, limit), taskDiff: additional?.slice(0, limit), artifactDiffs, diffOmitted: selectedSource.length > limit || (additional?.length ?? 0) > limit, fullDiffHash: createHash('sha256').update(diff).digest('hex'), taskDiffHash: taskDiff === undefined ? null : createHash('sha256').update(taskDiff).digest('hex'), roundDiffHash: createHash('sha256').update(selected).digest('hex'), note: 'Compiled dist/ and generated validation/*-result.json artifact sections are summarized with hashes; read the full result files when reviewing browser evidence. Full artifacts and source evidence remain in Controller state/audit. Source and dependency lock diffs remain subject to the context limit. For snapshot-free runs, verificationScope defines omitted coverage; inspect needed files with native tools. Never claim full change verification. Legacy missing source diff requires human review.' };
}
