import { existsSync, readFileSync } from 'node:fs';
import { atomicJson, type State, type Store } from './store.js';
import { createHash } from 'node:crypto';

export interface LedgerEntry { id: string; instruction: string; outcome?: string; review?: string; files?: string[]; loop?: number; acceptance?: string[]; dependsOn?: string[]; decisionAccepted?: boolean; userAccepted?: boolean; testsPassed?: boolean; issues?: string[]; evidenceReference?: { path: string; hash: string } }
const clip = (text: unknown, length: number) => typeof text === 'string' && text.trim() ? text.trim().slice(0, length) : undefined;
const file = (store: Store) => store.file('task-ledger.json');

/** What a fresh Session needs to know about accepted work, taken from records the Run already holds. */
export function recordAcceptedTask(store: Store, state: State): void {
  const task = state.tasks[state.taskIndex];
  if (!task) return;
  const resultFile = store.file(`native-result-${state.loops}.json`);
  let outcome: unknown;
  try { outcome = existsSync(resultFile) ? JSON.parse(readFileSync(resultFile, 'utf8')).result?.summary : undefined; } catch { outcome = undefined; }
  const files = (state.evidence?.status ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const evidence = { task, result: outcome ?? null, evidence: state.evidence };
  const hash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
  const evidencePath = store.file(`accepted-evidence-${hash}.json`);
  if (!existsSync(evidencePath)) atomicJson(evidencePath, evidence);
  const entry: LedgerEntry = { id: task.id, instruction: task.instruction, outcome: typeof outcome === 'string' ? outcome : undefined, review: state.evidence?.decisionReview?.reason, ...(files.length ? { files } : {}), loop: state.loops,
    acceptance: task.acceptance, dependsOn: task.dependsOn, decisionAccepted: state.evidence?.decisionAccepted === true, userAccepted: state.evidence?.userAccepted === true,
    testsPassed: state.evidence?.passed === true, issues: state.evidence?.issues ?? [], evidenceReference: { path: evidencePath, hash } };
  const entries = taskLedger(store).filter(previous => previous.id !== task.id);
  atomicJson(file(store), [...entries, entry]);
}

export function taskLedger(store: Store): LedgerEntry[] {
  if (!existsSync(file(store))) return [];
  const entries = JSON.parse(readFileSync(file(store), 'utf8'));
  if (!Array.isArray(entries) || entries.some(entry => !entry || typeof entry.id !== 'string' || typeof entry.instruction !== 'string')) throw Error('Invalid task ledger; preserve original Session and inspect task-ledger.json');
  return entries;
}

/** Recent tasks keep their detail; older ones shrink to a line so the brief stays within its size. */
export function ledgerBrief(store: Store, state: State, maxBytes = 6000): LedgerEntry[] {
  const recorded = new Map(taskLedger(store).map(entry => [entry.id, entry]));
  // Runs accepted before the ledger existed still list their completed tasks.
  const entries: LedgerEntry[] = (state.completedTaskIds ?? []).map(id => {
    const task = state.tasks.find(task => task.id === id);
    const entry = recorded.get(id) ?? { id, instruction: task?.instruction ?? 'Historical accepted task; inspect Run audit for evidence.' };
    const { evidenceReference: _reference, ...brief } = entry; // One ledger path in the handoff resolves all full evidence references.
    return { ...brief, instruction: entry.instruction.slice(0, 300), outcome: clip(entry.outcome, 500), review: clip(entry.review, 500), files: entry.files?.slice(0, 30) };
  });
  for (let index = 0; index < entries.length && Buffer.byteLength(JSON.stringify(entries)) > maxBytes; index++) entries[index] = { id: entries[index]!.id, instruction: entries[index]!.instruction.slice(0, 80) };
  while (entries.length && Buffer.byteLength(JSON.stringify(entries)) > maxBytes) entries.shift();
  return entries;
}
