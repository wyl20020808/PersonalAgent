import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { stringify } from 'yaml';
import { createRun, drive } from '../src/controller.js';
import { freezeTaskContext, checkTaskContext, contextReviewProblems } from '../src/context-review.js';
import { prepareContextConfirmation, decideContextConfirmation, pendingContextConfirmations } from '../src/context-confirmation.js';
import { confirmationDigest, auditRecords } from '../src/context-trust.js';
import { loadProjectContext, contextRoot, stampContext, contextHash } from '../src/project-context.js';
import { readProject } from '../src/project-files.js';
import { RealAgents } from '../src/real-agents.js';
import { git } from '../src/workspace.js';
import { approveDelivery, previewDelivery, applyDelivery } from '../src/delivery.js';
import type { Agents } from '../src/adapters.js';
import type { Config, Review } from '../src/schema.js';
import type { State } from '../src/store.js';

// Short Windows paths avoid known Git long-path fixture failures; these are disposable Mock projects.
const root = process.platform === 'win32' ? `D:/pa-pc2/${randomUUID().slice(0, 8)}` : path.resolve('.validation', `pc2-${randomUUID().slice(0, 8)}`);
console.log(`Phase2 Mock evidence root: ${root}`);
const headings = { overview: ['项目目标', '范围', '非目标', '总体结构'], module: ['职责', '边界', '入口与测试'], contract: ['约束', '检查方式'], decision: ['决定', '原因', '未采用方案'] };
const document = (kind: keyof typeof headings, metadata: object, body = '明确标记的本地 Mock；不是实际 CC/Codex 输出。') => `---\n${stringify({ schema: 1, kind, ...metadata })}---\n${headings[kind].map(title => `## ${title}\n${body}\n`).join('')}`;
function write(workspace: string, relative: string, content: string) { const file = path.join(workspace, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; }
const contractPath = `${contextRoot}/contracts/geometry.md`;
async function fixture(mode: 'direct' | 'isolated' = 'isolated', useGit = false) {
  const directory = path.join(root, randomUUID().slice(0, 8)), source = path.join(directory, 's'); fs.mkdirSync(source, { recursive: true });
  write(source, 'src/combat.js', 'export const hit = 1;\n'); write(source, 'src/world.js', 'export const wall = 1;\n'); write(source, 'src/style.css', '.actor{opacity:1}\n');
  write(source, 'src/shared.js', 'export const shared = 1;\n');
  write(source, `${contextRoot}/overview.md`, document('overview', { project_id: randomUUID(), name: 'Phase2 Mock' }));
  for (const id of ['combat', 'world', 'game-app', 'render']) write(source, `${contextRoot}/modules/${id}.md`, document('module', { id, name: id, paths: id === 'combat' ? ['src/combat.js', 'src/shared.js'] : id === 'world' ? ['src/world.js', 'src/shared.js'] : id === 'render' ? ['src/style.css'] : ['app/'], depends_on: id === 'game-app' ? ['combat'] : [], checked_files: {} }));
  write(source, contractPath, document('contract', { id: 'geometry', title: '共享几何契约 Mock', modules: ['world'], status: 'proposed', basis: { kind: 'agent-proposal', ref: '明确标记 Mock' } }, '共享几何约束：碰撞坐标使用同一世界坐标系；检查 combat/world 交叉用例。'));
  stampContext(source, 'combat', ['src/combat.js']); stampContext(source, 'world', ['src/world.js']);
  if (useGit) { await git(source, ['init', '-b', 'mock']); await git(source, ['add', '.']); await git(source, ['-c', 'user.name=Mock', '-c', 'user.email=mock@example.invalid', 'commit', '-m', 'Mock baseline']); }
  const config: Config = { allowedRepositories: [source], runtimeDir: path.join(directory, 'r'), projectMode: mode, executionMode: 'native', mode: 'mock', claudeExecutable: 'NEVER-PAID', timeoutMs: 30000, maxLoops: 3, maxReworks: 1, maxClaudeCalls: 8, tests: [{ executable: process.execPath, args: ['-e', 'console.log("Mock independent fixture check")'] }], mockScenario: 'pass', ...(mode === 'direct' ? { directAuthorization: { projectPath: source, acknowledgedAt: new Date().toISOString() } } : {}) };
  const store = await createRun(config, source, 'Phase2 Mock combat'); const state = store.load();
  state.tasks = [{ id: 'combat-change', moduleIds: ['combat'], instruction: 'Mock 修改 combat', acceptance: ['Mock 验证'] }]; state.phase = 'execute'; store.save(state); store.audit('plan', { tasks: state.tasks, humanDecision: null, label: '注入式 Mock 计划' });
  return { directory, source, config, store, workspace: state.workspace, state };
}
function passReview(state: State): Review {
  const report = state.evidence?.contextReport;
  return { verdict: 'pass', reason: 'Mock 合理扩展；已核对共享几何约束与内部行为', ...(report ? { contextReview: { expansionReason: 'Mock 跨模块共享几何修复，需要同时修改 combat/world', unmappedReason: 'Mock 新文件职责暂未建档，需要后续完善导航', checkedContracts: report.contracts.map(doc => doc.id), modules: report.affectedModules.map(module => ({ moduleId: module.moduleId, documentUpdated: module.documentUpdated, noUpdateReason: module.documentUpdated ? '' : 'Mock 内部值变化，职责和接口未变；核心哈希已明确核对', checkedFiles: module.checkedFiles, constraintsChanged: false, disposition: 'Mock 确认行为约束未变；哈希结果逐项处理' })) } } : {}) };
}
function pause(f: Awaited<ReturnType<typeof fixture>>) { const state = f.store.load(); state.phase = 'paused'; state.nextPhase = 'verify'; f.store.save(state); }

for (const mode of ['direct', 'isolated'] as const) for (const useGit of [false, true]) test(`Plan native world edit cannot disappear into combat Execute baseline in ${mode} Git=${useGit}`, async () => {
  const f = await fixture(mode, useGit), original = fs.readFileSync(path.join(f.workspace, 'src/world.js'), 'utf8');
  const state = f.store.load(); state.phase = 'planning'; state.nextPhase = 'planning'; state.tasks = []; f.store.save(state);
  let plans = 0, executions = 0, reviews = 0;
  const agents: Agents = { executionMode: 'native', plan: async state => {
    plans++; write(state.workspace, 'src/world.js', 'export const wall = 99; // Mock Plan native edit\n');
    if (useGit) { await git(state.workspace, ['add', '.']); await git(state.workspace, ['-c', 'user.name=Mock', '-c', 'user.email=mock@example.invalid', 'commit', '-m', 'Mock Plan world edit']); }
    return { tasks: [{ id: 'combat-only', moduleIds: ['combat'], instruction: 'Mock Execute 不修改 world', acceptance: ['Mock'] }], humanDecision: null };
  }, execute: async () => { executions++; return { mode: 'native', summary: 'Mock Execute 无 world 修改' }; }, review: async state => { reviews++; return passReview(state); } };
  const result = await drive(f.store, agents);
  assert.equal(result.phase, 'paused', result.reason); assert.match(result.reason, /规划.*src\/world\.js/);
  assert.equal(plans, 1); assert.equal(executions, 0); assert.equal(reviews, 0); assert.equal(fs.existsSync(f.store.file('context/task-0-baseline.json')), false);
  const finish = auditRecords(f.store.file('audit.jsonl')).find(event => event.event === 'agent-finish' && event.data.role === 'plan');
  assert.equal(finish!.data.changed, true); assert.match(finish!.data.diff, /src\/world\.js/);
  const planningCheck = auditRecords(f.store.file('audit.jsonl')).find(event => event.event === 'context-planning-change');
  assert.deepEqual(planningCheck!.data.paths, ['src/world.js']);
  const planningBaseline = fs.readFileSync(f.store.file('context/planning-baseline.json'), 'utf8');
  assert.equal(fs.readFileSync(path.join(f.workspace, 'src/world.js'), 'utf8').includes('99'), true);
  const resumed = await drive(f.store, agents, 'Mock 普通继续不能吞掉规划修改');
  assert.equal(resumed.phase, 'paused'); assert.match(resumed.reason, /src\/world\.js/); assert.equal(plans, 1); assert.equal(executions, 0);
  assert.equal(fs.readFileSync(f.store.file('context/planning-baseline.json'), 'utf8'), planningBaseline);
  if (mode === 'isolated') assert.equal(fs.readFileSync(path.join(f.source, 'src/world.js'), 'utf8'), original);
  // Restore only this disposable Mock edit; context-only planning updates remain permitted.
  write(f.workspace, 'src/world.js', original);
  const completed = await drive(f.store, { ...agents, plan: async state => {
    const file = path.join(state.workspace, `${contextRoot}/modules/world.md`); fs.appendFileSync(file, '\nMock 规划知识补充。\n');
    return { tasks: [{ id: 'combat-only', moduleIds: ['combat'], instruction: 'Mock Execute 不修改 world', acceptance: ['Mock'] }], humanDecision: null };
  } }, 'Mock 已恢复业务文件，续接规划');
  assert.ok(executions >= 1); assert.ok(reviews >= 1); assert.doesNotMatch(completed.reason, /规划期间业务文件修改/);
  if (!useGit) assert.equal(completed.phase, 'completed', completed.reason);
  else assert.ok(completed.evidence!.issues.includes('Git HEAD changed; commits and merges are forbidden'));
});

for (const mode of ['direct', 'isolated'] as const) for (const useGit of [false, true]) test(`scope snapshot catches added/modified/deleted/renamed/committed files in ${mode} Git=${useGit}`, async () => {
  const f = await fixture(mode, useGit); freezeTaskContext(f.state, f.store);
  write(f.workspace, 'src/combat.js', 'export const hit = 2;\n'); write(f.workspace, 'src/world.js', 'export const wall = 2;\n');
  write(f.workspace, 'unrelated.txt', 'unmapped'); fs.renameSync(path.join(f.workspace, 'src/shared.js'), path.join(f.workspace, 'shared-renamed.js'));
  if (useGit) { await git(f.workspace, ['add', '.']); await git(f.workspace, ['-c', 'user.name=Mock', '-c', 'user.email=mock@example.invalid', 'commit', '-m', 'Mock native commit']); }
  const report = checkTaskContext(f.state, f.store)!;
  assert.deepEqual(report.actualModules, ['combat', 'world']); assert.deepEqual(report.expandedModules, ['world']);
  assert.deepEqual(report.changes.find(entry => entry.path === 'src/shared.js')!.modules, ['combat', 'world']);
  assert.deepEqual(report.renames, [{ oldPath: 'src/shared.js', newPath: 'shared-renamed.js' }]); assert.equal(report.unmappedPaths.length, 2);
  assert.ok(report.findings.some(f => f.code === 'MODULE_HASH_MISMATCH' && f.origin === 'task'));
  if (mode === 'isolated') assert.equal(fs.readFileSync(path.join(f.source, 'src/world.js'), 'utf8'), 'export const wall = 1;\n');
});
test('game-app change stays in declared module; knowledge paths never hide expanded modules', async () => {
  const f = await fixture(); f.state.tasks[0]!.moduleIds = ['game-app']; f.store.save(f.state); freezeTaskContext(f.state, f.store);
  write(f.workspace, 'app/main.js', 'Mock'); let report = checkTaskContext(f.state, f.store)!; assert.deepEqual(report.expandedModules, []); assert.deepEqual(report.actualModules, ['game-app']);
  write(f.workspace, 'src/world.js', 'Mock changed world'); const module = path.join(f.workspace, `${contextRoot}/modules/world.md`); fs.writeFileSync(module, fs.readFileSync(module, 'utf8').replace('src/world.js', 'src/other.js').replace(/checked_files:[\s\S]*?---/, 'checked_files: {}\n---'));
  report = checkTaskContext(f.state, f.store)!; assert.ok(report.expandedModules.includes('world')); assert.equal(report.knowledgeChanges.length, 1); assert.ok(!report.unmappedPaths.some(item => item.path.startsWith(contextRoot)));
});
test('hash origins separate preexisting staleness, deletion and task mismatches; context-stamp restores consistency', async () => {
  const f = await fixture(); write(f.workspace, 'src/world.js', 'preexisting stale\n'); freezeTaskContext(f.state, f.store);
  write(f.workspace, 'src/combat.js', 'task stale\n'); let report = checkTaskContext(f.state, f.store)!;
  assert.ok(report.findings.some(f => f.moduleId === 'world' && f.code === 'MODULE_HASH_MISMATCH' && f.origin === 'preexisting'));
  assert.ok(report.findings.some(f => f.moduleId === 'combat' && f.code === 'MODULE_HASH_MISMATCH' && f.origin === 'task'));
  stampContext(f.workspace, 'world', ['src/world.js']); stampContext(f.workspace, 'combat', ['src/combat.js']); report = checkTaskContext(f.state, f.store)!;
  assert.equal(report.findings.filter(f => f.code === 'MODULE_HASH_MISMATCH').length, 0);
  fs.unlinkSync(path.join(f.workspace, 'src/combat.js')); report = checkTaskContext(f.state, f.store)!; assert.ok(report.findings.some(f => f.path === 'src/combat.js' && /文件不存在/.test(f.message)));
});
test('invalid changed module docs reach Review; pass cannot bypass validation', async () => {
  const f = await fixture(); let received = false;
  const agents: Agents = { executionMode: 'native', plan: async () => { throw Error('already planned'); }, execute: async state => { write(state.workspace, `${contextRoot}/modules/combat.md`, 'invalid'); return { mode: 'native', summary: 'Mock invalid doc' }; }, review: async state => { received = true; assert.ok(state.evidence!.contextReport!.findings.some(f => f.code === 'CONTEXT_INVALID')); return { verdict: 'human', reason: 'Mock 要求修复文档' }; } };
  const result = await drive(f.store, agents); assert.equal(result.phase, 'paused', result.reason); assert.ok(received);
  assert.ok(contextReviewProblems(result.evidence!.contextReport, { verdict: 'pass', reason: 'bad' }).length);
});
test('Mock Review receives full shared geometry contract; bare pass reworks, reasoned expansion passes', async () => {
  const f = await fixture(); let reviews = 0;
  const agents: Agents = { executionMode: 'native', plan: async () => { throw Error('already planned'); }, execute: async state => { write(state.workspace, 'src/combat.js', 'combat internal 2'); write(state.workspace, 'src/world.js', 'world internal 2'); return { mode: 'native', summary: 'Mock cross-module' }; }, review: async state => {
    const report = state.evidence!.contextReport!; assert.deepEqual(report.expandedModules, ['world']); assert.match(report.contracts[0]!.content, /同一世界坐标系/); assert.equal(report.contracts[0]!.status, 'proposed'); assert.ok(report.findings.some(f => f.code === 'MODULE_DOC_UNCHANGED'));
    return ++reviews === 1 ? { verdict: 'pass', reason: 'Mock 未处理证据，必须进入现有返工' } : passReview(state);
  } };
  const result = await drive(f.store, agents); assert.equal(result.phase, 'completed', result.reason); assert.equal(result.reworks, 0); assert.equal(result.totalReworks, 1); assert.equal(reviews, 2);
  fs.writeFileSync(path.join(f.directory, 'mock-cross-module-demo.json'), JSON.stringify({ label: 'Mock，不是真实 CC/Codex', result, audit: auditRecords(f.store.file('audit.jsonl')) }, null, 2));
});
test('actual RealAgents Review prompt contains full frozen/current contracts, without paid invocation', async () => {
  const f = await fixture(); freezeTaskContext(f.state, f.store); write(f.workspace, 'src/world.js', '2'); f.state.evidence = { diff: '', status: '', head: '', snapshotDigest: '', tests: [], passed: true, issues: [], executorExitCode: 0, contextReport: checkTaskContext(f.state, f.store) };
  const adapter = new RealAgents({ ...f.config, mode: 'real' }); let prompt = '';
  (adapter as any).claude = async (_state: State, _store: unknown, _signal: unknown, _schema: unknown, text: string) => { prompt = text; return { verdict: 'human', reason: 'Injected Mock transport' }; };
  await adapter.review(f.state, f.store, new AbortController().signal); const assembled = JSON.parse(prompt);
  assert.match(assembled.evidence.contextReport.contracts[0].content, /同一世界坐标系/); assert.match(assembled.contextInstruction, /contextReview/); assert.equal(assembled.evidence.contextReport.contracts[0].source, 'task-baseline');
});
test('internal non-core style may pass with explicit no-update explanation; interface changes cannot', async () => {
  const f = await fixture(); f.state.tasks[0]!.moduleIds = ['render']; f.store.save(f.state);
  const agents: Agents = { executionMode: 'native', plan: async () => { throw Error('planned'); }, execute: async state => { write(state.workspace, 'src/style.css', '.actor{opacity:0.9}\n'); return { mode: 'native', summary: 'Mock internal styling' }; }, review: async state => passReview(state) };
  const result = await drive(f.store, agents); assert.equal(result.phase, 'completed', result.reason);
  const invalidReview = passReview({ ...result, evidence: { ...result.evidence!, contextReport: { ...result.evidence!.contextReport!, affectedModules: [{ moduleId: 'render', documentPath: `${contextRoot}/modules/render.md`, documentUpdated: false, checkedFiles: [] }] } } });
  invalidReview.contextReview!.modules[0]!.constraintsChanged = true;
  assert.ok(contextReviewProblems(result.evidence!.contextReport, invalidReview).some(message => /约束发生变化/.test(message)));
});
test('Review native edits force fresh context report and independent acceptance', async () => {
  const f = await fixture(); let calls = 0;
  const agents: Agents = { executionMode: 'native', plan: async () => { throw Error('planned'); }, execute: async state => { write(state.workspace, 'src/combat.js', 'first'); return { mode: 'native', summary: 'Mock' }; }, review: async state => { if (++calls === 1) write(state.workspace, 'src/world.js', 'review changed'); else assert.deepEqual(state.evidence!.contextReport!.expandedModules, ['world']); return passReview(state); } };
  const result = await drive(f.store, agents); assert.equal(result.phase, 'completed', result.reason); assert.equal(calls, 2);
  const checks = auditRecords(f.store.file('audit.jsonl')).filter(e => e.event === 'independent-check'); assert.equal(checks.length, 2); assert.notEqual(checks[0].data.snapshotDigest, checks[1].data.snapshotDigest);
});
test('formal Mock human-decision accepts exact content; isolated source and Delivery remain separate', async () => {
  const f = await fixture(); pause(f); const sourceDigest = readProject(f.source).digest;
  const request = prepareContextConfirmation(f.store, contractPath, 'accepted');
  decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock 正式接受具体共享几何契约');
  const context = loadProjectContext(f.workspace, true, { runtimeDir: f.config.runtimeDir, source: f.source }), doc = context.contracts[0]!;
  assert.equal(doc.metadata.status, 'accepted'); assert.equal(doc.trust!.verified, true); assert.equal(confirmationDigest(doc), request.digest);
  assert.equal(readProject(f.source).digest, sourceDigest); assert.equal(loadProjectContext(f.source).contracts[0]!.metadata.status, 'proposed'); assert.equal(pendingContextConfirmations(f.store).length, 0);
  assert.equal(fs.existsSync(f.store.file('deliveries')), false);
  const records = auditRecords(f.store.file('audit.jsonl')); assert.equal(records.filter(e => e.event === 'human-decision').length, 1); assert.equal(records.at(-1)!.event, 'context-confirmation-applied');
  fs.writeFileSync(path.join(f.directory, 'mock-confirmation-demo.json'), JSON.stringify({ label: 'Mock 正式 API 证据，不是真实用户批准真实项目', request, context, records }, null, 2));
});
test('ordinary resume/chat and Delivery approval never accept proposed contracts', async () => {
  const f = await fixture(); pause(f); const request = prepareContextConfirmation(f.store, contractPath, 'accepted');
  const result = await drive(f.store, { executionMode: 'native', plan: async () => { throw Error('no agent call'); }, execute: async () => { throw Error('no agent call'); }, review: async () => { throw Error('no agent call'); } }, '好，继续，通过');
  assert.equal(result.phase, 'paused'); assert.match(result.reason, /正式文档决策入口/); assert.equal(loadProjectContext(f.workspace).contracts[0]!.metadata.status, 'proposed');
  decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock 取消待确认', true);
  const state = f.store.load(); state.nextPhase = 'execute'; f.store.save(state);
  const completed = await drive(f.store, { executionMode: 'native', plan: async () => { throw Error('已注入 Mock 计划'); }, execute: async state => { write(state.workspace, 'src/combat.js', 'delivery change'); return { mode: 'native', summary: 'Mock 正式验收候选' }; }, review: async state => passReview(state) }, 'Mock 取消契约确认后恢复正常执行');
  assert.equal(completed.phase, 'completed', completed.reason);
  const preview = await previewDelivery(f.store, f.source, 'project-files'); await approveDelivery(f.store, preview.id, preview.digest, 'Mock 仅批准交付');
  assert.equal(loadProjectContext(f.workspace).contracts[0]!.metadata.status, 'proposed'); assert.equal(loadProjectContext(f.source).contracts[0]!.metadata.status, 'proposed');
});
for (const tamper of ['body', 'project', 'document', 'basis', 'missing-audit', 'corrupt-audit', 'source']) test(`accepted confirmation rejects ${tamper} reuse/tampering`, async () => {
  const f = await fixture(); pause(f); const request = prepareContextConfirmation(f.store, contractPath, 'accepted'); decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock exact');
  if (tamper === 'body') { const file = path.join(f.workspace, contractPath); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('同一世界坐标系', '任意坐标系')); }
  if (tamper === 'project') { const file = path.join(f.workspace, `${contextRoot}/overview.md`); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(request.projectId, randomUUID())); }
  if (tamper === 'document') { const file = path.join(f.workspace, contractPath); write(f.workspace, `${contextRoot}/contracts/copy.md`, fs.readFileSync(file, 'utf8').replace('id: geometry', 'id: copy')); }
  if (tamper === 'basis') { const file = path.join(f.workspace, contractPath); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/human-decision:[^\s]+/, 'human-decision:fake')); }
  if (tamper === 'missing-audit') fs.renameSync(f.store.file('audit.jsonl'), f.store.file('preserved-audit.jsonl'));
  if (tamper === 'corrupt-audit') fs.appendFileSync(f.store.file('audit.jsonl'), '{"hash":"fake"}\n');
  const source = tamper === 'source' ? root : f.source;
  const context = loadProjectContext(f.workspace, true, { runtimeDir: f.config.runtimeDir, source });
  assert.ok(context.contracts.some(doc => doc.trust?.effectiveStatus === 'unverifiable')); assert.ok(context.contracts.some(doc => !doc.trust?.verified));
});
test('stale pending digest rejected; cancel preserves audit; reject and accepted successor supersede with provenance', async () => {
  const f = await fixture(); pause(f); let request = prepareContextConfirmation(f.store, contractPath, 'accepted');
  const file = path.join(f.workspace, contractPath), original = fs.readFileSync(file, 'utf8'); fs.writeFileSync(file, original.replace('同一世界坐标系', '不同坐标系'));
  assert.throws(() => decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock stale'), /内容已变化/);
  decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock 取消旧摘要', true); fs.writeFileSync(file, original);
  request = prepareContextConfirmation(f.store, contractPath, 'rejected'); decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock 正式拒绝');
  let context = loadProjectContext(f.workspace, true, { runtimeDir: f.config.runtimeDir, source: f.source }); assert.equal(context.contracts[0]!.trust!.effectiveStatus, 'rejected');
  const newPath = `${contextRoot}/contracts/geometry2.md`; write(f.workspace, newPath, document('contract', { id: 'geometry2', title: 'Mock 替代版本', modules: ['world'], status: 'proposed', supersedes: 'geometry', basis: { kind: 'agent-proposal', ref: 'Mock 替代来源' } }));
  request = prepareContextConfirmation(f.store, newPath, 'accepted'); decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock 接受替代方案');
  // A rejected proposal remains historical rejected. Supersede an accepted version separately.
  const decisionPath = `${contextRoot}/decisions/design.md`; write(f.workspace, decisionPath, document('decision', { id: 'design', title: 'Mock 设计', modules: ['world'], status: 'proposed', basis: { kind: 'agent-proposal', ref: 'Mock' } }));
  request = prepareContextConfirmation(f.store, decisionPath, 'accepted'); decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock 接受设计');
  write(f.workspace, `${contextRoot}/decisions/design2.md`, document('decision', { id: 'design2', title: 'Mock 新设计', modules: ['world'], status: 'proposed', supersedes: 'design', basis: { kind: 'agent-proposal', ref: 'Mock' } }));
  request = prepareContextConfirmation(f.store, `${contextRoot}/decisions/design2.md`, 'accepted'); decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock 正式替代');
  request = prepareContextConfirmation(f.store, decisionPath, 'superseded'); decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock 批准旧设计标记替代');
  context = loadProjectContext(f.workspace, true, { runtimeDir: f.config.runtimeDir, source: f.source }); assert.equal(context.decisions.find(doc => doc.metadata.id === 'design')!.trust!.effectiveStatus, 'superseded'); assert.equal(context.decisions.find(doc => doc.metadata.id === 'design2')!.metadata.supersedes, 'design');
  assert.ok(auditRecords(f.store.file('audit.jsonl')).some(e => e.event === 'context-confirmation-cancelled'));
  const replacementFile = path.join(f.workspace, `${contextRoot}/decisions/design2.md`); fs.writeFileSync(replacementFile, fs.readFileSync(replacementFile, 'utf8').replace('明确标记', '篡改后的'));
  context = loadProjectContext(f.workspace, true, { runtimeDir: f.config.runtimeDir, source: f.source }); assert.equal(context.decisions.find(doc => doc.metadata.id === 'design')!.trust!.effectiveStatus, 'unverifiable');
});
test('frozen accepted original remains in Review when current proposal changes rules; unavailable runtime explicit', async () => {
  const f = await fixture(); pause(f); const request = prepareContextConfirmation(f.store, contractPath, 'accepted'); decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock original');
  f.state = f.store.load(); f.state.phase = 'execute'; f.store.save(f.state); freezeTaskContext(f.state, f.store);
  const file = path.join(f.workspace, contractPath); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('status: accepted', 'status: proposed').replace('同一世界坐标系', '新的坐标系'));
  write(f.workspace, 'src/world.js', 'changed'); const report = checkTaskContext(f.state, f.store)!;
  assert.equal(report.contracts.length, 2); assert.equal(report.contracts[0]!.status, 'accepted'); assert.match(report.contracts[0]!.content, /同一世界坐标系/); assert.equal(report.contracts[1]!.status, 'proposed');
  assert.equal(loadProjectContext(f.workspace).contracts[0]!.trust!.effectiveStatus, 'proposed');
});
test('formal Review human request, direct rejection response, resume and original budgets remain intact', async () => {
  const f = await fixture(); let reviews = 0;
  const agents: Agents = { executionMode: 'native', plan: async () => { throw Error('planned'); }, execute: async state => { write(state.workspace, 'src/combat.js', 'Mock change'); return { mode: 'native', summary: 'Mock' }; }, review: async state => ++reviews === 1 ? { verdict: 'human', reason: 'Mock 正式确认提议', contextConfirmations: [{ relative: contractPath, action: 'accepted' }] } : passReview(state) };
  let result = await drive(f.store, agents); assert.equal(result.phase, 'paused', result.reason);
  const request = pendingContextConfirmations(f.store)[0]!; decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock 用户正式拒绝提议', false, 'rejected');
  const doc = loadProjectContext(f.workspace, true, { runtimeDir: f.config.runtimeDir, source: f.source }).contracts[0]!; assert.equal(doc.trust!.effectiveStatus, 'rejected');
  result = await drive(f.store, agents, 'Mock 文档已正式处理，恢复独立验收'); assert.equal(result.phase, 'completed', result.reason); assert.equal(result.loops, 1); assert.equal(result.claudeCalls, 0); assert.equal(result.config.maxLoops, f.config.maxLoops);
});
test('confirmation crash after human event resumes deterministic update, without duplicate event or Agent', async () => {
  const f = await fixture(); pause(f); const request = prepareContextConfirmation(f.store, contractPath, 'accepted');
  // Explicit injected crash boundary: simulate durable formal event before the program's status update.
  f.store.audit('human-decision', { kind: 'project-context-confirmation', requestId: request.id, requestHash: request.requestHash, projectId: request.projectId, source: request.source, workspace: request.workspace, documentId: request.documentId, documentKind: request.documentKind, relative: request.relative, action: request.action, digest: request.digest, decision: 'Mock 注入的正式入口中断边界' });
  assert.throws(() => decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock 不得取消已落盘决策', true), /决策已落盘/);
  decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock 恢复同一请求');
  assert.equal(auditRecords(f.store.file('audit.jsonl')).filter(event => event.event === 'human-decision').length, 1);
  assert.equal(loadProjectContext(f.workspace, true, { runtimeDir: f.config.runtimeDir, source: f.source }).contracts[0]!.trust!.verified, true);
  assert.throws(() => decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock 重复'), /已处理/);
});
test('code mismatch remains visible when Agent removes checked_files; accepted cannot be hand-written', async () => {
  const f = await fixture(); freezeTaskContext(f.state, f.store); write(f.workspace, 'src/combat.js', 'Mock changed');
  const file = path.join(f.workspace, `${contextRoot}/modules/combat.md`); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/checked_files:[\s\S]*?---/, 'checked_files: {}\n---'));
  let report = checkTaskContext(f.state, f.store)!; assert.ok(report.findings.some(item => item.code === 'MODULE_HASH_MISMATCH' && item.moduleId === 'combat')); assert.ok(report.affectedModules.find(module => module.moduleId === 'combat')!.checkedFiles.includes('src/combat.js'));
  const contract = path.join(f.workspace, contractPath); fs.writeFileSync(contract, fs.readFileSync(contract, 'utf8').replace('status: proposed', 'status: accepted')); report = checkTaskContext(f.state, f.store)!;
  assert.ok(report.findings.some(item => item.code === 'CONFIRMATION_UNVERIFIABLE')); assert.ok(contextReviewProblems(report, { verdict: 'pass', reason: 'forged' }).length);
});
test('one-hop and reverse declaration selection includes associated contracts without recursive expansion', async () => {
  const f = await fixture(); write(f.workspace, `${contextRoot}/contracts/game-link.md`, document('contract', { id: 'game-link', title: 'Mock 反向关联', modules: ['game-app'], status: 'proposed', basis: { kind: 'agent-proposal', ref: 'Mock' } }));
  freezeTaskContext(f.state, f.store); write(f.workspace, 'src/combat.js', 'Mock change'); const report = checkTaskContext(f.state, f.store)!;
  assert.ok(report.relatedModules.some(module => module.moduleId === 'game-app')); assert.ok(report.contracts.some(contract => contract.id === 'game-link'));
});
test('preexisting unverifiable confirmation requires explicit boundary note and is never accepted evidence', async () => {
  const f = await fixture(); const file = path.join(f.workspace, contractPath); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('status: proposed', 'status: accepted'));
  freezeTaskContext(f.state, f.store); write(f.workspace, 'src/world.js', 'Mock internal change'); const report = checkTaskContext(f.state, f.store)!;
  assert.ok(report.findings.some(item => item.code === 'CONFIRMATION_UNVERIFIABLE' && item.origin === 'preexisting')); assert.equal(report.contracts[0]!.status, 'unverifiable');
  const review = passReview({ ...f.state, evidence: { diff: '', status: '', head: '', snapshotDigest: '', tests: [], executorExitCode: 0, issues: [], passed: true, contextReport: report } });
  assert.ok(contextReviewProblems(report, review).length);
  review.contextReview!.confirmationNotes = [{ path: contractPath, reason: 'Mock 旧审计无法访问，本轮未将其当作 accepted；仅内部值变化，设计变更必须正式重新确认' }];
  assert.deepEqual(contextReviewProblems(report, review), []);
  const second = checkTaskContext(f.state, f.store)!; assert.notEqual(second.reportPath, report.reportPath); assert.equal(second.snapshot, report.snapshot);
});
test('formal confirmation API refuses Agent execution/review phases and active run lock', async () => {
  const f = await fixture(); pause(f); const request = prepareContextConfirmation(f.store, contractPath, 'accepted');
  for (const phase of ['executing', 'review'] as const) { const state = f.store.load(); state.phase = phase; f.store.save(state); assert.throws(() => decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock Agent 不得确认'), /暂停 Run/); }
  pause(f); const unlock = f.store.lock(); try { assert.throws(() => decideContextConfirmation(f.store, request.id, request.requestHash, 'Mock Agent 不得抢锁'), /already locked/); } finally { unlock(); }
  assert.equal(loadProjectContext(f.workspace).contracts[0]!.metadata.status, 'proposed');
});
test('Review human with native code change rechecks scope, docs and independent tests before pause', async () => {
  const f = await fixture(); const agents: Agents = { executionMode: 'native', plan: async () => { throw Error('planned'); }, execute: async state => { write(state.workspace, 'src/combat.js', 'Mock code'); return { mode: 'native', summary: 'Mock' }; }, review: async state => { write(state.workspace, 'src/world.js', 'Mock native review change'); return { verdict: 'human', reason: 'Mock 需要用户确认', contextConfirmations: [{ relative: contractPath, action: 'accepted' }] }; } };
  const result = await drive(f.store, agents); assert.equal(result.phase, 'paused', result.reason); assert.deepEqual(result.evidence!.contextReport!.expandedModules, ['world']);
  const checks = auditRecords(f.store.file('audit.jsonl')).filter(event => event.event === 'independent-check'); assert.equal(checks.length, 2); assert.notEqual(checks[0].data.snapshotDigest, checks[1].data.snapshotDigest); assert.equal(pendingContextConfirmations(f.store).length, 1);
});
test('confirmation serialization limits are checked before request or human consent is recorded', async () => {
  const f = await fixture(); pause(f); const file = path.join(f.workspace, contractPath), original = fs.readFileSync(file, 'utf8');
  const lines = original.trimEnd().split('\n').length; fs.writeFileSync(file, original + '\n'.repeat(80 - lines));
  loadProjectContext(f.workspace, true); const before = auditRecords(f.store.file('audit.jsonl')).length;
  assert.throws(() => prepareContextConfirmation(f.store, contractPath, 'accepted'), /80 行/); assert.equal(auditRecords(f.store.file('audit.jsonl')).length, before); assert.equal(pendingContextConfirmations(f.store).length, 0);
});
