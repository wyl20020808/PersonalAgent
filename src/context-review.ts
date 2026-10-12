import { contextObservation, gitChangedPaths, observationScope } from './project-observation.js';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJson, type State, type Store } from './store.js';
import { projectFileHash, type ProjectSnapshot } from './project-files.js';
import { belongsToModule, contextRoot, contextHash, contextPath, parseContextDocument, loadProjectContext, type ProjectContext, type ModuleDocument } from './project-context.js';
import type { Review } from './schema.js';
import { verifyConfirmation } from './context-trust.js';
import { FlowError } from './failure.js';

export function assertPlanningContext(state: State, store: Store): void {
  if (state.purpose === 'context-onboarding' || state.snapshotPolicy === 'none') return;
  const file = store.file('context/planning-baseline.json');
  if (!existsSync(file) && !loadProjectContext(state.workspace, state.projectContextEnabled === true).enabled) return;
  if (!existsSync(file)) { mkdirSync(store.file('context'), { recursive: true }); atomicJson(file, contextObservation(state)); }
  const baseline = JSON.parse(readFileSync(file, 'utf8')) as ProjectSnapshot;
  if (contextHash(JSON.stringify(baseline.files)) !== baseline.digest) throw new FlowError('safety', '规划基线摘要损坏');
  const current = contextObservation(state);
  const paths = [...new Set([...Object.keys(baseline.files), ...Object.keys(current.files)])].sort().filter(relative => !relative.startsWith(`${contextRoot}/`) && projectFileHash(baseline,relative) !== projectFileHash(current,relative));
  if (paths.length) {
    store.audit('context-planning-change', { baseline: file, before: baseline.digest, after: current.digest, paths });
    // Authorized planning may include implementation. Keep the observation,
    // rather than requiring the decision maker to undo its own work.
  }
}

