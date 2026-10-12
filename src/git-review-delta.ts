import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { atomicJson, type State, type Store } from './store.js';
import { gitObservation, hasGit } from './project-observation.js';
import { FlowError } from './failure.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sections = (diff: string) => diff.split(/(?=^diff --git )/m).filter(part => part.startsWith('diff --git ')).map(part => part.replace(/\r?\n+$/, ''));
const key = (section: string) => section.split('\n', 1)[0]!;
const file = (store: Store, name: string) => store.file(`git-review-${name.replace(/-baseline\.json$/, '')}.json`);
interface Checkpoint { version: 1; workspace: string; head: string; diffHash: string; sections: Record<string, string>; digest: string }
const digest = ({ digest: _digest, ...data }: Checkpoint) => hash(JSON.stringify(data));

// Git metadata only: no file backups, untracked-file traversal or full-project snapshot.
export async function captureGitReview(store: Store, state: State, name: string, signal: AbortSignal): Promise<void> {
  if (!/^(task|round)-\d+-baseline\.json$/.test(name) || !hasGit(state.workspace) || existsSync(file(store, name))) return;
  const current = await gitObservation(state.workspace, signal), parts = sections(current.diff);
  if (current.diff.trim() && !parts.length) return; // Git's output-limit fallback is not a patch.
  const data: Checkpoint = { version: 1, workspace: realpathSync(state.workspace), head: current.head, diffHash: hash(current.diff), sections: Object.fromEntries(parts.map(part => [key(part), hash(part)])), digest: '' };
  data.digest = digest(data); atomicJson(file(store, name), data);
  store.audit('git-review-checkpoint', { name, path: file(store, name), head: data.head, sections: parts.length, diffHash: data.diffHash, coverage: 'tracked Git patches only; content not backed up' });
}

export async function gitReviewDelta(store: Store, state: State, name: string, signal: AbortSignal): Promise<string | undefined> {
  if (!/^(task|round)-\d+-baseline\.json$/.test(name) || !existsSync(file(store, name))) return undefined;
  const saved = JSON.parse(readFileSync(file(store, name), 'utf8')) as Checkpoint;
  if (saved.version !== 1 || saved.workspace !== realpathSync(state.workspace) || digest(saved) !== saved.digest) throw new FlowError('safety', 'Git review checkpoint mismatch');
  const current = await gitObservation(state.workspace, signal), parts = sections(current.diff);
  if (current.head !== saved.head || current.diff.trim() && !parts.length) return undefined;
  const byKey = new Map(parts.map(part => [key(part), part]));
  const changed = parts.filter(part => saved.sections[key(part)] !== hash(part));
  // A dirty file restored to HEAD has no current patch; explicitly retain that change.
  const cleared = Object.keys(saved.sections).filter(name => !byKey.has(name)).map(name => `${name}\nPreviously dirty tracked file now matches HEAD; inspect the file and checkpoint metadata.\n`);
  return [...changed, ...cleared].join('\n');
}
