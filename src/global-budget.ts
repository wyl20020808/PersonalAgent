import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { atomicJson, assertD } from './store.js';
import { FlowError } from './failure.js';

interface Ledger { version: 1; limit: number; used: number; reservations: { runId: string; call: number; role: string; time: string }[] }
export function initializeGlobalBudget(file: string, limit: number): void {
  file = assertD(file);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000) throw new Error('Invalid global budget limit');
  mkdirSync(path.dirname(file), { recursive: true });
  const fd = openSync(file, 'wx');
  try { writeFileSync(fd, JSON.stringify({ version: 1, limit, used: 0, reservations: [] })); fsyncSync(fd); } finally { closeSync(fd); }
}
function load(file: string, limit: number): Ledger {
  if (!existsSync(file)) throw new FlowError('budget', 'Global budget missing; explicit initialization required');
  let value: Ledger;
  try { value = JSON.parse(readFileSync(file, 'utf8')) as Ledger; }
  catch { throw new FlowError('safety', 'Global budget ledger invalid JSON'); }
  if (!value || value.version !== 1 || value.limit !== limit || !Number.isInteger(value.used) || value.used < 0 || value.used > limit || !Array.isArray(value.reservations) || value.used !== value.reservations.length || value.reservations.some(item => !item || typeof item.runId !== 'string' || !Number.isInteger(item.call) || item.call < 1 || !['plan', 'review', 'execute'].includes(item.role) || typeof item.time !== 'string')) throw new FlowError('safety', 'Global budget ledger invalid or authorization mismatch');
  return value;
}
function canonical(file: string): string {
  file = assertD(file);
  if(existsSync(file)&&statSync(file).nlink>1)throw new FlowError('safety','Hardlinked budget ledger refused; coordination is ambiguous');
  return existsSync(file) ? assertD(realpathSync(file)) : file;
}
export function checkGlobalBudget(file: string, limit: number): void {
  const ledger = load(canonical(file), limit);
  if (ledger.used >= ledger.limit) throw new FlowError('budget', 'Global Claude call limit reached');
}
export function reserveGlobalBudget(file: string, limit: number, runId: string, call: number, role: string): number {
  file = canonical(file); const lock = `${file}.lock`; const until = Date.now() + 5000; let fd: number;
  for (;;) {
    try { fd = openSync(lock, 'wx'); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (Date.now() >= until) throw new FlowError('budget', 'Global budget lock busy; safely paused');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid })); fsyncSync(fd);
    const ledger = load(file, limit);
    if (ledger.used >= ledger.limit) throw new FlowError('budget', 'Global Claude call limit reached');
    ledger.reservations.push({ runId, call, role, time: new Date().toISOString() }); ledger.used++;
    atomicJson(file, ledger); return ledger.used;
  } finally { closeSync(fd); unlinkSync(lock); }
}