export interface ContextBaseline { taskId: string; moduleIds: string[]; context: ProjectContext; snapshot: ProjectSnapshot; digest: string }
export interface ContextReport {
  verificationScope?: string; taskId: string; baselineDigest: string; sourceSnapshot: string; snapshot: string;
  declaredModules: string[]; actualModules: string[]; expandedModules: string[];
  changes: { path: string; kind: 'added' | 'modified' | 'deleted'; modules: string[] }[];
  renames: { oldPath: string; newPath: string }[]; knowledgeChanges: string[];
  unmappedPaths: { path: string; reason: string }[];
  findings: { code: string; moduleId?: string; path?: string; origin: 'preexisting' | 'task'; message: string }[];
  affectedModules: { moduleId: string; documentPath: string; documentUpdated: boolean; checkedFiles: string[] }[];
  contracts: { id: string; path: string; status: string; trust: unknown; content: string; source: 'task-baseline' | 'current' }[];
  decisions: { id: string; path: string; status: string; trust: unknown; content: string; source: 'task-baseline' | 'current' }[];
  relatedModules: { moduleId: string; documentPath: string }[]; reportPath: string;
}
const baselineName = (state: State) => `context/task-${state.taskIndex}-baseline.json`;
export function freezeTaskContext(state: State, store: Store): void {
  if (state.purpose === 'context-onboarding' || existsSync(store.file(baselineName(state)))) return;
  const context = loadProjectContext(state.workspace, state.projectContextEnabled === true, { runtimeDir: state.config.runtimeDir, source: state.source });
  if (!context.enabled) return;
  const task = state.tasks[state.taskIndex]!;
  if (task.moduleIds?.some(id => !context.modules.some(doc => doc.metadata.id === id))) throw Error('显式 moduleIds 引用不存在');
  const payload = { taskId: task.id, moduleIds: [...(task.moduleIds ?? [])], context, snapshot: contextObservation(state) };
  mkdirSync(store.file('context'), { recursive: true });
  const baseline = { ...payload, digest: contextHash(JSON.stringify(payload)) };
  atomicJson(store.file(baselineName(state)), baseline); store.audit('context-task-frozen', { taskId: task.id, digest: baseline.digest, snapshot: baseline.snapshot.digest, moduleIds: task.moduleIds });
}
export function taskContextBaseline(state: State, store: Store): ContextBaseline | undefined {
  const file = store.file(baselineName(state)); if (!existsSync(file)) return undefined;
  const { digest, ...payload } = JSON.parse(readFileSync(file, 'utf8')) as ContextBaseline;
  if (contextHash(JSON.stringify(payload)) !== digest || payload.taskId !== state.tasks[state.taskIndex]?.id) throw Error('Project Context 固定基线损坏或任务不匹配');
  return { ...payload, digest };
}
const fileHash = projectFileHash;
export function checkTaskContext(state: State, store: Store): ContextReport | undefined {
  const baseline = taskContextBaseline(state, store); if (!baseline) return undefined;
  const current = contextObservation(state, baseline.context), before = baseline.snapshot;
  const gitPaths = state.snapshotPolicy === 'none' ? gitChangedPaths(state.workspace) : [];
  const changes: ContextReport['changes'] = [], knowledgeChanges: string[] = [], actual = new Set<string>();
  for (const file of [...new Set([...Object.keys(before.files), ...Object.keys(current.files), ...gitPaths])].sort()) {
    if (!gitPaths.includes(file) && fileHash(before,file) === fileHash(current,file)) continue;
    if (file.startsWith(`${contextRoot}/`)) { knowledgeChanges.push(file); continue; }
    const modules = baseline.context.modules.filter(doc => belongsToModule(doc, file)).map(doc => doc.metadata.id);
    modules.forEach(id => actual.add(id));
    changes.push({ path: file, kind: gitPaths.includes(file) ? existsSync(path.join(state.workspace, file)) ? 'modified' : 'deleted' : before.files[file] === undefined ? 'added' : current.files[file] === undefined ? 'deleted' : 'modified', modules });
  }
  // Exact-byte renames are supplemental evidence; both paths always remain in changes.
  const available = changes.filter(entry => entry.kind === 'added');
  const renames = changes.filter(entry => entry.kind === 'deleted').flatMap(entry => {
    const index = available.findIndex(added => fileHash(before,entry.path) !== null && fileHash(current,added.path) === fileHash(before,entry.path));
    return index < 0 ? [] : [{ oldPath: entry.path, newPath: available.splice(index, 1)[0]!.path }];
  });
  const findings: ContextReport['findings'] = []; let live: ProjectContext | undefined;
  try { live = loadProjectContext(state.workspace, true, { runtimeDir: state.config.runtimeDir, source: state.source }); }
  catch (error) { findings.push({ code: 'CONTEXT_INVALID', origin: 'task', message: (error as Error).message }); }
  if (live && live.overview!.metadata.project_id !== baseline.context.overview!.metadata.project_id) findings.push({ code: 'CONTEXT_INVALID', origin: 'task', message: '本任务不得改变冻结的项目身份' });
  const affected = new Set(actual);
  for (const module of baseline.context.modules) {
    const updated = fileHash(before,module.relative) !== fileHash(current,module.relative);
    if (updated) affected.add(module.metadata.id);
    if (actual.has(module.metadata.id) && !updated) findings.push({ code: 'MODULE_DOC_UNCHANGED', moduleId: module.metadata.id, path: module.relative, origin: 'task', message: '模块源码变化，职责或接口说明未更新；需要 CC 明确判断原因' });
  }
  for (const module of live?.modules ?? []) if (fileHash(before,module.relative) !== fileHash(current,module.relative)) affected.add(module.metadata.id);
  const hashModules = baseline.context.modules.map(module => {
    const updated = live?.modules.find(doc => doc.metadata.id === module.metadata.id);
    return { ...module, metadata: { ...module.metadata, checked_files: { ...module.metadata.checked_files, ...updated?.metadata.checked_files } } } as ModuleDocument;
  });
  for (const module of live?.modules ?? []) if (!hashModules.some(old => old.metadata.id === module.metadata.id)) hashModules.push(module);
  for (const module of hashModules) for (const [file, expected] of Object.entries(module.metadata.checked_files)) {
    const actualHash = fileHash(current, file); if (actualHash === expected) continue;
    affected.add(module.metadata.id);
    const original = baseline.context.modules.find(doc => doc.metadata.id === module.metadata.id)?.metadata.checked_files[file];
    findings.push({ code: 'MODULE_HASH_MISMATCH', moduleId: module.metadata.id, path: file, origin: original === expected && fileHash(before, file) !== expected ? 'preexisting' : 'task', message: `SHA-256 不一致：记录 ${expected}，实际 ${actualHash ?? '文件不存在'}；先核对再 context-stamp` });
  }
  for (const doc of [...(live?.contracts ?? []), ...(live?.decisions ?? [])]) if (doc.trust?.effectiveStatus === 'unverifiable') findings.push({ code: 'CONFIRMATION_UNVERIFIABLE', path: doc.relative, origin: baseline.context.contracts.concat(baseline.context.decisions).some(old => old.relative === doc.relative && old.hash === doc.hash && old.trust?.effectiveStatus === 'unverifiable') ? 'preexisting' : 'task', message: doc.trust.reason });
  const selected = new Set([...baseline.moduleIds, ...actual]); const initial = [...selected];
  for (const module of baseline.context.modules) if (initial.includes(module.metadata.id)) module.metadata.depends_on.forEach(id => selected.add(id));
  for (const module of baseline.context.modules) if (module.metadata.depends_on.some(id => initial.includes(id))) selected.add(module.metadata.id);
  const related = (kind: 'contracts' | 'decisions'): ContextReport['contracts'] => {
    const docs = baseline.context[kind].map(doc => ({ doc, source: 'task-baseline' as const }));
    for (const doc of live?.[kind] ?? []) if (!docs.some(old => old.doc.relative === doc.relative && old.doc.hash === doc.hash)) docs.push({ doc, source: 'current' as any });
    return docs.filter(({ doc }) => doc.metadata.modules.some((id: string) => selected.has(id))).map(({ doc, source }) => {
      const trust = verifyConfirmation(doc, source === 'task-baseline' ? baseline.context.overview!.metadata.project_id : live!.overview!.metadata.project_id, { runtimeDir: state.config.runtimeDir, source: state.source });
      if (trust.effectiveStatus === 'unverifiable' && source === 'task-baseline') findings.push({ code: 'CONFIRMATION_UNVERIFIABLE', origin: doc.trust?.verified ? 'task' : 'preexisting', path: doc.relative, message: `冻结契约依据当前不可验证：${trust.reason}` });
      return { id: doc.metadata.id, path: doc.relative, status: trust.effectiveStatus, trust, content: doc.content, source };
    });
  };
  const reportPath = store.file(`context/task-${state.taskIndex}-check-${state.loops}-${randomUUID()}.json`);
  const report: ContextReport = { ...(state.snapshotPolicy === 'none' ? { verificationScope: observationScope } : {}), taskId: baseline.taskId, baselineDigest: baseline.digest, sourceSnapshot: before.digest, snapshot: current.digest, declaredModules: baseline.moduleIds, actualModules: [...actual].sort(), expandedModules: [...actual].filter(id => !baseline.moduleIds.includes(id)).sort(), changes, renames, knowledgeChanges, unmappedPaths: changes.filter(entry => !entry.modules.length).map(entry => ({ path: entry.path, reason: '任务开始时模块路径映射无匹配；可能为新职责或未建档文件，需要 CC 判断' })), findings, affectedModules: [...affected].sort().map(id => {
    const module = (live?.modules ?? []).find(doc => doc.metadata.id === id) ?? baseline.context.modules.find(doc => doc.metadata.id === id)!;
    return { moduleId: id, documentPath: module.relative, documentUpdated: fileHash(before,module.relative) !== fileHash(current,module.relative), checkedFiles: Object.keys(hashModules.find(entry => entry.metadata.id === id)?.metadata.checked_files ?? module.metadata.checked_files) };
  }), contracts: related('contracts'), decisions: related('decisions'), relatedModules: baseline.context.modules.filter(doc => selected.has(doc.metadata.id)).map(doc => ({ moduleId: doc.metadata.id, documentPath: doc.relative })), reportPath };
  if (!existsSync(reportPath)) atomicJson(reportPath, report);
  store.audit('context-task-check', { taskId: report.taskId, path: reportPath, snapshot: current.digest, expandedModules: report.expandedModules, findings }); return report;
}
export interface ReviewContractReference { id: string; path: string; title?: string; status?: string; source?: string; contentHash?: string; required?: boolean; valid?: boolean }
export function reviewContractCatalog(state: State): ReviewContractReference[] {
  const required = state.evidence?.contextReport?.contracts ?? [];
  const catalog: ReviewContractReference[] = required.map(entry => {
    try {
      const doc = parseContextDocument(state.workspace, entry.path, 'contract', Buffer.from(entry.content));
      return { id: entry.id, path: entry.path, title: doc.metadata.title, status: entry.status, source: entry.source, contentHash: doc.hash, required: true, valid: doc.metadata.id === entry.id };
    } catch { return { id: entry.id, path: entry.path, status: entry.status, source: entry.source, required: true, valid: false }; }
  });
  // Only the live, safely loaded workspace catalog can provide optional references.
  // Invalid documents remain subject to the existing report/trust veto.
  try {
    const live = loadProjectContext(state.workspace, true, { runtimeDir: state.config.runtimeDir, source: state.source });
    for (const doc of live.contracts) if (!catalog.some(entry => entry.path === doc.relative && entry.contentHash === doc.hash)) catalog.push({ id: doc.metadata.id, path: doc.relative, title: doc.metadata.title, status: doc.trust?.effectiveStatus, source: 'current', contentHash: doc.hash, required: required.some(entry => entry.id === doc.metadata.id), valid: true });
  } catch { /* checkTaskContext already records invalid live documents. */ }
  return catalog;
}
export function normalizeContractReferences(references: string[], catalog: ReviewContractReference[]) {
  const checkedContracts: string[] = [], mappings: { reference: string; id: string; via: 'id' | 'exact-relative-path' }[] = [], problems: string[] = [];
  const ids = new Map<string, Set<string>>(), paths = new Map<string, Set<string>>();
  for (const entry of catalog) {
    if (entry.valid === false || !/^[a-zA-Z0-9_-]{1,64}$/.test(entry.id) || !contextPath(entry.path) || !entry.path.startsWith(`${contextRoot}/contracts/`) || !entry.path.endsWith('.md')) { problems.push(`契约引用清单无法验证：${entry.path}`); continue; }
    const named = ids.get(entry.id) ?? new Set<string>(); named.add(entry.path); ids.set(entry.id, named);
    const located = paths.get(entry.path) ?? new Set<string>(); located.add(entry.id); paths.set(entry.path, located);
  }
  for (const [id, locations] of ids) if (locations.size !== 1) problems.push(`契约 ID 映射冲突：${id}`);
  for (const [relative, names] of paths) if (names.size !== 1) problems.push(`契约路径映射冲突：${relative}`);
  for (const reference of references) {
    const exactId = ids.has(reference), candidates = exactId ? [reference] : [...(paths.get(reference) ?? [])];
    const id = candidates[0];
    if (candidates.length !== 1 || !id || ids.get(id)?.size !== 1 || [...ids.get(id)!].some(p => paths.get(p)?.size !== 1)) { problems.push(`未知或歧义的契约引用：${reference}`); continue; }
    mappings.push({ reference, id, via: exactId ? 'id' : 'exact-relative-path' });
    if (!checkedContracts.includes(id)) checkedContracts.push(id);
  }
  return { checkedContracts, mappings, problems };
}
export function contextReviewProblems(report: ContextReport | undefined, review: Review, references = normalizeContractReferences(review.contextReview?.checkedContracts ?? [], report?.contracts ?? [])): string[] {
  if (!report || review.verdict !== 'pass') return [];
  const errors: string[] = [...references.problems];
  if (report.findings.some(f => f.code === 'CONTEXT_INVALID' || f.code === 'CONFIRMATION_UNVERIFIABLE' && f.origin === 'task')) errors.push('本轮文档格式或确认依据无效，不能通过');
  for (const finding of report.findings.filter(item => item.code === 'CONFIRMATION_UNVERIFIABLE' && item.origin === 'preexisting')) if (!review.contextReview?.confirmationNotes?.some(note => note.path === finding.path && note.reason.trim())) errors.push(`任务前已有不可验证依据 ${finding.path}，必须明确记录边界，不得当作 accepted 使用`);
  if (report.expandedModules.length && !review.contextReview?.expansionReason?.trim()) errors.push('跨模块扩展必须说明理由');
  if (report.unmappedPaths.length && !review.contextReview?.unmappedReason?.trim()) errors.push('未映射路径必须说明原因');
  for (const module of report.affectedModules) {
    const decision = review.contextReview?.modules.find(item => item.moduleId === module.moduleId);
    if (!decision || decision.documentUpdated !== module.documentUpdated || !decision.disposition.trim() || (!module.documentUpdated && !decision.noUpdateReason?.trim()) || module.checkedFiles.some(file => !decision.checkedFiles.includes(file))) errors.push(`模块 ${module.moduleId} 缺少文档、核心哈希和约束判断`);
    if (decision?.constraintsChanged && !module.documentUpdated) errors.push(`模块 ${module.moduleId} 约束发生变化，不能仅声明无需更新文档`);
  }
  for (const contract of report.contracts) if (!references.checkedContracts.includes(contract.id)) errors.push(`契约 ${contract.id} 未完成核对`);
  return errors;
}
