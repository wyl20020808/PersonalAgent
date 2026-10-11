import { appendFileSync, closeSync, existsSync, fstatSync, fsyncSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { configSchema, taskSchema, decisionAgentSchema, decisionDiscussionSchema, planSchema, normalizeConfig, validate, type Config, type Task } from './schema.js';
import type { DiscussionState } from './decision-discussion.js';
import type { Screenshot } from './screenshots.js';
import type { ProcessResult } from './process.js';
import { failureKinds, type Failure } from './failure.js';
import type { ContextReport } from './context-review.js';
import type { DecisionIdentity, DecisionSession } from './decision-agent.js';
import {attachmentRefSchema,type AttachmentRef} from './attachment-types.js';
import {guidanceSchema,type Guidance} from './steering.js';

export type Phase = 'planning' | 'execute' | 'executing' | 'applying' | 'verify' | 'review' | 'paused' | 'stopped' | 'failed' | 'completed';
export interface Evidence { verificationScope?: string; contextReport?: ContextReport; screenshots?: Screenshot[]; diff: string; taskDiff?: string; roundDiff?: string; acceptanceRulesHash?: string; status: string; head: string; snapshotDigest: string; tests: ProcessResult[]; executorExitCode: number; passed: boolean; issues: string[] }
export interface State {
  guidancePending?: Guidance;
  guidanceHistory?: Guidance[];
  userAttachments?: AttachmentRef[];
  executionSession?: { backend: 'opencode'; providerID: string; modelID: string; sessionId: string; runId: string; workspace: string; directory: string };
  executionAttempt?: { loop: number; taskId: string; status: 'running' | 'success' | 'failed' | 'interrupted' };
  decisionAgent?: DecisionIdentity; decisionSession?: DecisionSession;
  discussion?: DiscussionState;
  purpose?: 'context-onboarding'; projectContextEnabled?: boolean;
  snapshotPolicy?: 'none';
  nativeExecution?: boolean;
  claudeCalls?: number;
  reviewRepairs?: number;
  completedTaskIds?: string[];
  deferredTaskIds?: string[];
  failure?: Failure | null; reworkPending?: boolean; totalReworks?: number;
  version: 1; id: string; goal: string; source: string; workspace: string; base: string;
  config: Config; phase: Phase; nextPhase: Phase; tasks: Task[]; taskIndex: number; loops: number; reworks: number;
  claudeSessionId: string | null; codexThreadId: string | null; feedback: string; reason: string;
  evidence: Evidence | null; executorExitCode: number; updatedAt: string; beforeExecution: string;
}
const str = { type: 'string' }, nullable = { type: ['string', 'null'] }, integer = { type: 'integer', minimum: 0 };
const phases = ['planning', 'execute', 'executing', 'applying', 'verify', 'review', 'paused', 'stopped', 'failed', 'completed'];
const resultSchema = { type: 'object', properties: { exitCode: { type: 'integer' }, stdout: str, stderr: str, status: { enum: ['deferred_by_work_mode','requires_system_authorization'] }, classification: str, testIndex: integer }, required: ['exitCode', 'stdout', 'stderr'], additionalProperties: false };
const stateProperties = {
  version: { const: 1 }, id: { type: 'string', pattern: '^[0-9a-f-]{36}$' }, goal: str, source: str, workspace: str, base: str, config: configSchema,
  phase: { enum: phases }, nextPhase: { enum: phases }, tasks: { type: 'array', items: taskSchema }, taskIndex: integer, loops: integer, reworks: integer,
  claudeSessionId: nullable, codexThreadId: nullable, feedback: str, reason: str, updatedAt: str, beforeExecution: str, executorExitCode: { type: 'integer' },
  evidence: { anyOf: [{ type: 'null' }, { type: 'object', properties: { verificationScope: str, contextReport: { type: 'object', required: ['taskId','snapshot','baselineDigest','reportPath'], properties: { taskId: str, snapshot: str, baselineDigest: str, reportPath: str } }, screenshots: { type: 'array', maxItems: 240, items: { type: 'object', additionalProperties: false, required: ['id','path','source','width','height','hash','time','runId','taskId','loop','testIndex','name'], properties: {id:str,path:str,source:str,width:integer,height:integer,hash:str,time:str,runId:str,taskId:nullable,loop:integer,testIndex:integer,name:str} } }, diff: str, acceptanceRulesHash: str, taskDiff: str, roundDiff: str, status: str, head: str, snapshotDigest: str, tests: { type: 'array', items: resultSchema }, executorExitCode: { type: 'integer' }, passed: { type: 'boolean' }, issues: { type: 'array', items: str } }, required: ['diff', 'status', 'head', 'snapshotDigest', 'tests', 'executorExitCode', 'passed', 'issues'], additionalProperties: false }] }
};
export const stateSchema = { type: 'object', properties: { ...stateProperties, deferredTaskIds: { type: 'array', uniqueItems: true, items: str }, snapshotPolicy: { const: 'none' }, purpose: { const: 'context-onboarding' }, projectContextEnabled: { type: 'boolean' }, nativeExecution: { type: 'boolean' }, completedTaskIds: { type: 'array', uniqueItems: true, items: str }, claudeCalls: integer, reviewRepairs: integer, totalReworks: integer, reworkPending: { type: 'boolean' }, failure: { anyOf: [{ type: 'null' }, { type: 'object', properties: { kind: { enum: failureKinds }, stage: str, message: str, recoverable: { type: 'boolean' } }, required: ['kind', 'stage', 'message', 'recoverable'], additionalProperties: false }] } }, required: Object.keys(stateProperties), additionalProperties: false };
Object.assign(stateSchema.properties, {
  guidancePending: guidanceSchema,
  guidanceHistory: {type:'array',maxItems:1000,items:guidanceSchema},
  userAttachments: {type:'array',maxItems:8,items:attachmentRefSchema},
  executionSession: { type: 'object', additionalProperties: false, required: ['backend','providerID','modelID','sessionId','runId','workspace','directory'], properties: { backend: { const: 'opencode' }, providerID: str, modelID: str, sessionId: str, runId: str, workspace: str, directory: str } },
  executionAttempt: { type: 'object', additionalProperties: false, required: ['loop','taskId','status'], properties: { loop: integer, taskId: str, status: { enum: ['running','success','failed','interrupted'] } } },
  decisionAgent: { oneOf: [
    { type: 'object', properties: { backend: { const: 'claude-code' }, model: { type: 'string' } }, required: ['backend'], additionalProperties: false },
    { type: 'object', properties: { backend: { const: 'codex' }, model: { type: 'string' } }, required: ['backend'], additionalProperties: false },
    { type: 'object', properties: { backend: { const: 'opencode' }, providerID: str, modelID: str }, required: ['backend','providerID','modelID'], additionalProperties: false }
  ] },
  decisionSession: { type: 'object', properties: { backend: { enum: ['claude-code','opencode','codex'] }, sessionId: str, runId: str, workspace: str, directory: str }, required: ['backend','sessionId','runId','workspace','directory'], additionalProperties: false }
});
const sessionSchema = { type: 'object', additionalProperties: false, required: ['backend','sessionId','runId','workspace','directory'], properties: { backend: { enum: ['claude-code','opencode','codex'] }, sessionId: str, runId: str, workspace: str, directory: str } };
Object.assign(stateSchema.properties, { discussion: { type: 'object', additionalProperties: false, required: ['config','participants','steps','closed'], properties: {
  config: decisionDiscussionSchema, closed: { type: 'boolean' },
  participants: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'object', additionalProperties: false, required: ['id','agent','claudeSessionId','calls'], properties: { id: { enum: ['a','b'] }, agent: decisionAgentSchema, claudeSessionId: nullable, calls: integer, session: sessionSchema } } },
  steps: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['key','participantId','stage','status'], properties: { key: str, participantId: { enum: ['a','b'] }, stage: { enum: ['draft','discussion','synthesis'] }, status: { enum: ['running','success','failed','interrupted'] }, error: str, output: { anyOf: [planSchema, { type: 'object', additionalProperties: false, required: ['summary','disagreements','amendments'], properties: { summary: str, disagreements: { type: 'array', items: str }, amendments: { type: 'array', items: str } } }] } } } }
} } });
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
// Read only the final nonempty record. Do not cache it: other Store instances
// may append between calls. Decode after joining bytes to preserve UTF-8.
function auditTail(file: string): string | undefined {
  if (!existsSync(file)) return undefined;
  const fd = openSync(file, 'r');
  try {
    let position = fstatSync(fd).size;
    let suffix = Buffer.alloc(0);
    while (position > 0) {
      const size = Math.min(position, 64 * 1024);
      position -= size;
      const chunk = Buffer.alloc(size);
      let read = 0;
      while (read < size) {
        const count = readSync(fd, chunk, read, size - read, position + read);
        if (!count) throw new Error('Audit changed while reading tail');
        read += count;
      }
      suffix = Buffer.concat([chunk, suffix]);
      let end = suffix.length;
      while (end && [10, 13, 32, 9].includes(suffix[end - 1]!)) end--;
      const start = suffix.lastIndexOf(10, end - 1);
      if (end && (start >= 0 || position === 0)) return suffix.subarray(start + 1, end).toString('utf8').trim();
    }
    return undefined;
  } finally { closeSync(fd); }
}
export class Store {
  readonly decisionParticipant?: { participantId: 'a' | 'b'; discussionStage: string };
  readonly dir: string;
  constructor(runtime: string, readonly id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid run ID');
    this.dir = path.join(assertD(runtime), 'runs', id); mkdirSync(this.dir, { recursive: true });
  }
  file(name: string) { return path.join(this.dir, name); }
  // Explicit user switches only apply to halted Runs; discussion identities remain immutable.
  save(state: State, options: { executionSwitch?: boolean; decisionSwitch?: boolean } = {}) {
    if (existsSync(this.file('state.json'))) {
      const old = JSON.parse(readFileSync(this.file('state.json'), 'utf8'));
      const switching = options.executionSwitch === true && ['paused', 'failed', 'stopped'].includes(old.phase) && old.phase === state.phase;
      if (!switching && JSON.stringify(old.config.executionAgent ?? {backend:'codex'}) !== JSON.stringify(state.config.executionAgent ?? {backend:'codex'})) throw new Error('Immutable Execution Agent identity changed');
      if (!switching && old.executionSession && JSON.stringify(old.executionSession) !== JSON.stringify(state.executionSession)) throw new Error('Immutable Execution Session changed');
      const decisionSwitch = options.decisionSwitch === true && ['paused','failed','stopped'].includes(old.phase) && old.phase === state.phase && !old.discussion && !old.config.decisionDiscussion && !state.discussion && !state.config.decisionDiscussion && !state.decisionSession && state.claudeSessionId === null;
      if (!decisionSwitch && JSON.stringify(old.decisionAgent ?? { backend: 'claude-code' }) !== JSON.stringify(state.decisionAgent ?? { backend: 'claude-code' })) throw new Error('Immutable Decision Agent identity changed');
      if (JSON.stringify(old.config.decisionDiscussion) !== JSON.stringify(state.config.decisionDiscussion) || JSON.stringify(old.discussion?.config) !== JSON.stringify(state.discussion?.config) || JSON.stringify(old.discussion?.participants.map((p: any) => ({id:p.id,agent:p.agent}))) !== JSON.stringify(state.discussion?.participants.map(p => ({id:p.id,agent:p.agent})))) throw new Error('Immutable discussion identity changed');
    }
    state.config = normalizeConfig(state.config); state.updatedAt = new Date().toISOString(); validate(stateSchema, state); atomicJson(this.file('state.json'), state);
  }
  load(): State { const state = JSON.parse(readFileSync(this.file('state.json'), 'utf8')); state.config = validate<Config>(configSchema, state.config); return validate<State>(stateSchema, state); }
  audit(event: string, data: unknown = {}): void {
    const file = this.file('audit.jsonl');
    const previous = auditTail(file);
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
