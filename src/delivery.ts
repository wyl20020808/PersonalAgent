import { observationScope } from './project-observation.js';
import { closeSync, existsSync, fsyncSync, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, assertD, atomicJson, type State } from './store.js';
import { git, safeTarget, snapshot, observeWorkspace, collectEvidence, workspaceHead, workspaceBaseHead } from './workspace.js';
import { readProject, loadProject, projectTarget, projectFiles, lockProject, projectFileHash, projectFingerprint, hashFile } from './project-files.js';
import { editSchema, validate } from './schema.js';
import { acceptanceRulesHash } from './rules.js';
import { gitProcess, gitDiffCheck } from './git-process.js';
import { testIndexes } from './dependencies.js';
import { baselineDiff } from './incremental.js';
import { assertOnboardingScope, onboardingDocumentPath } from './context-onboarding.js';
import { loadProjectContext } from './project-context.js';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function destination(repo: string, file: string): string {
  const target = projectTarget(repo, file);
  if (existsSync(target)) {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.nlink > 1) throw new Error('Delivery hardlink or non-file target rejected');
  }
  return target;
}
type FileMap = Record<string, string>;
interface Change { path: string; content: string; before: string | null; after: string | null }
export interface Delivery {
  kind?: 'direct'; verificationScope?: string;
  version: 1; id: string; runId: string; target: string; branch: string; head: string;
  baseline: FileMap; targetStatus: string; indexHash: string; workspaceSnapshot: string; rulesHash: string; proofHash: string;
  diff: string; changes: Change[];
}
export interface DeliveryState {
  version: 1; id: string; digest: string; phase: 'preview' | 'approved' | 'applying' | 'applied' | 'invalidated' | 'blocked';
  approval: { digest: string; decision: string; time: string } | null;
  written: string[]; intent: string | null; reason: string;
}
const str = { type: 'string' }, sha = { type: 'string', pattern: '^[0-9a-f]{64}$' }, uuid = { type: 'string', pattern: '^[0-9a-f-]{36}$' };
export const deliverySchema = { type: 'object', additionalProperties: false, anyOf: [{ properties: { changes: { type: 'array', minItems: 1 } } }, { required: ['kind', 'verificationScope'], properties: { kind: { const: 'direct' }, verificationScope: { const: observationScope } } }], required: ['version', 'id', 'runId', 'target', 'branch', 'head', 'baseline', 'targetStatus', 'indexHash', 'workspaceSnapshot', 'rulesHash', 'proofHash', 'diff', 'changes'], properties: {
  verificationScope: str, kind: { const: 'direct' }, version: { const: 1 }, id: uuid, runId: uuid, target: str, branch: str, head: str,
  baseline: { type: 'object', additionalProperties: sha }, targetStatus: { const: '' }, indexHash: sha, workspaceSnapshot: sha, rulesHash: sha, proofHash: sha, diff: str,
  changes: { type: 'array', maxItems: 50, items: { type: 'object', additionalProperties: false, required: ['path', 'content', 'before', 'after'], properties: { path: str, content: str, before: { anyOf: [sha, { type: 'null' }] }, after: { anyOf: [sha, { type: 'null' }] } } } }
} };
export const deliveryStateSchema = { type: 'object', additionalProperties: false, required: ['version', 'id', 'digest', 'phase', 'approval', 'written', 'intent', 'reason'], properties: {
  version: { const: 1 }, id: uuid, digest: sha, phase: { enum: ['preview', 'approved', 'applying', 'applied', 'invalidated', 'blocked'] }, written: { type: 'array', uniqueItems: true, items: str }, intent: { type: ['string', 'null'] }, reason: str,
  approval: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['digest', 'decision', 'time'], properties: { digest: sha, decision: { type: 'string', minLength: 1 }, time: str } }] }
} };
function directory(store: Store, id: string): string {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid delivery ID');
  return store.file(path.join('deliveries', id));
}
function save(store: Store, state: DeliveryState): void {
  validate(deliveryStateSchema, state); atomicJson(path.join(directory(store, state.id), 'state.json'), state);
  store.audit('delivery-transition', { deliveryId: state.id, digest: state.digest, phase: state.phase, written: state.written, intent: state.intent, reason: state.reason });
}
function render(delivery: Delivery, digest: string): string {
  if (delivery.verificationScope) return `# Direct 成果确认\n\nRun: ${delivery.runId}\n项目: ${delivery.target}\n\n${delivery.verificationScope}\n\nApproval digest: ${digest}\n\n文件已在原目录修改。changes 为空表示未建立完整文件清单，不表示没有修改。此确认只确认现有成果，不执行文件复制或恢复。\n`;
  const scope = delivery.changes.some(change => change.after === null) ? 'Additions, modifications and explicitly listed Context document deletions only. No commit, merge or push.' : 'Only additions and modifications. No commit, merge, push or deletion.';
  if (delivery.kind === 'direct') return `# 直接开发成果确认\n\nRun：${delivery.runId}\n项目：${delivery.target}\n审批摘要：${digest}\n\n文件已经由 Agent 在项目目录中修改。此审批确认已发生的成果，不会再次写入、提交、合并、推送或部署。\n\n${delivery.changes.map(c => `${c.path}: ${c.before ?? '新增'} -> ${c.after}`).join('\n')}\n\n完整 Diff 见 diff.patch。\n`;

  return `# Delivery preview\n\nDelivery: ${delivery.id}\nRun: ${delivery.runId}\nTarget: ${JSON.stringify(delivery.target)}\nBranch: ${JSON.stringify(delivery.branch)}\nHEAD: ${delivery.head}\nApproval digest: ${digest}\nAcceptance rules: ${delivery.rulesHash}\nWorkspace snapshot: ${delivery.workspaceSnapshot}\n\n${scope}\n\n${delivery.changes.map(change => `${change.after === null ? 'DELETE' : change.before === null ? 'ADD' : 'MODIFY'} ${JSON.stringify(change.path)}: ${change.before ?? 'absent'} -> ${change.after ?? 'absent'}`).join('\n')}\n\nFull diff is in diff.patch and manifest.json. Approve this exact digest only after inspecting them.\n`;
}
function load(store: Store, id: string): { delivery: Delivery; state: DeliveryState } {
  const dir = directory(store, id);
  const delivery = validate<Delivery>(deliverySchema, JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')));
  const state = validate<DeliveryState>(deliveryStateSchema, JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')));
  if (delivery.id !== id || state.id !== id || delivery.runId !== store.id || hash(JSON.stringify(delivery)) !== state.digest) throw new Error('Delivery content digest mismatch');
  for (const change of delivery.changes) if (change.after === null && (delivery.branch !== 'project-files' || store.load().purpose !== 'context-onboarding' || !onboardingDocumentPath(change.path) || change.path.endsWith('/overview.md') || change.before === null || change.content !== '')) throw new Error('Delivery deletion outside Context document scope');
  if (delivery.kind === 'direct') {
    if (realpathSync(delivery.target) !== delivery.target || store.load().config.projectMode !== 'direct') throw new Error('Direct delivery project mismatch');
    if (readFileSync(path.join(dir, 'diff.patch'), 'utf8') !== delivery.diff || readFileSync(path.join(dir, 'preview.md'), 'utf8') !== render(delivery, state.digest)) throw new Error('Delivery preview was replaced');
    return { delivery, state };
  }
  if (delivery.branch !== 'project-files' && assertD(delivery.target) !== delivery.target) throw new Error('Delivery target must be on D drive');
  validate(editSchema, { summary: 'Delivery', changes: delivery.changes.map(({ path, content }) => ({ path, content })) });
  const seen = new Set<string>(); let size = 0;
  for (const change of delivery.changes) {
    const key = destination(delivery.target, change.path).toLowerCase();
    if (seen.has(key) || change.after !== null && hash(change.content) !== change.after) throw new Error('Unsafe duplicate or changed delivery content');
    seen.add(key); size += Buffer.byteLength(change.content);
    if (size > 2 * 1024 * 1024) throw new Error('Delivery size limit exceeded');
  }
  if (state.written.some(file => !delivery.changes.some(change => change.path === file)) || (state.intent && !delivery.changes.some(change => change.path === state.intent))) throw new Error('Delivery journal contains unknown paths');
  if (readFileSync(path.join(dir, 'diff.patch'), 'utf8') !== delivery.diff || readFileSync(path.join(dir, 'preview.md'), 'utf8') !== render(delivery, state.digest)) throw new Error('Delivery preview was replaced');
  return { delivery, state };
}
async function fileMap(repo: string, generic = false): Promise<FileMap> {
  const result: FileMap = Object.create(null);
  if(generic) {const manifest=readProject(repo);for(const name of Object.keys(manifest.files)) result[name]=projectFileHash(manifest,name)!;return result;}
  for (const file of (await git(repo, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean).sort()) {
    const target = path.resolve(repo, file);
    if (!target.startsWith(`${repo}${path.sep}`) || lstatSync(target).isSymbolicLink()) throw new Error('Unsafe delivery snapshot path');
    result[file] = hash(readFileSync(target));
  }
  return result;
}
async function fullDiff(repo: string, base: string): Promise<string> {
  let diff = await git(repo, ['diff', '--no-ext-diff', '--no-textconv', base, '--']);
  for (const file of (await git(repo, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean)) {
    const content = readFileSync(safeTarget(repo, file));
    if (content.length > 1000000 || content.includes(0)) throw new Error('Unsupported delivery file');
    diff += `\nNEW FILE ${file}\n${content.toString('utf8')}\n`;
  }
  return diff;
}
async function completionProof(store: Store, state: State): Promise<string> {
  if (state.purpose === 'context-onboarding') { assertOnboardingScope(state, store); loadProjectContext(state.workspace, true); }
  if (state.phase !== 'completed' || !state.tasks.length || state.taskIndex !== state.tasks.length || !state.evidence?.passed || state.evidence.executorExitCode !== 0 || !state.evidence.acceptanceRulesHash) throw new Error('Run lacks completed verification or acceptance rule fingerprints');
  if (await observeWorkspace(state) !== state.evidence.snapshotDigest || await workspaceHead(state) !== workspaceBaseHead(state)) throw new Error('Completed workspace changed');
  const rules = await acceptanceRulesHash(state, true);
  if (rules !== state.evidence.acceptanceRulesHash) throw new Error('Acceptance rules changed since verification');
  const approvals = new Map<number, unknown>(); let previous = '', taskIndex = 0; let check: State['evidence'] = null;
  let plan: unknown;
  for (const line of readFileSync(store.file('audit.jsonl'), 'utf8').trim().split('\n')) {
    const { hash: recordedHash, ...record } = JSON.parse(line);
    if (record.previousHash !== previous || hash(JSON.stringify(record)) !== recordedHash) throw new Error('Run audit chain invalid'); previous = recordedHash;
    if (record.event === 'plan') plan = record.data.tasks;
    if (record.event === 'transition') { taskIndex = record.data.taskIndex; if (record.data.phase === 'executing') check = null; }
    if (record.event === 'independent-check') check = record.data;
    if (record.event === 'review' && record.data.verdict === 'pass') {
      // Only reviews refer to an active task. Completed transitions advance the
      // index beyond the plan and must not resolve a trusted task-stage mapping.
      const expectedTests = state.nativeExecution && taskIndex === state.tasks.length - 1 ? state.config.tests.length : testIndexes(state.tasks[taskIndex], state.config).length;
      if (check?.passed && check.executorExitCode === 0 && check.issues.length === 0 && check.tests.length === expectedTests && check.tests.every(result => result.exitCode === 0) && check.acceptanceRulesHash === rules) approvals.set(taskIndex, check);
    }
  }
  if (JSON.stringify(plan) !== JSON.stringify(state.tasks) || state.tasks.some((_, index) => !approvals.has(index)) || JSON.stringify(approvals.get(state.tasks.length - 1)) !== JSON.stringify(state.evidence)) throw new Error('Run lacks verified supervisor approvals for every task');
  return hash(JSON.stringify({ tasks: state.tasks, checks: [...approvals], rules }));
}
async function repositoryCheck(target: string, branch: string, head: string): Promise<void> {
  if (assertD(target) !== target || realpathSync(target).toLowerCase() !== target.toLowerCase()) throw new Error('Target repository redirected');
  if ((await git(target, ['rev-parse', '--show-toplevel'])).replace(/\\/g, '/').toLowerCase() !== target.replace(/\\/g, '/').toLowerCase()) throw new Error('Target must be repository root');
  if (await git(target, ['symbolic-ref', '--short', 'HEAD']) !== branch || await git(target, ['rev-parse', 'HEAD']) !== head) throw new Error('Target branch or HEAD changed');
  if (/^(120000|160000) /m.test(await git(target, ['ls-files', '--stage']))) throw new Error('Target symlinks or submodules rejected');
}
async function validateCurrent(store: Store, delivery: Delivery, journal: DeliveryState): Promise<void> {
  const run = store.load();
  if (run.snapshotPolicy === 'none' && (delivery.kind !== 'direct' || delivery.verificationScope !== observationScope)) throw new Error('Snapshot-free delivery requires explicit limited-scope direct confirmation');

  const generic=delivery.branch==='project-files';
  if (!run.config.allowedRepositories.some(repo => realpathSync(repo).toLowerCase() === delivery.target.toLowerCase())) throw new Error('Target is not in persisted allowed repositories');
  if (await completionProof(store, run) !== delivery.proofHash || run.evidence!.snapshotDigest !== delivery.workspaceSnapshot) throw new Error('Delivery completion proof changed');
  if (delivery.kind === 'direct') {
    if (run.config.projectMode !== 'direct' || realpathSync(run.source) !== delivery.target || run.workspace !== delivery.target) throw new Error('Direct delivery target mismatch');
    return;
  }
  if(generic) {if(realpathSync(delivery.target)!==delivery.target || delivery.target!==realpathSync(run.source) || run.config.projectMode!=='isolated')throw new Error('Project delivery target mismatch');}
  else {await repositoryCheck(delivery.target, delivery.branch, delivery.head);
  if (hash(await git(delivery.target, ['ls-files', '--stage', '-z'])) !== delivery.indexHash) throw new Error('Target index changed');}
  const current = await fileMap(delivery.target,generic), allowed = new Set([...journal.written, ...(journal.intent ? [journal.intent] : [])]);
  for (const file of new Set([...Object.keys(delivery.baseline), ...Object.keys(current)])) {
    const before = delivery.baseline[file] ?? null, actual = current[file] ?? null;
    const change = delivery.changes.find(item => item.path === file);
    if (actual !== before && !(allowed.has(file) && change?.after === actual)) throw new Error(`Target content conflict: ${file}`);
  }
  for (const change of delivery.changes) {
    const target = destination(delivery.target, change.path);
    if(!generic) {const ignored = await gitProcess(delivery.target, ['check-ignore', '--no-index', '--', change.path], { allowedExitCodes:[0,1] });
    if (ignored.exitCode !== 1) throw new Error(`Ignored or unreviewable delivery path: ${change.path}`);}
    const actual = existsSync(target) ? hash(readFileSync(target)) : null;
    if (actual !== change.before && !(allowed.has(change.path) && actual === change.after)) throw new Error(`Target content conflict: ${change.path}`);
  }
}
export async function previewDelivery(store: Store, target: string, branch: string): Promise<{ id: string; digest: string; directory: string }> {
  const unlock = store.lock();
  try {
    const run = store.load();

    if (run.snapshotPolicy === 'none' && run.config.projectMode !== 'direct') throw new Error('Snapshot-free isolated Run cannot safely Apply to source. Inspect the Git diff and integrate manually after approval.');
    const proofHash = await completionProof(store, run);
    if (run.config.projectMode === 'direct') {
      target = realpathSync(target);
      if (target !== run.workspace || branch !== 'direct') throw new Error('Direct delivery requires the current source directory and direct branch marker');
      if (run.snapshotPolicy === 'none') {
        const delivery: Delivery = { kind: 'direct', verificationScope: observationScope, version: 1, id: randomUUID(), runId: run.id, target, branch: 'direct', head: run.base, baseline: {}, targetStatus: '', indexHash: hash('direct'), workspaceSnapshot: run.evidence!.snapshotDigest, rulesHash: run.evidence!.acceptanceRulesHash!, proofHash, diff: run.evidence!.diff, changes: [] };
        validate(deliverySchema, delivery);
        const digest = hash(JSON.stringify(delivery)), dir = directory(store, delivery.id); mkdirSync(dir, { recursive: true });
        atomicJson(path.join(dir, 'manifest.json'), delivery); writeFileSync(path.join(dir, 'diff.patch'), delivery.diff);
        writeFileSync(path.join(dir, 'preview.md'), render(delivery, digest));
        save(store, { version: 1, id: delivery.id, digest, phase: 'preview', approval: null, written: [], intent: null, reason: observationScope });
        return { id: delivery.id, digest, directory: dir };
      }
      const baselineFile = loadProject(store.file('project-baseline.json'));
      if (hash(JSON.stringify(baselineFile.files)) !== baselineFile.digest) throw new Error('Direct baseline hash mismatch');
      const baseline: FileMap = {}, changes: Change[] = [];
      for (const file of Object.keys(baselineFile.files)) baseline[file] = projectFileHash(baselineFile,file)!;
      const current = projectFiles(run.workspace);
      for (const file of new Set([...Object.keys(baseline), ...current])) {
        const output = path.resolve(run.workspace, file);
        if (!existsSync(output)) throw new Error('Direct delivery deletions require explicit manual review');
        const after = hashFile(output), before = baseline[file] ?? null;
        if (before !== after) changes.push({ path: file, content: '', before, after });
      }
      const diff = await baselineDiff(store, run, 'project-baseline.json', new AbortController().signal) ?? '';
      const delivery: Delivery = { kind: 'direct', version: 1, id: randomUUID(), runId: run.id, target, branch: 'direct', head: run.base, baseline, targetStatus: '', indexHash: hash('direct'), workspaceSnapshot: run.evidence!.snapshotDigest, rulesHash: run.evidence!.acceptanceRulesHash!, proofHash, diff, changes };
      validate(deliverySchema, delivery);
      const digest = hash(JSON.stringify(delivery)), dir = directory(store, delivery.id); mkdirSync(dir, { recursive: true });
      atomicJson(path.join(dir, 'manifest.json'), delivery); writeFileSync(path.join(dir, 'diff.patch'), diff); writeFileSync(path.join(dir, 'preview.md'), render(delivery, digest));
      const state: DeliveryState = { version: 1, id: delivery.id, digest, phase: 'preview', approval: null, written: [], intent: null, reason: '文件已经修改；等待最终成果确认' };
      save(store, state); return { id: delivery.id, digest, directory: dir };
    }
    if(run.config.projectMode==='isolated')return previewProjectDelivery(store,run,target,proofHash);
    target = assertD(target);
    if (!branch.trim() || !run.config.allowedRepositories.some(repo => realpathSync(repo).toLowerCase() === target.toLowerCase())) throw new Error('Explicit branch and persisted allowed target required');
    await repositoryCheck(target, branch, run.base);
    if (await git(target, ['status', '--porcelain=v1', '--untracked-files=all'])) throw new Error('Delivery target must be clean');
    if (/mode change/.test(await git(run.workspace, ['diff', '--summary', run.base, '--']))) throw new Error('Delivery file mode changes forbidden');
    const changes: Change[] = [];
    const names = new Set((await git(run.workspace, ['diff', '--name-only', '--no-renames', '-z', run.base, '--']) + '\0' + await git(run.workspace, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean));
    for (const file of names) {
      const source = safeTarget(run.workspace, file), output = destination(target, file);
      if (!existsSync(source)) throw new Error('Delivery deletions forbidden');
      const bytes = readFileSync(source), content = bytes.toString('utf8');
      if (bytes.includes(0) || !Buffer.from(content).equals(bytes)) throw new Error('Only UTF-8 delivery files supported');
      changes.push({ path: file, content, before: existsSync(output) ? hash(readFileSync(output)) : null, after: hash(bytes) });
    }
    const delivery: Delivery = { version: 1, id: randomUUID(), runId: run.id, target, branch, head: run.base, baseline: await fileMap(target), targetStatus: '', indexHash: hash(await git(target, ['ls-files', '--stage', '-z'])), workspaceSnapshot: run.evidence!.snapshotDigest, rulesHash: run.evidence!.acceptanceRulesHash!, proofHash, diff: await fullDiff(run.workspace, run.base), changes };
    const expected = { ...delivery.baseline }; for (const change of changes) expected[change.path] = change.after!;
    const mapHash = (files: FileMap) => hash(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))));
    if (mapHash(expected) !== mapHash(await fileMap(run.workspace))) throw new Error('Target bytes differ from validated workspace');
    validate(deliverySchema, delivery);
    const digest = hash(JSON.stringify(delivery)), dir = directory(store, delivery.id); mkdirSync(dir, { recursive: true });
    atomicJson(path.join(dir, 'manifest.json'), delivery); writeFileSync(path.join(dir, 'diff.patch'), delivery.diff); writeFileSync(path.join(dir, 'preview.md'), render(delivery, digest));
    const state: DeliveryState = { version: 1, id: delivery.id, digest, phase: 'preview', approval: null, written: [], intent: null, reason: '' };
    save(store, state); load(store, delivery.id); await validateCurrent(store, delivery, state);
    return { id: delivery.id, digest, directory: dir };
  } finally { unlock(); }
}
export async function approveDelivery(store: Store, id: string, digest: string, decision: string): Promise<DeliveryState> {
  const unlock = store.lock();
  try {
    const { delivery, state } = load(store, id);
    if (state.phase !== 'preview' || digest !== state.digest || !decision.trim()) throw new Error('Explicit approval of current preview digest required');
    await validateCurrent(store, delivery, state);
    state.approval = { digest, decision, time: new Date().toISOString() }; state.phase = 'approved'; save(store, state); return state;
  } finally { unlock(); }
}
async function previewProjectDelivery(store: Store,run: State,target: string,proofHash: string): Promise<{id:string;digest:string;directory:string}> {
  target=realpathSync(target);
  if(target!==realpathSync(run.source))throw new Error('Isolated project delivery must target original project');
  const baseline=loadProject(store.file('project-baseline.json')), current=readProject(target), output=readProject(run.workspace);
  if(current.digest!==projectFingerprint(baseline))throw new Error('Project delivery conflict: source changed since run creation');
  const changes: Change[]=[];
  for(const name of new Set([...Object.keys(baseline.files),...Object.keys(output.files)])) {
    if(projectFileHash(baseline,name)===projectFileHash(output,name))continue;
    if(output.files[name]===undefined) {
      if(run.purpose !== 'context-onboarding' || !onboardingDocumentPath(name) || name.endsWith('/overview.md')) throw new Error('Delivery deletion outside Context document scope');
      changes.push({path:name,content:'',before:projectFileHash(baseline,name),after:null}); continue;
    }
    const bytes=readFileSync(projectTarget(run.workspace,name)),content=bytes.toString('utf8');
    if(bytes.includes(0)||!Buffer.from(content).equals(bytes))throw new Error('Only UTF-8 delivery files supported');
    changes.push({path:name,content,before:projectFileHash(baseline,name),after:hash(bytes)});
  }
  const delivery:Delivery={version:1,id:randomUUID(),runId:run.id,target,branch:'project-files',head:run.base,baseline:await fileMap(target,true),targetStatus:'',indexHash:hash('project-files'),workspaceSnapshot:run.evidence!.snapshotDigest,rulesHash:run.evidence!.acceptanceRulesHash!,proofHash,diff:run.evidence!.diff,changes};
  validate(deliverySchema,delivery);
  const digest=hash(JSON.stringify(delivery)),dir=directory(store,delivery.id);mkdirSync(dir,{recursive:true});
  atomicJson(path.join(dir,'manifest.json'),delivery);writeFileSync(path.join(dir,'diff.patch'),delivery.diff);writeFileSync(path.join(dir,'preview.md'),render(delivery,digest));
  const state:DeliveryState={version:1,id:delivery.id,digest,phase:'preview',approval:null,written:[],intent:null,reason:''};
  save(store,state);load(store,delivery.id);await validateCurrent(store,delivery,state);
  return {id:delivery.id,digest,directory:dir};
}
function targetLock(target: string, resume: boolean): () => void {
  const root = assertD(fileURLToPath(new URL('../../.delivery-locks/', import.meta.url))); mkdirSync(root, { recursive: true });
  const file = path.join(root, `${hash(target.toLowerCase())}.json`);
  if (existsSync(file) && resume) {
    const guard = openSync(`${file}.recovery`, 'wx');
    try {
      const owner = JSON.parse(readFileSync(file, 'utf8')) as { pid: number };
      let dead = false; try { process.kill(owner.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') dead = true; }
      if (!dead) throw new Error('Target delivery lock still active; human intervention required');
      unlinkSync(file);
    } finally { closeSync(guard); unlinkSync(`${file}.recovery`); }
  }
  const fd = openSync(file, 'wx'); writeFileSync(fd, JSON.stringify({ pid: process.pid })); fsyncSync(fd); closeSync(fd);
  return () => unlinkSync(file);
}
export interface ApplyOptions { resume?: boolean; afterWrite?: (path: string, count: number) => Promise<void> }
export async function applyDelivery(store: Store, id: string, options: ApplyOptions = {}): Promise<DeliveryState> {
  const unlock = store.lock(); let release: (() => void) | undefined; let journal: DeliveryState | undefined;
  try {
    const loaded = load(store, id), delivery = loaded.delivery; journal = loaded.state;
    if (!journal.approval || journal.approval.digest !== journal.digest || !['approved', 'applying', 'applied'].includes(journal.phase)) throw new Error('Delivery has no valid explicit approval');
    if (journal.phase === 'applying' && !options.resume) throw new Error('Interrupted application requires explicit --resume');
    if (delivery.kind === 'direct') {
      release = lockProject({...store.load(),source:delivery.target,config:{...store.load().config,projectMode:'direct'}});
      await validateCurrent(store, delivery, journal);
      if (journal.phase === 'applied') { store.audit('delivery-repeat-verified', { deliveryId: id, kind: 'direct', sourceWrites: 0 }); return journal; }
      journal.phase = 'applying'; save(store, journal);
      const run = store.load();
      const evidence = await collectEvidence({ ...run, taskIndex: run.tasks.length - 1 }, new AbortController().signal, true);
      atomicJson(path.join(directory(store, id), 'final-check.json'), evidence);
      store.audit('delivery-independent-check', { deliveryId: id, kind: 'direct', ...evidence, sourceWrites: 0 });
      if (!evidence.passed || evidence.snapshotDigest !== delivery.workspaceSnapshot || evidence.acceptanceRulesHash !== delivery.rulesHash) throw new Error('Direct delivery final independent verification failed');
      journal.phase = 'applied'; journal.reason = run.snapshotPolicy === 'none' ? `配置测试已通过，现有成果已确认；${observationScope}` : '已有成果已独立验收并确认；未重复写入项目文件'; save(store, journal); return journal;
    }
    const projectRelease=lockProject({...store.load(),source:delivery.target,config:{...store.load().config,projectMode:'direct'}});
    try {const legacyRelease=delivery.branch==='project-files'?()=>{}:targetLock(delivery.target,options.resume??false);release=()=>{try{legacyRelease();}finally{projectRelease();}};}catch(error){projectRelease();throw error;}
    await validateCurrent(store, delivery, journal);
    if (journal.phase === 'applied') {
      if (delivery.branch!=='project-files' && await fullDiff(delivery.target, delivery.head) !== delivery.diff) throw new Error('Applied target diff changed');
      store.audit('delivery-repeat-verified', { deliveryId: id }); return journal;
    }
    journal.phase = 'applying'; save(store, journal);
    for (const change of delivery.changes) {
      await validateCurrent(store, delivery, journal);
      const target = destination(delivery.target, change.path), actual = existsSync(target) ? hash(readFileSync(target)) : null;
      if (actual === change.after) { if (!journal.written.includes(change.path)) journal.written.push(change.path); journal.intent = null; save(store, journal); continue; }
      if (actual !== change.before) throw new Error(`Target conflict before write: ${change.path}`);
      journal.intent = change.path; save(store, journal);
      if (change.after === null) {
        if (hash(readFileSync(target)) !== change.before) throw new Error(`Target conflict before deletion: ${change.path}`);
        unlinkSync(target);
        await options.afterWrite?.(change.path, journal.written.length + 1);
        journal.written.push(change.path); journal.intent = null; save(store, journal); continue;
      }
      mkdirSync(path.dirname(target), { recursive: true });
      // Existing files are opened without truncation and compared again before writing.
      // This rejects detected races; Node provides no CAS against unrelated writers.
      const fd = openSync(target, change.before === null ? 'wx' : 'r+');
      try {
        if (fstatSync(fd).nlink > 1) throw new Error('Delivery hardlink appeared during open');
        if (change.before !== null && hash(readFileSync(fd)) !== change.before) throw new Error(`Target conflict during open: ${change.path}`);
        const bytes = Buffer.from(change.content); let offset = 0;
        while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset, offset);
        ftruncateSync(fd, bytes.length); fsyncSync(fd);
      } finally { closeSync(fd); }
      if (hash(readFileSync(target)) !== change.after) throw new Error(`Delivery write verification failed: ${change.path}`);
      await options.afterWrite?.(change.path, journal.written.length + 1);
      journal.written.push(change.path); journal.intent = null; save(store, journal);
    }
    await validateCurrent(store, delivery, journal);
    if(delivery.branch==='project-files') {
      if(await snapshot(delivery.target,undefined,true)!==delivery.workspaceSnapshot)throw new Error('Project delivery final fingerprint mismatch');
      journal.phase='applied';save(store,journal);return journal;
    }
    const diff = await fullDiff(delivery.target, delivery.head);
    const check = await gitDiffCheck(delivery.target,delivery.head);
    store.audit('delivery-final-check', { deliveryId: id, diff, diffHash: hash(diff), exitCode: check.exitCode, stdout: check.stdout, stderr: check.stderr });
    if (diff !== delivery.diff || check.exitCode !== 0 || await snapshot(delivery.target) !== delivery.workspaceSnapshot) throw new Error('Delivery final Git diff verification failed');
    journal.phase = 'applied'; save(store, journal); return journal;
  } catch (error) {
    if (!journal) {
      try { journal = validate<DeliveryState>(deliveryStateSchema, JSON.parse(readFileSync(path.join(directory(store, id), 'state.json'), 'utf8'))); }
      catch { /* Corrupt journal requires manual intervention; never apply. */ }
    }
    if (journal && ['approved', 'applying', 'applied'].includes(journal.phase) && !((error as Error).message.includes('requires explicit --resume'))) {
      journal.phase = 'invalidated'; journal.approval = null; journal.reason = (error as Error).message; save(store, journal);
    }
    store.audit('delivery-error', { deliveryId: id, reason: (error as Error).message }); throw error;
  } finally { release?.(); unlock(); }
}
export async function deliveryStatus(store: Store, id: string): Promise<DeliveryState> {
  const unlock = store.lock();
  try {
    const { delivery, state } = load(store, id);
    if (state.approval) {
      try { await validateCurrent(store, delivery, state); }
      catch (error) { state.phase = 'invalidated'; state.approval = null; state.reason = (error as Error).message; save(store, state); }
    }
    return state;
  } finally { unlock(); }
}
