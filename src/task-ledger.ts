import { existsSync, readFileSync } from 'node:fs';
import { atomicJson, type State, type Store } from './store.js';

export interface LedgerEntry { id: string; instruction: string; outcome?: string; review?: string; files?: string[]; loop?: number }
const clip = (text: unknown, length: number) => typeof text === 'string' && text.trim() ? text.trim().slice(0, length) : undefined;
const file = (store: Store) => store.file('task-ledger.json');

/** What a fresh Session needs to know about accepted work, taken from records the Run already holds. */
export function recordAcceptedTask(store: Store, state: State): void {
  const task = state.tasks[state.taskIndex];
  if (!task) return;
  const resultFile = store.file(`native-result-${state.loops}.json`);
  let outcome: unknown;
  try { outcome = existsSync(resultFile) ? JSON.parse(readFileSync(resultFile, 'utf8')).result?.summary : undefined; } catch { outcome = undefined; }
  const files = (state.evidence?.status ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 30);
  const entry: LedgerEntry = { id: task.id, instruction: task.instruction.slice(0, 300), outcome: clip(outcome, 500), review: clip(state.evidence?.decisionReview?.reason, 500), ...(files.length ? { files } : {}), loop: state.loops };
  const entries = taskLedger(store).filter(previous => previous.id !== task.id);
  atomicJson(file(store), [...entries, entry]);
}

export function taskLedger(store: Store): LedgerEntry[] {
  if (!existsSync(file(store))) return [];
  const entries = JSON.parse(readFileSync(file(store), 'utf8'));
  return Array.isArray(entries) ? entries : [];
}

/** Recent tasks keep their detail; older ones shrink to a line so the brief stays within its size. */
export function ledgerBrief(store: Store, state: State, maxBytes = 6000): LedgerEntry[] {
  const recorded = new Map(taskLedger(store).map(entry => [entry.id, entry]));
  // Runs accepted before the ledger existed still list their completed tasks.
  const entries: LedgerEntry[] = state.tasks.filter(task => state.completedTaskIds?.includes(task.id)).map(task => recorded.get(task.id) ?? { id: task.id, instruction: task.instruction.slice(0, 300) });
  for (let index = 0; index < entries.length && Buffer.byteLength(JSON.stringify(entries)) > maxBytes; index++) entries[index] = { id: entries[index]!.id, instruction: entries[index]!.instruction.slice(0, 80) };
  return entries;
}
