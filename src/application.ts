import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { safeTarget } from './workspace.js';
import { atomicJson, type State, type Store } from './store.js';
import { editSchema, validate, type Edits } from './schema.js';
import { FlowError } from './failure.js';

const digest = (content: Buffer | string) => createHash('sha256').update(content).digest('hex');
const currentHash = (file: string) => existsSync(file) ? digest(readFileSync(file)) : null;
export function journalFile(store: Store, state: State): string { return store.file(`application-${state.loops}.json`); }
export function prepareApplication(store: Store, state: State, edits: Edits): void {
  validate(editSchema, edits);
  const before: Record<string, string | null> = Object.create(null) as Record<string, string | null>; const seen = new Set<string>(); let bytes = 0;
  for (const change of edits.changes) {
    const target = safeTarget(state.workspace, change.path), key = target.toLowerCase();
    if (seen.has(key)) throw new FlowError('safety', 'Duplicate edit target'); seen.add(key);
    bytes += Buffer.byteLength(change.content); if (bytes > 2 * 1024 * 1024) throw new FlowError('safety', 'Edit size limit exceeded');
    before[change.path] = currentHash(target);
  }
  const file = journalFile(store, state);
  if (existsSync(file)) throw new FlowError('safety', 'Application journal already exists for attempt');
  atomicJson(file, { version: 1, loop: state.loops, taskIndex: state.taskIndex, edits, before });
}
export function recoverApplication(store: Store, state: State): Edits {
  const journal = JSON.parse(readFileSync(journalFile(store, state), 'utf8')) as { version: number; loop: number; taskIndex: number; edits: Edits; before: Record<string, string | null> };
  if (journal.version !== 1 || journal.loop !== state.loops || journal.taskIndex !== state.taskIndex || !journal.before) throw new FlowError('safety', 'Application journal identity mismatch');
  validate(editSchema, journal.edits);
  const seen = new Set<string>(); let bytes = 0;
  const changes = journal.edits.changes.map(change => {
    const target = safeTarget(state.workspace, change.path), actual = currentHash(target), expected = digest(change.content);
    const key = target.toLowerCase();
    if (seen.has(key)) throw new FlowError('safety', 'Duplicate journal edit target'); seen.add(key);
    bytes += Buffer.byteLength(change.content); if (bytes > 2 * 1024 * 1024) throw new FlowError('safety', 'Application journal edit size limit exceeded');
    if (!Object.hasOwn(journal.before, change.path) || (actual !== journal.before[change.path] && actual !== expected)) throw new FlowError('safety', `Application journal conflicts with workspace: ${change.path}`);
    return { ...change, target, write: actual !== expected };
  });
  // Roll forward only the stored proposal. Already-written files are never rewritten.
  for (const change of changes) if (change.write) { mkdirSync(path.dirname(change.target), { recursive: true }); writeFileSync(change.target, change.content, 'utf8'); }
  return journal.edits;
}
