import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseDocument, stringify } from 'yaml';
import { Store, atomicJson, replaceAtomic } from './store.js';
import { lockProject, projectTarget } from './project-files.js';
import { loadProjectContext, parseContextDocument, contextHash, type ContextDocument } from './project-context.js';
import { auditRecords, confirmationDigest, verifyConfirmation } from './context-trust.js';

export type ConfirmationAction = 'accepted' | 'rejected' | 'superseded';
export interface ContextConfirmationRequest { replacement?: { id: string; relative: string; digest: string; content: string }; id: string; runId: string; projectId: string; source: string; workspace: string; relative: string; documentId: string; documentKind: 'contract' | 'decision'; title: string; currentStatus: string; action: ConfirmationAction; digest: string; content: string; summary: string; requestHash: string }
const requestFolder = (store: Store) => store.file('context/confirmations');
function readRequest(store: Store, id: string): ContextConfirmationRequest {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw Error('确认请求 ID 无效');
  const request = JSON.parse(readFileSync(path.join(requestFolder(store), `${id}.json`), 'utf8')) as ContextConfirmationRequest;
  const { requestHash, ...payload } = request;
  if (contextHash(JSON.stringify(payload)) !== requestHash || request.runId !== store.id) throw Error('确认请求摘要损坏');
  return request;
}
export function pendingContextConfirmations(store: Store): ContextConfirmationRequest[] {
  if (!existsSync(requestFolder(store))) return [];
  const records = auditRecords(store.file('audit.jsonl'));
  return readdirSync(requestFolder(store)).filter(name => /^[0-9a-f-]{36}\.json$/.test(name)).map(name => readRequest(store, name.slice(0, -5))).filter(request => !records.some(event => ['context-confirmation-applied', 'context-confirmation-cancelled'].includes(event.event) && event.data.requestHash === request.requestHash));
}
// Review proposes requests, but only a stopped/paused formal user decision can apply one.
export function prepareContextConfirmation(store: Store, relative: string, action: ConfirmationAction): ContextConfirmationRequest {
  const unlock = store.lock();
  try { return prepareUnlocked(store, relative, action); } finally { unlock(); }
}
export function prepareUnlocked(store: Store, relative: string, action: ConfirmationAction): ContextConfirmationRequest {
  const state = store.load();
  if (state.phase !== 'paused' || !['accepted', 'rejected', 'superseded'].includes(action)) throw Error('正式确认请求需要暂停 Run 和有效动作');
  const context = loadProjectContext(state.workspace, true, { runtimeDir: state.config.runtimeDir, source: state.source });
  const doc = [...context.contracts, ...context.decisions].find(doc => doc.relative === relative);
  if (!doc || doc.metadata.status !== 'proposed' && !(doc.trust?.verified && doc.metadata.status === 'accepted' && action === 'superseded')) throw Error('确认对象必须为 proposed，或可验证的待替代 accepted');
  const replacement = action === 'superseded' ? [...context.contracts, ...context.decisions].find(other => other.kind === doc.kind && other.metadata.supersedes === doc.metadata.id && other.metadata.status === 'accepted' && other.trust?.verified) : undefined;
  if (action === 'superseded' && !replacement) throw Error('替代需要已正式接受且声明 supersedes 的同类文档');
  // Check the final serialized form before asking for consent. An 80-line
  // proposal must not leave a durable decision that cannot fit its proof fields.
  parseContextDocument(state.workspace, doc.relative, doc.kind, Buffer.from(confirmedContent(doc, action, `human-decision:${store.id}:${'0'.repeat(64)}`)));
  const previous = pendingContextConfirmations(store).find(request => request.relative === relative);
  if (previous) {
    if (previous.digest !== confirmationDigest(doc) || previous.action !== action) throw Error('已有不同内容或动作的待确认请求；先取消旧请求');
    return previous;
  }
  const payload = { ...(replacement ? { replacement: { id: replacement.metadata.id as string, relative: replacement.relative, digest: confirmationDigest(replacement), content: replacement.content } } : {}), id: randomUUID(), runId: store.id, projectId: context.overview!.metadata.project_id as string, source: realpathSync(state.source), workspace: realpathSync(state.workspace), relative, documentId: doc.metadata.id as string, documentKind: doc.kind as 'contract' | 'decision', title: doc.metadata.title as string, currentStatus: doc.metadata.status as string, action, digest: confirmationDigest(doc), content: doc.content, summary: doc.content.split(/\r?\n/).slice(doc.frontmatterEnd + 1).join('\n') };
  const request = { ...payload, requestHash: contextHash(JSON.stringify(payload)) };
  mkdirSync(requestFolder(store), { recursive: true }); atomicJson(path.join(requestFolder(store), `${request.id}.json`), request);
  store.audit('context-confirmation-requested', { requestId: request.id, requestHash: request.requestHash, relative, action, digest: request.digest }); return request;
}
function confirmedContent(doc: ContextDocument, status: ConfirmationAction, reference: string): string {
  const lines = doc.content.replace(/^\uFEFF/, '').split(/\r?\n/);
  const yaml = parseDocument(lines.slice(1, doc.frontmatterEnd).join('\n'));
  const basis = (Array.isArray(doc.metadata.basis) ? doc.metadata.basis : [doc.metadata.basis]).filter(entry => entry.kind !== 'user-confirmation');
  yaml.set('status', status); yaml.set('basis', [...basis, { kind: 'user-confirmation', ref: reference }]);
  return (doc.content.startsWith('\uFEFF') ? '\uFEFF' : '') + ['---', yaml.toString().trimEnd(), ...lines.slice(doc.frontmatterEnd)].join('\n').replace(/\n/g, doc.newline);
}
export function decideContextConfirmation(store: Store, id: string, requestHash: string, decision: string, cancel = false, response?: 'accepted' | 'rejected'): ContextConfirmationRequest {
  const unlock = store.lock(); let release: (() => void) | undefined;
  try {
    const state = store.load(); release = lockProject(state);
    if (state.phase !== 'paused' || !decision.trim()) throw Error('文档正式决策需要暂停 Run 和明确意见');
    const request = readRequest(store, id);
    if (response !== undefined && (!['accepted', 'rejected'].includes(response) || request.currentStatus !== 'proposed')) throw Error('只有 proposed 提议可以直接接受或拒绝');
    let action: ConfirmationAction = response ?? request.action;
    if (request.requestHash !== requestHash || request.workspace !== realpathSync(state.workspace) || request.source !== realpathSync(state.source)) throw Error('确认请求与当前工作区或摘要不匹配');
    let records = auditRecords(store.file('audit.jsonl'));
    if (records.some(event => ['context-confirmation-applied', 'context-confirmation-cancelled'].includes(event.event) && event.data.requestHash === requestHash)) throw Error('确认请求已处理');
    if (cancel) {
      if (records.some(event => event.event === 'human-decision' && event.data.kind === 'project-context-confirmation' && event.data.requestHash === requestHash)) throw Error('正式文档决策已落盘；请恢复同一请求，不得用取消覆盖原决策');
      store.audit('human-decision', { kind: 'project-context-cancellation', requestHash, decision }); store.audit('context-confirmation-cancelled', { requestHash }); return request;
    }
    const doc = parseContextDocument(state.workspace, request.relative, request.documentKind);
    const context = loadProjectContext(state.workspace, true, { runtimeDir: state.config.runtimeDir, source: state.source });
    if (context.overview!.metadata.project_id !== request.projectId || doc.metadata.id !== request.documentId || confirmationDigest(doc) !== request.digest) throw Error('待确认内容已变化；旧摘要不能授权新内容');
    if (action === 'superseded') {
      const replacement = [...context.contracts, ...context.decisions].find(other => other.relative === request.replacement?.relative);
      if (!replacement || !replacement.trust?.verified || replacement.metadata.status !== 'accepted' || replacement.metadata.supersedes !== request.documentId || confirmationDigest(replacement) !== request.replacement?.digest) throw Error('待批准的替代方案已变化或无法验证');
    }
    let event = records.find(entry => entry.event === 'human-decision' && entry.data.kind === 'project-context-confirmation' && entry.data.requestHash === requestHash);
    if (!event) {
      if (doc.metadata.status !== request.currentStatus) throw Error('待确认状态已变化');
      store.audit('human-decision', { kind: 'project-context-confirmation', requestId: id, requestHash, projectId: request.projectId, source: request.source, workspace: request.workspace, documentId: request.documentId, documentKind: request.documentKind, relative: request.relative, action, digest: request.digest, decision });
      records = auditRecords(store.file('audit.jsonl')); event = records.at(-1)!;
    }
    if (event.data.action !== action && response !== undefined) throw Error('该请求已有不同正式决策，不能覆盖原审计');
    action = event.data.action;
    const reference = `human-decision:${store.id}:${event.hash}`;
    const updated = confirmedContent(doc, action, reference);
    const candidate = parseContextDocument(state.workspace, request.relative, request.documentKind, Buffer.from(updated));
    if (confirmationDigest(candidate) !== request.digest || !verifyConfirmation(candidate, request.projectId, { runtimeDir: state.config.runtimeDir, source: state.source }).verified) throw Error('正式确认事件验证失败');
    const target = projectTarget(state.workspace, request.relative), temp = `${target}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, updated, { flag: 'wx', flush: true });
      if (contextHash(readFileSync(target)) !== doc.hash) throw Error('确认期间文档变化');
      replaceAtomic(temp, target);
    } finally { if (existsSync(temp)) unlinkSync(temp); }
    const checked = loadProjectContext(state.workspace, true, { runtimeDir: state.config.runtimeDir, source: state.source });
    if (![...checked.contracts, ...checked.decisions].find(doc => doc.relative === request.relative)?.trust?.verified) throw Error('更新后的确认依据无效');
    store.audit('context-confirmation-applied', { requestHash, reference, status: action, digest: request.digest, workspace: state.workspace, deliveryAuthorization: false });
    state.nextPhase = 'verify'; state.evidence = null; store.save(state); return request;
  } finally { release?.(); unlock(); }
}
