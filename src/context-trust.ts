import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ContextDocument } from './project-context.js';

export interface AuditScope { runtimeDir: string; source: string }
export interface ConfirmationTrust { replacement?: { id: string; relative: string; digest: string }; verified: boolean; effectiveStatus: string; reason: string }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
// The digest excludes only Controller-owned status and confirmation references.
// All substantive metadata (including supersedes) and body remain bound.
export function confirmationDigest(doc: ContextDocument): string {
  const { status, basis, ...metadata } = doc.metadata;
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const entries = (Array.isArray(basis) ? basis : [basis]).filter(entry => entry.kind !== 'user-confirmation');
  const body = doc.content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n').slice(doc.frontmatterEnd + 1).join('\n');
  return hash(JSON.stringify(canonical({ metadata, basis: entries, body })));
}
export function auditRecords(file: string): any[] {
  if (!existsSync(file)) throw Error('确认审计不可访问');
  let previous = '';
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => {
    const record = JSON.parse(line), { hash: digest, ...payload } = record;
    if (record.previousHash !== previous || hash(JSON.stringify(payload)) !== digest) throw Error('确认审计链损坏');
    previous = digest; return record;
  });
}
export function verifyConfirmation(doc: ContextDocument, projectId: string, scope?: AuditScope): ConfirmationTrust {
  if (doc.metadata.status === 'proposed') return { verified: false, effectiveStatus: 'proposed', reason: '未确认建议' };
  try {
    if (!scope) throw Error('确认审计不可访问：未提供本机 runtime/source');
    const entries = Array.isArray(doc.metadata.basis) ? doc.metadata.basis : [doc.metadata.basis];
    const references = entries.filter(entry => entry.kind === 'user-confirmation');
    if (references.length !== 1) throw Error('缺少唯一正式确认依据');
    const match = /^human-decision:([0-9a-f-]{36}):([a-f0-9]{64})$/.exec(references[0].ref);
    if (!match) throw Error('确认引用无法解析');
    const folder = path.join(scope.runtimeDir, 'runs', match[1]!);
    const records = auditRecords(path.join(folder, 'audit.jsonl'));
    const recordIndex = records.findIndex(entry => entry.hash === match[2]);
    const record = records[recordIndex];
    const data = record?.data;
    if (record?.event !== 'human-decision' || data?.kind !== 'project-context-confirmation' || data.projectId !== projectId || data.documentId !== doc.metadata.id || data.documentKind !== doc.kind || data.relative !== doc.relative || data.action !== doc.metadata.status || data.digest !== confirmationDigest(doc) || data.source !== realpathSync(scope.source)) throw Error('确认事件与项目、文档、动作或内容不匹配');
    if (records.some(event => event.event === 'context-confirmation-cancelled' && event.data.requestHash === data.requestHash)) throw Error('确认请求已取消，旧确认不得复用');
    if (!/^[0-9a-f-]{36}$/.test(data.requestId)) throw Error('确认请求 ID 无效');
    const request = JSON.parse(readFileSync(path.join(folder, 'context', 'confirmations', `${data.requestId}.json`), 'utf8'));
    const { requestHash, ...payload } = request;
    if (!/^[0-9a-f-]{36}$/.test(data.requestId) || hash(JSON.stringify(payload)) !== requestHash || requestHash !== data.requestHash || request.runId !== match[1] || request.digest !== data.digest || request.projectId !== data.projectId || request.relative !== data.relative || request.documentId !== data.documentId || request.source !== data.source || request.workspace !== data.workspace || !records.slice(0, recordIndex).some(event => event.event === 'context-confirmation-requested' && event.data.requestHash === requestHash && event.data.requestId === data.requestId)) throw Error('缺少匹配的正式确认请求或请求摘要无效');
    return { ...(request.replacement ? { replacement: { id: request.replacement.id, relative: request.replacement.relative, digest: request.replacement.digest } } : {}), verified: true, effectiveStatus: doc.metadata.status, reason: '本机 human-decision 审计链与内容验证通过' };
  } catch (error) { return { verified: false, effectiveStatus: 'unverifiable', reason: (error as Error).message }; }
}
