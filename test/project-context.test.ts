import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stringify } from 'yaml';
import { contextHash, contextRoot, loadProjectContext, parseContextDocument, stampContext } from '../src/project-context.js';
import { callContext, matchesContextTerm } from '../src/context-navigation.js';
import { createHistoricalRun as createRun } from './helpers/historical-run.js';
import { driveWithUserAcceptance as drive } from './helpers/accepted-flow.js';
import { MockAgents, type Agents } from '../src/adapters.js';
import { RealAgents } from '../src/real-agents.js';
import { approveDelivery, applyDelivery, previewDelivery, deliveryStatus } from '../src/delivery.js';
import { readProject } from '../src/project-files.js';
import { reviewEvidence } from '../src/incremental.js';
import { runProcess } from '../src/process.js';
import { git } from '../src/workspace.js';
import type { Config, Task } from '../src/schema.js';

const root = path.resolve('.validation', `pc-${randomUUID().slice(0, 8)}`), cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
fs.mkdirSync(root, { recursive: true });
test('module terms match whole Unicode words, case and hyphenated IDs without guesses', () => {
  for (const [search, term] of [['AI logic', 'ai'], ['优化 game-app HUD', 'game-app'], ['修订 核心 模块', '核心'], ['Game-App', 'game-app']]) assert.equal(matchesContextTerm(search!, term!), true);
  for (const [search, term] of [['main paint', 'ai'], ['game-application', 'game-app'], ['新核心系统', '核心'], ['核心模块', '核心'], ['chair', 'ai'], ['src/ai-helper.js', 'ai']]) assert.equal(matchesContextTerm(search!, term!), false);
});
const headings = { overview: ['项目目标', '范围', '非目标', '总体结构'], module: ['职责', '边界', '入口与测试'], contract: ['约束', '检查方式'], decision: ['决定', '原因', '未采用方案'] };
function document(kind: keyof typeof headings, metadata: object, body = '仅含简短说明。') { return `---\n${stringify({ schema: 1, kind, ...metadata })}---\n${headings[kind].map(title => `## ${title}\n${body}\n`).join('')}`; }
function write(workspace: string, relative: string, content: string) { const file = path.join(workspace, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; }
function docs(workspace: string, modules = ['core']) {
  write(workspace, `${contextRoot}/overview.md`, document('overview', { project_id: randomUUID(), name: '确定性夹具项目' }));
  for (const id of modules) write(workspace, `${contextRoot}/modules/${id}.md`, document('module', { id, name: `模块 ${id}`, paths: [`src/${id}/`], depends_on: [], checked_files: {} }));
}
function proposals(workspace: string) {
  write(workspace, `${contextRoot}/contracts/api.md`, document('contract', { id: 'api', title: '待确认契约', modules: ['core'], status: 'proposed', basis: [{ kind: 'code', ref: 'src/core/main.ts' }] }));
  write(workspace, `${contextRoot}/decisions/choice.md`, document('decision', { id: 'choice', title: '待确认决策', modules: ['core'], status: 'proposed', basis: { kind: 'document', ref: 'README.md' } }));
}
async function fixture(withContext = true, overrides: Partial<Config> = {}) {
  const directory = path.join(root, randomUUID().slice(0, 8)), source = path.join(directory, 'source'); fs.mkdirSync(source, { recursive: true });
  write(source, 'src/core/main.ts', 'SOURCE_SENTINEL_NEVER_INJECTED\n'); write(source, 'README.md', '# 原有资料\n');
  if (withContext) { docs(source); proposals(source); }
  const config: Config = { allowedRepositories: [source], runtimeDir: path.join(directory, 'runtime'), projectMode: 'isolated', executionMode: 'native', mode: 'real', claudeExecutable: 'NEVER-PAID', timeoutMs: 30000, maxLoops: 3, maxReworks: 1, maxClaudeCalls: 6, tests: [{ executable: process.execPath, args: [cli, 'context-check', '--workspace', '.'] }], mockScenario: 'pass', ...overrides };
  const store = await createRun(config, source, '核对 core 模块');
  return { directory, source, config, store, workspace: store.load().workspace };
}

test('four document kinds retain proposed; unconfirmed terminal states remain unverifiable', async () => {
  const f = await fixture(), context = loadProjectContext(f.workspace, true);
  assert.equal(context.overview!.metadata.name, '确定性夹具项目'); assert.equal(context.modules[0]!.metadata.id, 'core');
  assert.equal(context.contracts[0]!.metadata.status, 'proposed'); assert.equal(context.decisions[0]!.metadata.status, 'proposed');
  assert.equal(fs.existsSync(path.join(f.workspace, contextRoot, 'approvals')), false);
  for (const kind of ['contract', 'decision'] as const) {
    const relative = `${contextRoot}/${kind}s/${kind === 'contract' ? 'api' : 'choice'}.md`, file = path.join(f.workspace, relative), original = fs.readFileSync(file, 'utf8');
    for (const status of ['accepted', 'rejected', 'superseded']) { fs.writeFileSync(file, original.replace('status: proposed', `status: ${status}`)); const forged = loadProjectContext(f.workspace)[kind === 'contract' ? 'contracts' : 'decisions'][0]!; assert.equal(forged.trust?.verified, false); assert.equal(forged.trust?.effectiveStatus, 'unverifiable'); }
    fs.writeFileSync(file, original);
  }
});
test('parser rejects invalid fields, duplicate YAML keys and IDs, unsafe paths, references and line limits', async () => {
  const f = await fixture(), relative = `${contextRoot}/modules/core.md`, file = path.join(f.workspace, relative), original = fs.readFileSync(file, 'utf8');
  const variants = [original.replace('schema: 1', 'schema: "1"'), original.replace('name: 模块 core', ''), original.replace('depends_on: []', 'depends_on: [missing]'), original.replace('src/core/', '../escape/'), original.replace('src/core/', 'src/*.ts'), original.replace('checked_files: {}', 'checked_files: {"src/core/main.ts": wrong}'), original.replace('checked_files: {}', 'checked_files: {"other.ts": "' + 'a'.repeat(64) + '"}'), original.replace('schema: 1', 'schema: 1\nschema: 1'), original.replace('## 边界', '## 错误章节'), original + '\n'.repeat(101), original + '中'.repeat(301), original.replace('checked_files: {}', 'checked_files: &checked {}\nstatus: *checked')];
  for (const variant of variants) { fs.writeFileSync(file, variant); assert.throws(() => loadProjectContext(f.workspace), /Project Context 文档错误/); }
  fs.writeFileSync(file, original);
  const contract = path.join(f.workspace, contextRoot, 'contracts/api.md'), contractOriginal = fs.readFileSync(contract, 'utf8');
  fs.writeFileSync(contract, contractOriginal.replace('src/core/main.ts', 'src/nonexistent.ts')); assert.throws(() => loadProjectContext(f.workspace), /依据文件不存在/);
  fs.writeFileSync(contract, contractOriginal.replace('- core', '- missing')); assert.throws(() => loadProjectContext(f.workspace), /关联模块不存在/);
  fs.writeFileSync(contract, contractOriginal.replace('id: api', 'id: core')); fs.renameSync(contract, path.join(f.workspace, contextRoot, 'contracts/core.md')); assert.throws(() => loadProjectContext(f.workspace), /重复 ID/);
  fs.renameSync(path.join(f.workspace, contextRoot, 'contracts/core.md'), contract); fs.writeFileSync(contract, contractOriginal);
  const overview = path.join(f.workspace, contextRoot, 'overview.md'), overviewOriginal = fs.readFileSync(overview, 'utf8');
  fs.writeFileSync(overview, overviewOriginal + '\n'.repeat(61)); assert.throws(() => loadProjectContext(f.workspace), /60 行/);
  fs.writeFileSync(overview, overviewOriginal); fs.writeFileSync(contract, contractOriginal + '\n'.repeat(81)); assert.throws(() => loadProjectContext(f.workspace), /80 行/);
});
test('checked_files max 20, directory prefix membership and stale hashes are format checks only', async () => {
  const f = await fixture(), relative = `${contextRoot}/modules/core.md`;
  const metadata = { id: 'core', name: '核心', paths: ['src/core/'], depends_on: [], checked_files: Object.fromEntries(Array.from({ length: 20 }, (_, n) => [`src/core/${n}.ts`, 'a'.repeat(64)])) };
  write(f.workspace, relative, document('module', metadata)); assert.equal(Object.keys(loadProjectContext(f.workspace).modules[0]!.metadata.checked_files).length, 20);
  metadata.checked_files['src/core/extra.ts'] = 'b'.repeat(64); write(f.workspace, relative, document('module', metadata)); assert.throws(() => loadProjectContext(f.workspace), /模块字段/);
});
test('context-stamp hashes actual bytes and preserves other metadata/body; failure never partly updates', async () => {
  const f = await fixture(), file = path.join(f.workspace, contextRoot, 'modules/core.md');
  const content = '\uFEFF' + fs.readFileSync(file, 'utf8').replace('name: 模块 core', 'name: "模块 core" # 保留原始引号与注释').replace(/\n/g, '\r\n'); fs.writeFileSync(file, content);
  const result = stampContext(f.workspace, 'core', ['src/core/main.ts']);
  assert.equal(result.files['src/core/main.ts'], contextHash(fs.readFileSync(path.join(f.workspace, 'src/core/main.ts'))));
  const after = fs.readFileSync(file, 'utf8'); assert.match(after, /name: "模块 core" # 保留原始引号与注释\r\n/);
  assert.equal(after.startsWith('\uFEFF---\r\n'), true);
  assert.equal(after.slice(after.indexOf('## 职责')), content.slice(content.indexOf('## 职责')));
  assert.equal(loadProjectContext(f.workspace).modules[0]!.metadata.checked_files['src/core/main.ts'], result.files['src/core/main.ts']);
  for (const files of [['src/core/main.ts', 'src/core/missing.ts'], ['README.md'], ['../escape'], ['src/core/main.ts', 'src/core/main.ts']]) {
    assert.throws(() => stampContext(f.workspace, 'core', files)); assert.equal(fs.readFileSync(file, 'utf8'), after);
  }
  assert.throws(() => stampContext(f.workspace, 'missing', ['src/core/main.ts']));
  assert.equal(loadProjectContext(f.workspace).contracts[0]!.metadata.status, 'proposed');
});
test('stamp refuses linked files and oversized stamped documents without replacement', async () => {
  const f = await fixture(), file = path.join(f.workspace, contextRoot, 'modules/core.md');
  fs.linkSync(path.join(f.workspace, 'src/core/main.ts'), path.join(f.workspace, 'src/core/link.ts'));
  const before = fs.readFileSync(file, 'utf8'); assert.throws(() => stampContext(f.workspace, 'core', ['src/core/link.ts']), /普通文档文件|hardlink/); assert.equal(fs.readFileSync(file, 'utf8'), before);
  fs.unlinkSync(path.join(f.workspace, 'src/core/link.ts'));
  const metadata = { id: 'core', name: '核心', paths: ['src/core/'], depends_on: [], checked_files: {} };
  const short = document('module', metadata); write(f.workspace, `${contextRoot}/modules/core.md`, short + '\n'.repeat(100 - short.trimEnd().split('\n').length));
  loadProjectContext(f.workspace, true);
  const beforeLarge = fs.readFileSync(file, 'utf8'); assert.throws(() => stampContext(f.workspace, 'core', ['src/core/main.ts']), /行数/); assert.equal(fs.readFileSync(file, 'utf8'), beforeLarge);
});
test('context CLI has standalone validation/stamp, repeated files, proper exits and no --config requirement', async () => {
  const f = await fixture(); write(f.workspace, 'src/core/second.ts', 'second\n');
  const result = spawnSync(process.execPath, [cli, 'context-stamp', '--workspace', f.workspace, '--module', 'core', '--file', 'src/core/main.ts', '--file', 'src/core/second.ts'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.equal(Object.keys(JSON.parse(result.stdout).files).length, 2);
  assert.equal(spawnSync(process.execPath, [cli, 'context-check', '--workspace', f.workspace]).status, 0);
  assert.equal(spawnSync(process.execPath, [cli, 'context-stamp', '--workspace', f.workspace, '--module', 'core', '--file', 'README.md']).status, 1);
});
test('valid overview alone enables navigation, missing stays legacy, corrupted never downgrades', async () => {
  const f = await fixture(false), state = f.store.load();
  assert.equal(await callContext(state, f.store, 'plan', new AbortController().signal), undefined);
  write(f.workspace, `${contextRoot}/overview.md`, document('overview', { project_id: state.id, name: '仅总览' }));
  assert.equal((await callContext(state, f.store, 'plan', new AbortController().signal))!.enabled, true);
  assert.equal(f.store.load().projectContextEnabled, true);
  fs.unlinkSync(path.join(f.workspace, contextRoot, 'overview.md'));
  await assert.rejects(callContext(f.store.load(), f.store, 'execute', new AbortController().signal), /不得降级/);
  write(f.workspace, `${contextRoot}/overview.md`, 'corrupt'); await assert.rejects(callContext(f.store.load(), f.store, 'review', new AbortController().signal), /frontmatter/);
});
test('project identity persists in overview across onboarding Runs, sessions, restarts and copied workspaces', async () => {
  const f = await fixture(false, { mode: 'mock' });
  const first = await createRun(f.config, f.source, '首次本地建档', { purpose: 'context-onboarding' });
  assert.equal((await callContext(first.load(), first, 'plan', new AbortController().signal))!.projectId, first.id);
  assert.equal((await drive(first, new MockAgents(first.load().config))).phase, 'completed');
  const preview = await previewDelivery(first, f.source, 'project-files');
  await approveDelivery(first, preview.id, preview.digest, '仅批准新建本地身份回归夹具');
  await applyDelivery(first, preview.id);
  const identity = loadProjectContext(f.source, true).overview!.metadata.project_id;
  // A real source change gives re-onboarding a deliverable hash update; an identical Mock output correctly pauses as no changes.
  write(f.source, 'src/core/main.ts', '// 同一项目后续源码更新\n');
  const second = await createRun(f.config, f.source, '同一项目重新建档', { purpose: 'context-onboarding' });
  assert.notEqual(second.id, first.id);
  const state = second.load(); state.claudeSessionId = randomUUID(); state.codexThreadId = randomUUID(); second.save(state);
  assert.equal((await callContext(state, second, 'plan', new AbortController().signal))!.projectId, identity);
  assert.equal((await drive(second, new MockAgents(state.config))).phase, 'completed');
  assert.equal(loadProjectContext(second.load().workspace, true).overview!.metadata.project_id, identity);
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import {loadProjectContext} from ${JSON.stringify(new URL('../src/project-context.js', import.meta.url).href)}; console.log(loadProjectContext(process.argv[1],true).overview.metadata.project_id)`, second.load().workspace], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr); assert.equal(child.stdout.trim(), identity);
  const copy = path.join(f.directory, 'copy'); fs.cpSync(f.source, copy, { recursive: true });
  const copied = await createRun({ ...f.config, allowedRepositories: [copy] }, copy, '复制工作区', { purpose: 'context-onboarding' });
  const navigation = await callContext(copied.load(), copied, 'plan', new AbortController().signal);
  assert.equal(navigation!.projectId, identity); assert.equal(navigation!.workspace, copied.load().workspace);
  assert.notEqual(copied.load().workspace, second.load().workspace);
  const other = await fixture(true, { mode: 'mock' });
  const otherNavigation = await callContext(other.store.load(), other.store, 'plan', new AbortController().signal);
  assert.notEqual(otherNavigation!.projectId, identity); assert.equal(otherNavigation!.workspace, other.workspace);
});
test('real Plan/Execute/Review assembly and resume/proposal retain evidence and tools without source packages', async () => {
  const f = await fixture(), state = f.store.load(), prompts: { role: string; prompt: any; options: any; args: string[] }[] = [];
  const task: Task = { id: 'work', instruction: '核对 src/core/main.ts', acceptance: ['核对差异和独立测试'], moduleIds: ['core'] }; state.tasks = [task]; state.loops = 1; state.codexThreadId = 'existing-codex'; state.claudeSessionId = randomUUID();
  state.evidence = { diff: '\nFILE src/core/main.ts\n+REVIEW_DIFF_SENTINEL\n', taskDiff: 'TASK_DIFF_SENTINEL', roundDiff: 'ROUND_DIFF_SENTINEL', head: 'fixture', status: 'M src/core/main.ts', snapshotDigest: 'snapshot', executorExitCode: 7, passed: false, issues: ['SAFETY_SENTINEL'], tests: [{ exitCode: 9, stdout: 'TEST_STDOUT_SENTINEL', stderr: 'TEST_STDERR_SENTINEL' }] }; f.store.save(state);
  const fake: typeof runProcess = async (_exe, args, options) => {
    if (args[0]?.endsWith('codex-worker.js')) { const request = JSON.parse(options.input!); assert.equal(request.threadId, 'existing-codex'); assert.equal(request.workspace, f.workspace); prompts.push({ role: 'execute', prompt: JSON.parse(request.prompt), args, options }); options.onLine!(JSON.stringify({ type: 'result', data: request.executionMode === 'proposal' ? { summary: '本地提案夹具', changes: [] } : { mode: 'native', summary: '本地原生夹具' } })); }
    else { const schema = JSON.parse(args[args.indexOf('--json-schema') + 1]!); const role = schema.properties.verdict ? 'review' : 'plan'; prompts.push({ role, prompt: JSON.parse(options.input!), args, options }); assert.equal(args.includes('--resume'), true); assert.equal(args.includes('--model'), false); assert.equal(args.includes('--tools'), false); assert.equal(options.cwd, f.workspace); options.onLine!(JSON.stringify({ type: 'result', structured_output: role === 'plan' ? { tasks: [task], humanDecision: null } : { verdict: 'rework', reason: '保持失败证据' } })); }
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const real = new RealAgents(f.config, fake), signal = new AbortController().signal;
  await real.plan(state, f.store, signal); await real.execute(state, f.store, signal); await real.review(state, f.store, signal);
  await new RealAgents({ ...f.config, executionMode: 'proposal' }, fake).execute(state, f.store, signal);
  for (const { prompt } of prompts) {
    assert.equal('repository' in prompt, false); assert.equal(JSON.stringify(prompt).includes('SOURCE_SENTINEL_NEVER_INJECTED'), false);
    assert.deepEqual(prompt.context.moduleIds, ['core']); assert.equal(prompt.context.moduleDocumentPaths[0], path.join(f.workspace, contextRoot, 'modules/core.md'));
    assert.equal(prompt.context.contractDocumentPaths[0], path.join(f.workspace, contextRoot, 'contracts/api.md')); assert.equal(prompt.context.decisionDocumentPaths[0], path.join(f.workspace, contextRoot, 'decisions/choice.md')); assert.match(prompt.context.proposalStatus, /proposed/);
    assert.ok(Buffer.byteLength(JSON.stringify(prompt.context)) <= 24 * 1024);
    const manifest = JSON.parse(fs.readFileSync(prompt.context.manifestPath, 'utf8')); assert.equal(manifest.targetWorkspace, f.workspace); assert.equal(manifest.prompt.hash, contextHash(JSON.stringify(prompt))); assert.ok(manifest.attached.every((entry: any) => entry.hash.length === 64 && entry.bytes >= 0));
  }
  const review = prompts.find(p => p.role === 'review')!.prompt;
  assert.deepEqual(review.evidence, reviewEvidence(state.evidence)); assert.deepEqual(review.evidence.tests, state.evidence.tests); assert.deepEqual(review.evidence.issues, ['SAFETY_SENTINEL']); assert.equal(review.evidence.executorExitCode, 7);
  const receipts = fs.readdirSync(f.store.file('context'));
  assert.equal(receipts.filter(name => name.endsWith('.manifest.json')).length, 4);
  assert.equal(receipts.filter(name => name.endsWith('.reads.jsonl')).length, 4);
  assert.equal(receipts.filter(name => name.endsWith('.usage.json')).length, 4);
  assert.equal(fs.existsSync(f.store.file('indexes')), false); assert.equal(fs.existsSync(f.store.file('reads.jsonl')), false); assert.equal(fs.existsSync(f.store.file('usage.json')), false);
});
test('legacy real prompts still include repository, no new task declarations required', async () => {
  const f = await fixture(false), captured: any[] = [], state = f.store.load();
  const fake: typeof runProcess = async (_exe, _args, options) => { captured.push(JSON.parse(options.input!)); options.onLine!(JSON.stringify({ type: 'result', structured_output: { tasks: [{ id: 'old', instruction: '旧任务', acceptance: ['通过'] }], humanDecision: null } })); return { exitCode: 0, stdout: '', stderr: '' }; };
  await new RealAgents(f.config, fake).plan(state, f.store, new AbortController().signal);
  assert.ok(!JSON.stringify(captured[0].repository).includes('SOURCE_SENTINEL_NEVER_INJECTED')); assert.equal('context' in captured[0], false);
  const manifests = fs.readdirSync(f.store.file('context')).filter(name => name.endsWith('.manifest.json'));
  assert.equal(manifests.length, 1);
  const receipt = JSON.parse(fs.readFileSync(f.store.file(`context/${manifests[0]}`), 'utf8'));
  assert.equal(receipt.enabled, false); assert.equal('assembled' in receipt, false);
  assert.equal(JSON.stringify(receipt).includes('SOURCE_SENTINEL_NEVER_INJECTED'), false);
});
test('live directory reparses between calls and uses only one-hop dependency/association navigation', async () => {
  const f = await fixture(), state = f.store.load(); docs(f.workspace, ['core', 'dep', 'far']);
  write(f.workspace, `${contextRoot}/modules/core.md`, document('module', { id: 'core', name: '核心', paths: ['src/core/'], depends_on: ['dep'], checked_files: {} }));
  write(f.workspace, `${contextRoot}/modules/dep.md`, document('module', { id: 'dep', name: '直接依赖', paths: ['src/dep/'], depends_on: ['far'], checked_files: {} }));
  state.tasks = [{ id: 'work', instruction: '核心模块', acceptance: ['通过'], moduleIds: ['core'] }];
  const first = await callContext(state, f.store, 'execute', new AbortController().signal);
  assert.deepEqual(first!.moduleIds, ['core', 'dep']); assert.equal(first!.moduleIds.includes('far'), false);
  const file = path.join(f.workspace, contextRoot, 'modules/core.md'); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('name: 核心', 'name: 新核心'));
  write(f.workspace, `${contextRoot}/modules/new.md`, document('module', { id: 'new', name: '新增模块', paths: ['src/new/'], depends_on: [], checked_files: {} }));
  const second = await callContext(state, f.store, 'plan', new AbortController().signal), a = JSON.parse(fs.readFileSync(first!.manifestPath, 'utf8')), b = JSON.parse(fs.readFileSync(second!.manifestPath, 'utf8'));
  assert.notEqual(first!.manifestPath, second!.manifestPath); assert.equal(b.moduleCatalog.length, a.moduleCatalog.length + 1); assert.notEqual(a.documents.find((doc: any) => doc.path === file).hash, b.documents.find((doc: any) => doc.path === file).hash);
  state.tasks[0]!.moduleIds = ['nonexistent']; await assert.rejects(callContext(state, f.store, 'execute', new AbortController().signal), /模块不存在/);
});
test('navigation caps catalog/tree/UTF-8 bytes with explicit omissions and full onsite catalog in manifest', async () => {
  const f = await fixture(); docs(f.workspace, Array.from({ length: 115 }, (_, n) => `m${n}`));
  for (let n = 0; n < 320; n++) write(f.workspace, `files/f${n}.txt`, 'NO_SOURCE_INJECTION');
  write(f.workspace, 'deep/a/b/c/file.ts', 'deep source'); write(f.workspace, '.env', 'DO_NOT_LOAD'); write(f.workspace, 'dist/main.js', 'BUILT_DO_NOT_LOAD');
  const state = f.store.load(), navigation = await callContext(state, f.store, 'plan', new AbortController().signal), manifest = JSON.parse(fs.readFileSync(navigation!.manifestPath, 'utf8'));
  assert.equal(navigation!.moduleCatalog.length, 116); assert.ok(navigation!.fileTree.length <= 300); assert.ok(navigation!.fileTree.every((node: any) => node.path.split('/').length <= 3)); assert.ok(Buffer.byteLength(JSON.stringify(navigation)) <= 24 * 1024);
  assert.equal(manifest.moduleCatalog.length, 116); assert.ok(navigation!.omitted.length > 0); assert.equal(JSON.stringify(navigation).includes('DO_NOT_LOAD'), false);
  const bigOverview = document('overview', { project_id: state.id, name: '大总览' }, Array(9).fill('中'.repeat(300)).join('\n'));
  write(f.workspace, `${contextRoot}/overview.md`, bigOverview); const big = await callContext(state, f.store, 'plan', new AbortController().signal); assert.ok(Buffer.byteLength(JSON.stringify(big)) <= 24 * 1024); assert.ok(big!.omitted.some((item: any) => item.reason.includes('总览正文')));
});
test('onboarding always isolated and reuses preview/approve/apply with unchanged original files', async () => {
  const f = await fixture(false, { mode: 'mock' }), original = readProject(f.source);
  const store = await createRun({ ...f.config, projectMode: 'direct', directAuthorization: undefined }, f.source, '本地 Mock 只建档', { purpose: 'context-onboarding' });
  const initial = store.load(); assert.equal(initial.config.projectMode, 'isolated'); assert.equal(initial.config.executionMode, 'native'); assert.notEqual(initial.workspace, f.source);
  const state = await drive(store, new MockAgents(initial.config)); assert.equal(state.phase, 'completed', state.reason); assert.equal(state.loops, 1); assert.equal(state.claudeCalls, 0); assert.equal(readProject(f.source).digest, original.digest); assert.equal(loadProjectContext(f.source).enabled, false);
  const preview = await previewDelivery(store, f.source, 'project-files'), manifest = JSON.parse(fs.readFileSync(path.join(preview.directory, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.changes.map((change: any) => change.path).sort(), [`${contextRoot}/modules/fixture.md`, `${contextRoot}/overview.md`]); assert.equal((await deliveryStatus(store, preview.id)).phase, 'preview');
  await assert.rejects(applyDelivery(store, preview.id), /approval/); assert.equal(readProject(f.source).digest, original.digest);
  await approveDelivery(store, preview.id, preview.digest, '仅批准本地 Mock 文档夹具'); assert.equal(readProject(f.source).digest, original.digest);
  assert.equal((await applyDelivery(store, preview.id)).phase, 'applied'); assert.equal(loadProjectContext(f.source).enabled, true);
  const after = readProject(f.source); for (const [file, bytes] of Object.entries(original.files)) assert.equal(after.files[file], bytes);
  fs.writeFileSync(path.join(root, 'onboarding-sample.json'), JSON.stringify({ service: 'local Mock only', source: f.source, runId: store.id, config: initial.config, stateFile: store.file('state.json'), deliveryDirectory: preview.directory, sourceOriginalDigest: original.digest }, null, 2));
});
test('onboarding refuses any planning/execution/review edits outside agreed documents', async () => {
  for (const phase of ['plan', 'execute', 'review'] as const) {
    const f = await fixture(false, { mode: 'mock' }), store = await createRun(f.config, f.source, '只建档', { purpose: 'context-onboarding' }), original = readProject(f.source), mock = new MockAgents(store.load().config);
    const agents: Agents = { executionMode: 'native', plan: (...args) => mock.plan(args[0]), execute: (...args) => mock.execute(...args), review: (...args) => mock.review(args[0]) };
    const operation = agents[phase].bind(agents);
    (agents as any)[phase] = async (...args: any[]) => { const result = await (operation as any)(...args); write(args[0].workspace, 'unauthorized.txt', 'must be preserved as rejected evidence'); return result; };
    const state = await drive(store, agents); assert.equal(state.phase, 'failed'); assert.match(state.reason, /建档产物范围错误/); assert.equal(readProject(f.source).digest, original.digest); assert.ok(fs.existsSync(path.join(state.workspace, 'unauthorized.txt')));
  }
});
test('onboarding dirty Git and ordinary folders use existing snapshots, no Git init for ordinary projects', async () => {
  const f = await fixture(false, { mode: 'mock' }); await git(f.source, ['init']); await git(f.source, ['add', '.']); await git(f.source, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
  write(f.source, 'README.md', 'dirty user text\n'); write(f.source, 'untracked.txt', 'existing user data\n'); const before = readProject(f.source);
  const store = await createRun(f.config, f.source, 'Dirty Git 建档', { purpose: 'context-onboarding' }); assert.equal(readProject(store.load().workspace).digest, before.digest); assert.equal((await drive(store, new MockAgents(store.load().config))).phase, 'completed'); assert.equal(readProject(f.source).digest, before.digest);
  const plain = await fixture(false); assert.equal(fs.existsSync(path.join(plain.workspace, '.git')), false); assert.equal(fs.existsSync(path.join(plain.source, '.git')), false);
});
test('changed onboarding preview invalidates approval, documents remain proposed after fixture delivery', async () => {
  const f = await fixture(true, { mode: 'mock' }), store = await createRun(f.config, f.source, '只建档', { purpose: 'context-onboarding' });
  const mock = new MockAgents(store.load().config), agents: Agents = { executionMode: 'native', plan: s => mock.plan(s), execute: async (state, store, signal) => { await mock.execute(state, store, signal); proposals(state.workspace); return { mode: 'native', summary: '本地含 proposed 的夹具' }; }, review: s => mock.review(s) };
  const state = await drive(store, agents); assert.equal(state.phase, 'completed', state.reason);
  const preview = await previewDelivery(store, f.source, 'project-files'); await approveDelivery(store, preview.id, preview.digest, '本地夹具批准');
  const file = path.join(state.workspace, contextRoot, 'overview.md'); fs.appendFileSync(file, '\n'); assert.equal((await deliveryStatus(store, preview.id)).phase, 'invalidated'); await assert.rejects(applyDelivery(store, preview.id), /approval/);
  assert.equal(loadProjectContext(f.source).contracts[0]!.metadata.status, 'proposed');
});

test('execute always receives catalog and concrete executable stamp example, no match stays unselected', async () => {
  const f = await fixture(), state = f.store.load(); state.goal = 'paint main';
  const navigation = (await callContext(state, f.store, 'execute', new AbortController().signal))!;
  assert.deepEqual(navigation.moduleIds, []); assert.equal(navigation.moduleCatalog[0].id, 'core');
  assert.ok(navigation.stampCommand.includes('--module')); assert.ok(navigation.stampCommand.includes('src/core/main.ts'));
  assert.equal(spawnSync(navigation.stampCommand[0], navigation.stampCommand.slice(1)).status, 0);
  fs.unlinkSync(path.join(f.workspace, 'src/core/main.ts'));
  // Remove proposals whose code basis intentionally no longer exists.
  fs.unlinkSync(path.join(f.workspace, contextRoot, 'contracts/api.md'));
  assert.equal((await callContext(state, f.store, 'execute', new AbortController().signal))!.stampCommand, null);
});

test('stamp rejects obvious non-core objects atomically but accepts HTML, source and interface files', async () => {
  const f = await fixture(), module = path.join(f.workspace, contextRoot, 'modules/core.md');
  for (const file of ['README.md', 'notes.md', 'package-lock.json', '.gitignore', 'result.json', 'main.test.ts', 'tests/main.ts', 'generated/main.js', 'browser-validation.mjs', 'validate-bots.cjs', 'chrome-acceptance.mjs']) {
    const name = 'src/core/' + file; write(f.workspace, name, 'fixture'); const before = fs.readFileSync(module);
    assert.throws(() => stampContext(f.workspace, 'core', ['src/core/main.ts', name]), /核心源码入口/);
    assert.deepEqual(fs.readFileSync(module), before);
  }
  for (const name of ['index.html', 'api.d.ts', 'engine.cpp', 'interface.h', 'main.js', 'styles.css']) {
    write(f.workspace, 'src/core/' + name, 'fixture'); stampContext(f.workspace, 'core', ['src/core/' + name]);
  }
});

test('new enabled development plans block missing or invalid moduleIds and can retry after native exploration', async () => {
  for (const ids of [undefined, [], ['missing']]) {
    const f = await fixture(true, { mode: 'mock' }); let executed = false;
    const agents: Agents = { executionMode: 'native', plan: async () => ({ tasks: [{ id: 'work', instruction: '核心源码', acceptance: ['通过'], moduleIds: ids }], humanDecision: null }), execute: async () => { executed = true; return { mode: 'native', summary: 'never' }; }, review: async () => ({ verdict: 'pass', reason: 'fixture' }) };
    const result = await drive(f.store, agents); assert.equal(result.phase, 'paused'); assert.equal(result.nextPhase, 'planning'); assert.equal(executed, false); assert.equal(result.loops, 0);
    assert.match(result.feedback, /相关/);
    agents.plan = async state => {
      // Native exploration can establish a new business responsibility before returning a plan.
      write(state.workspace, `${contextRoot}/modules/new-business.md`, document('module', { id: 'new-business', name: '新业务', paths: ['src/new/'], depends_on: [], checked_files: {} }));
      return { tasks: [{ id: 'work', instruction: '新业务', acceptance: ['通过'], moduleIds: ['new-business'] }], humanDecision: null };
    };
    agents.execute = async state => { write(state.workspace, 'src/new/main.ts', 'export const added = true;'); return { mode: 'native', summary: 'fixture' }; };
    agents.review = async state => ({ verdict: 'pass', reason: 'Mock 新业务检查完成', contextReview: { expansionReason: '', unmappedReason: '', checkedContracts: state.evidence!.contextReport!.contracts.map(doc => doc.id), modules: state.evidence!.contextReport!.affectedModules.map(module => ({ moduleId: module.moduleId, documentUpdated: module.documentUpdated, noUpdateReason: '本地 Mock 新业务实现未改变职责和接口', checkedFiles: module.checkedFiles, constraintsChanged: false, disposition: '本地 Mock 检查完成' })) } });
    const resumed = await drive(f.store, agents, '修正计划，续接同一Run'); assert.equal(resumed.phase, 'completed', resumed.reason);
  }
});

async function deletionFixture() {
  const f = await fixture(true, { mode: 'mock' }); docs(f.source, ['core', 'obsolete']); proposals(f.source);
  const store = await createRun(f.config, f.source, '只修订建档文档', { purpose: 'context-onboarding' });
  const agents: Agents = { executionMode: 'native', plan: async () => ({ tasks: [{ id: 'docs', instruction: '合并测试归属', acceptance: ['有效文档'] }], humanDecision: null }), execute: async state => {
    fs.unlinkSync(path.join(state.workspace, contextRoot, 'modules/obsolete.md'));
    write(state.workspace, `${contextRoot}/modules/core.md`, document('module', { id: 'core', name: '核心更新', paths: ['src/core/'], depends_on: [], checked_files: {} }));
    write(state.workspace, `${contextRoot}/modules/added.md`, document('module', { id: 'added', name: '新业务', paths: ['src/added/'], depends_on: [], checked_files: {} }));
    return { mode: 'native', summary: '本地确定性删除夹具' };
  }, review: async () => ({ verdict: 'pass', reason: '本地夹具' }) };
  const result = await drive(store, agents); assert.equal(result.phase, 'completed', result.reason);
  return { ...f, store, preview: await previewDelivery(store, f.source, 'project-files') };
}

test('Context document ADD/MODIFY/DELETE are bound to exact approval, resumable apply and snapshot', async () => {
  const f = await deletionFixture(), before = readProject(f.source), manifest = JSON.parse(fs.readFileSync(path.join(f.preview.directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.changes.find((c: any) => c.path.endsWith('/obsolete.md')).after, null);
  assert.match(fs.readFileSync(path.join(f.preview.directory, 'preview.md'), 'utf8'), /DELETE.*obsolete/);
  assert.match(manifest.diff, /obsolete.md \(deleted\)/);
  await assert.rejects(applyDelivery(f.store, f.preview.id), /approval/); assert.equal(readProject(f.source).digest, before.digest);
  await assert.rejects(approveDelivery(f.store, f.preview.id, 'a'.repeat(64), 'wrong digest'), /digest/i);
  await approveDelivery(f.store, f.preview.id, f.preview.digest, '仅批准本地夹具的明确删除');
  assert.equal((await applyDelivery(f.store, f.preview.id)).phase, 'applied'); assert.equal(fs.existsSync(path.join(f.source, contextRoot, 'modules/obsolete.md')), false);
  assert.equal(readProject(f.source).files['src/core/main.ts'], before.files['src/core/main.ts']);
  assert.equal((await applyDelivery(f.store, f.preview.id)).phase, 'applied');
});

test('deletion preview replacement and source conflict prevent apply without deleting documents', async () => {
  for (const mutation of ['preview', 'manifest', 'source']) {
    const f = await deletionFixture(); await approveDelivery(f.store, f.preview.id, f.preview.digest, '本地夹具');
    if (mutation === 'source') write(f.source, 'src/core/main.ts', 'user change');
    else if (mutation === 'preview') fs.appendFileSync(path.join(f.preview.directory, 'preview.md'), 'tampered');
    else { const name = path.join(f.preview.directory, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(name, 'utf8')); manifest.changes.find((c: any) => c.after === null).path = 'src/core/main.ts'; fs.writeFileSync(name, JSON.stringify(manifest)); }
    await assert.rejects(applyDelivery(f.store, f.preview.id), /replaced|digest|conflict/i);
    assert.equal(fs.existsSync(path.join(f.source, contextRoot, 'modules/obsolete.md')), true);
  }
});

test('self-consistent forged deletion manifests still reject paths outside allowed Context documents', async () => {
  for (const name of ['src/core/main.ts', 'docs/project-context/../game.js', `${contextRoot}/overview.md`, `${contextRoot}/history.json`]) {
    const f = await deletionFixture(), manifestPath = path.join(f.preview.directory, 'manifest.json'), statePath = path.join(f.preview.directory, 'state.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')), journal = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    manifest.changes.find((c: any) => c.after === null).path = name; journal.digest = contextHash(JSON.stringify(manifest));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest)); fs.writeFileSync(statePath, JSON.stringify(journal));
    await assert.rejects(deliveryStatus(f.store, f.preview.id), /deletion outside/);
    assert.equal(fs.existsSync(path.join(f.source, contextRoot, 'modules/obsolete.md')), true);
  }
});

test('onboarding rejects deletion of business, runtime-like, nonstandard and overview files', async () => {
  for (const name of ['src/core/main.ts', 'runtime-history.json', `${contextRoot}/extra.txt`, `${contextRoot}/overview.md`]) {
    const f = await fixture(true, { mode: 'mock' }); if (!fs.existsSync(path.join(f.source, name))) write(f.source, name, 'must preserve');
    const store = await createRun(f.config, f.source, '禁止范围删除', { purpose: 'context-onboarding' }), before = readProject(f.source);
    const agents: Agents = { executionMode: 'native', plan: async () => ({ tasks: [{ id: 'docs', instruction: 'fixture', acceptance: ['fixture'] }], humanDecision: null }), execute: async state => { fs.unlinkSync(path.join(state.workspace, name)); return { mode: 'native', summary: 'rejected fixture' }; }, review: async () => ({ verdict: 'pass', reason: 'never' }) };
    const result = await drive(store, agents); assert.equal(result.phase, 'failed'); assert.match(result.reason, /建档产物范围错误/); assert.equal(readProject(f.source).digest, before.digest);
    await assert.rejects(previewDelivery(store, f.source, 'project-files'));
  }
});
