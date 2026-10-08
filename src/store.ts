import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { configSchema, taskSchema, validate, type Config, type Task } from './schema.js';
import type { Screenshot } from './screenshots.js';
import type { ProcessResult } from './process.js';
import { failureKinds, type Failure } from './failure.js';

export type Phase = 'planning' | 'execute' | 'executing' | 'applying' | 'verify' | 'review' | 'paused' | 'stopped' | 'failed' | 'completed';
export interface Evidence { screenshots?: Screenshot[]; diff: string; taskDiff?: string; roundDiff?: string; acceptanceRulesHash?: string; status: string; head: string; snapshotDigest: string; tests: ProcessResult[]; executorExitCode: number; passed: boolean; issues: string[] }
export interface State {
  nativeExecution?: boolean;
  claudeCalls?: number;
  completedTaskIds?: string[];
  failure?: Failure | null; reworkPending?: boolean; totalReworks?: number;
  version: 1; id: string; goal: string; source: string; workspace: string; base: string;
  config: Config; phase: Phase; nextPhase: Phase; tasks: Task[]; taskIndex: number; loops: number; reworks: number;
  claudeSessionId: string | null; codexThreadId: string | null; feedback: string; reason: string;
  evidence: Evidence | null; executorExitCode: number; updatedAt: string; beforeExecution: string;
}
const str = { type: 'string' }, nullable = { type: ['string', 'null'] }, integer = { type: 'integer', minimum: 0 };
const phases = ['planning', 'execute', 'executing', 'applying', 'verify', 'review', 'paused', 'stopped', 'failed', 'completed'];
const resultSchema = { type: 'object', properties: { exitCode: { type: 'integer' }, stdout: str, stderr: str }, required: ['exitCode', 'stdout', 'stderr'], additionalProperties: false };
const stateProperties = {
  version: { const: 1 }, id: { type: 'string', pattern: '^[0-9a-f-]{36}$' }, goal: str, source: str, workspace: str, base: str, config: configSchema,
  phase: { enum: phases }, nextPhase: { enum: phases }, tasks: { type: 'array', items: taskSchema }, taskIndex: integer, loops: integer, reworks: integer,
  claudeSessionId: nullable, codexThreadId: nullable, feedback: str, reason: str, updatedAt: str, beforeExecution: str, executorExitCode: { type: 'integer' },
  evidence: { anyOf: [{ type: 'null' }, { type: 'object', properties: { screenshots: { type: 'array', maxItems: 240, items: { type: 'object', additionalProperties: false, required: ['id','path','source','width','height','hash','time','runId','taskId','loop','testIndex','name'], properties: {id:str,path:str,source:str,width:integer,height:integer,hash:str,time:str,runId:str,taskId:nullable,loop:integer,testIndex:integer,name:str} } }, diff: str, acceptanceRulesHash: str, taskDiff: str, roundDiff: str, status: str, head: str, snapshotDigest: str, tests: { type: 'array', items: resultSchema }, executorExitCode: { type: 'integer' }, passed: { type: 'boolean' }, issues: { type: 'array', items: str } }, required: ['diff', 'status', 'head', 'snapshotDigest', 'tests', 'executorExitCode', 'passed', 'issues'], additionalProperties: false }] }
};
export const stateSchema = { type: 'object', properties: { ...stateProperties, nativeExecution: { type: 'boolean' }, completedTaskIds: { type: 'array', uniqueItems: true, items: str }, claudeCalls: integer, totalReworks: integer, reworkPending: { type: 'boolean' }, failure: { anyOf: [{ type: 'null' }, { type: 'object', properties: { kind: { enum: failureKinds }, stage: str, message: str, recoverable: { type: 'boolean' } }, required: ['kind', 'stage', 'message', 'recoverable'], additionalProperties: false }] } }, required: Object.keys(stateProperties), additionalProperties: false };
export function assertD(value: string): string {
  const resolved = path.resolve(value);
  if (process.platform === 'win32' && !/^D:\\/i.test(resolved)) throw new Error(`Path must be on D drive: ${value}`);
  let ancestor = resolved;
  while (!existsSync(ancestor) && ancestor !== path.dirname(ancestor)) ancestor = path.dirname(ancestor);
  if (process.platform === 'win32' && !/^D:\\/i.test(realpathSync(ancestor))) throw new Error('Path redirects outside D drive');
  return resolved;
}
export function replaceAtomic(temp: string, file: string, rename: typeof renameSync = renameSync): void {
  // Windows readers/antivirus may briefly hold a destination handle. Never unlink
  // or fall back to in-place writing; preserve the original file on exhaustion.
  const delay = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; ; attempt++) {
    try { rename(temp, file); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') || attempt >= 5) throw error;
      Atomics.wait(delay, 0, 0, 20 * (attempt + 1));
    }
  }
}
export function atomicJson(file: string, value: unknown): void {
  const temp = `${file}.${randomUUID()}.tmp`;
  const fd = openSync(temp, 'wx');
  try { writeFileSync(fd, JSON.stringify(value, null, 2)); fsyncSync(fd); } finally { closeSync(fd); }
  replaceAtomic(temp, file);
}
export class Store {
  readonly dir: string;
  constructor(runtime: string, readonly id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid run ID');
    this.dir = path.join(assertD(runtime), 'runs', id); mkdirSync(this.dir, { recursive: true });
  }
  file(name: string) { return path.join(this.dir, name); }
  save(state: State) { state.updatedAt = new Date().toISOString(); validate(stateSchema, state); atomicJson(this.file('state.json'), state); }
  load(): State { return validate<State>(stateSchema, JSON.parse(readFileSync(this.file('state.json'), 'utf8'))); }
  audit(event: string, data: unknown = {}): void {
    const file = this.file('audit.jsonl');
    const previous = existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').at(-1) : undefined;
    const previousHash = previous ? (JSON.parse(previous) as { hash: string }).hash : '';
    const record = { time: new Date().toISOString(), event, data, previousHash };
    const hash = createHash('sha256').update(JSON.stringify(record)).digest('hex');
    appendFileSync(file, `${JSON.stringify({ ...record, hash })}\n`, { flush: true });
  }
  lock(): () => void {
    const file = this.file('lock.json');
    if (existsSync(file)) {
      const { pid } = JSON.parse(readFileSync(file, 'utf8')) as { pid: number };
      let alive = true; try { process.kill(pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false; }
      if (alive) throw new Error(`Run already locked by PID ${pid}`);
      unlinkSync(file); this.audit('stale-lock-recovered', { pid });
    }
    const fd = openSync(file, 'wx'); writeFileSync(fd, JSON.stringify({ pid: process.pid })); closeSync(fd);
    return () => { if (existsSync(file)) unlinkSync(file); };
  }
}
