import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun, drive } from '../src/controller.js';
import { snapshot, git } from '../src/workspace.js';
import { projectCapabilities, projectHead } from '../src/project.js';
import { lockProject as lockState } from '../src/project-files.js';
const lockProject = (source: string) => lockState({source,config:{projectMode:'direct'}} as any);
import { nativeThreadOptions } from '../src/native-agent.js';
import { previewDelivery, approveDelivery, applyDelivery, deliveryStatus } from '../src/delivery.js';
import { runProcess } from '../src/process.js';
import { MockAgents, type Agents } from '../src/adapters.js';
import type { Config } from '../src/schema.js';

const root = path.resolve(process.env.PERSONAL_AGENT_TEST_ROOT ?? '.validation', `direct-${randomUUID()}`); fs.mkdirSync(root, { recursive: true });
async function fixture(name: string, gitProject = false, overrides: Partial<Config> = {}) {
  const dir = path.join(root, name), source = path.join(dir, 'project'); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'user-notes.txt'), '用户已有成果，不得覆盖\n');
  fs.writeFileSync(path.join(source, 'answer.cjs'), 'module.exports=0;\n');
  if (gitProject) { await git(source, ['init']); await git(source, ['add', '.']); await git(source, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'plain fixture']); fs.appendFileSync(path.join(source, 'user-notes.txt'), '用户未提交内容\n'); }
  const verifier = path.join(dir, 'independent.cjs');
  fs.writeFileSync(verifier, "require('node:assert/strict').equal(require(require('node:path').resolve('answer.cjs')),42); console.log('外部 Controller 独立验收通过');");
  const config: Config = { mode: 'mock', executionMode: 'native', projectMode: 'direct', directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()}, runtimeDir: path.join(dir, 'runtime'), allowedRepositories: [source], claudeExecutable: 'NEVER-LAUNCH-PAID', timeoutMs: 5000, maxLoops: 4, maxReworks: 1, maxClaudeCalls: 6, tests: [{ executable: process.execPath, args: [verifier] }], mockScenario: 'pass', ...overrides };
  const store = await createRun(config, source, name);
  return { source, config, store, dir, verifier };
}
function localAgents(): Agents {
  return {
    executionMode: 'native',
    async plan() { return { humanDecision: null, tasks: [{ id: 'answer', instruction: '使用本地夹具开发答案', acceptance: ['可信外部程序通过'] }] }; },
    async execute(state, store) {
      // Actual subprocess reads/edits/tests. This adapter is a local fixture.
      state.codexThreadId ??= 'local-direct-thread'; store.save(state);
      const history = [];
      for (const script of ["require('fs').writeFileSync('answer.cjs','module.exports=1;\\n')", "require('node:assert/strict').equal(require('./answer.cjs'),42)", "require('fs').writeFileSync('answer.cjs','module.exports=42;\\n')", "require('node:assert/strict').equal(require('./answer.cjs'),42)"]) history.push(await runProcess(process.execPath, ['-e', script], { cwd: state.workspace, timeoutMs: 5000 }));
      fs.writeFileSync(store.file('local-autonomous-loop.json'), JSON.stringify({ service: '本地夹具，无模型调用', history }, null, 2));
      assert.deepEqual(history.map(h => h.exitCode), [0, 1, 0, 0]);
      return { mode: 'native', summary: '本地直接执行夹具完成实际修改、失败自测及修复' };
    },
    async review(state) { fs.writeFileSync(path.join(state.workspace, 'review-note.txt'), '本地审查夹具实际新增文件\n'); return { verdict: 'pass', reason: '审查完成；以独立验收为准' }; }
  };
}
test('plain folder direct mode modifies selected files without initializing Git or cloning', async () => {
  const f = await fixture('plain'), notes = fs.readFileSync(path.join(f.source, 'user-notes.txt'));
  const state = await drive(f.store, localAgents());
  assert.equal(state.phase, 'completed'); assert.equal(state.workspace, fs.realpathSync(f.source)); assert.match(state.base, /^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(f.source, '.git')), false); assert.equal(fs.existsSync(f.store.file('workspace')), false);
  assert.deepEqual(fs.readFileSync(path.join(f.source, 'user-notes.txt')), notes); assert.match(state.evidence!.diff, /module.exports=42/); assert.match(state.evidence!.diff, /review-note.txt/);
  assert.equal(state.evidence!.tests[0]!.exitCode, 0); assert.ok(projectCapabilities.directFolder); assert.equal(nativeThreadOptions(f.source).skipGitRepoCheck, true);
});
test('direct Git mode preserves dirty user files and excludes preexisting edits from task diff', async () => {
  const f = await fixture('dirty-git', true), notes = fs.readFileSync(path.join(f.source, 'user-notes.txt'));
  const state = await drive(f.store, localAgents()); assert.equal(state.phase, 'completed');
  assert.deepEqual(fs.readFileSync(path.join(f.source, 'user-notes.txt')), notes); assert.ok(!state.evidence!.diff.includes('用户未提交内容')); assert.equal(await projectHead(f.source), JSON.parse(fs.readFileSync(f.store.file('project-git.json'),'utf8')).head);
});
test('direct final delivery requires exact approval then independently checks without source writes', async () => {
  const f = await fixture('delivery'); const state = await drive(f.store, localAgents()); assert.equal(state.phase, 'completed');
  const file = path.join(f.source, 'answer.cjs'), mtime = fs.statSync(file).mtimeMs, before = await snapshot(f.source);
  const preview = await previewDelivery(f.store, f.source, 'direct');
  const manifest = JSON.parse(fs.readFileSync(path.join(preview.directory, 'manifest.json'), 'utf8')); assert.equal(manifest.kind, 'direct');
  await assert.rejects(applyDelivery(f.store, preview.id), /approval/); await assert.rejects(approveDelivery(f.store, preview.id, 'wrong', '确认'), /approval/);
  await approveDelivery(f.store, preview.id, preview.digest, '明确确认当前普通文件夹已有成果');
  const applied = await applyDelivery(f.store, preview.id); assert.equal(applied.phase, 'applied'); assert.deepEqual(applied.written, []);
  assert.equal(fs.statSync(file).mtimeMs, mtime); assert.equal(await snapshot(f.source), before); assert.equal(fs.existsSync(path.join(f.source, '.git')), false);
  const evidence = JSON.parse(fs.readFileSync(path.join(preview.directory, 'final-check.json'), 'utf8')); assert.equal(evidence.passed, true);
});
test('source changes invalidate direct approval before final confirmation', async () => {
  const f = await fixture('stale-approval'); await drive(f.store, localAgents()); const preview = await previewDelivery(f.store, f.source, 'direct');
  await approveDelivery(f.store, preview.id, preview.digest, '批准具体成果'); fs.appendFileSync(path.join(f.source, 'answer.cjs'), '// later user change\n');
  assert.equal((await deliveryStatus(f.store, preview.id)).phase, 'invalidated'); await assert.rejects(applyDelivery(f.store, preview.id), /approval/);
});

test('completed direct delivery preserves trusted stages across two dependent native tasks', async () => {
  const f = await fixture('mapped-stages-delivery', false, {
    acceptanceStages: { core: [0], full: [0] }, taskStages: { core: 'core', hardening: 'full' }
  });
  const agents: Agents = {
    executionMode: 'native',
    async plan() { return { humanDecision: null, tasks: [
      { id: 'core', instruction: '实现答案', acceptance: ['外部验收通过'], acceptanceStage: 'core' },
      { id: 'hardening', instruction: '补充说明', acceptance: ['保留答案并增加说明'], dependsOn: ['core'], acceptanceStage: 'full' }
    ] }; },
    async execute(state) {
      fs.writeFileSync(path.join(state.workspace, state.taskIndex === 0 ? 'answer.cjs' : 'README.md'), state.taskIndex === 0 ? 'module.exports=42;\n' : '完成说明\n');
      return { mode: 'native', summary: '本地原生夹具；没有真实模型调用' };
    },
    async review() { return { verdict: 'pass', reason: '独立验收和当前任务满足' }; }
  };
  const state = await drive(f.store, agents);
  assert.equal(state.phase, 'completed'); assert.equal(state.taskIndex, 2);
  const file = path.join(f.source, 'answer.cjs'), mtime = fs.statSync(file).mtimeMs, before = await snapshot(f.source);
  const preview = await previewDelivery(f.store, f.source, 'direct');
  const manifest = JSON.parse(fs.readFileSync(path.join(preview.directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.kind, 'direct'); assert.ok(manifest.changes.some((c: {path: string}) => c.path === 'README.md'));
  await assert.rejects(applyDelivery(f.store, preview.id), /approval/);
  await approveDelivery(f.store, preview.id, preview.digest, '本地夹具明确确认当前快照');
  const applied = await applyDelivery(f.store, preview.id);
  assert.equal(applied.phase, 'applied'); assert.deepEqual(applied.written, []);
  assert.equal(await snapshot(f.source), before); assert.equal(fs.statSync(file).mtimeMs, mtime);
  const rules = fs.readFileSync(f.verifier);
  fs.writeFileSync(f.verifier, "console.log('changed rules');");
  await assert.rejects(previewDelivery(f.store, f.source, 'direct'), /Acceptance rules changed/);
  fs.writeFileSync(f.verifier, rules);
});
test('direct project lock spans independent Runs and runtime directories', async () => {
  const f = await fixture('lock'), release = lockProject(f.source);
  try { await assert.rejects(drive(f.store, localAgents()), /already running/); await assert.rejects(createRun({ ...f.config, runtimeDir: path.join(f.dir, 'other-runtime') }, f.source, 'concurrent'), /already running/); }
  finally { release(); }
  assert.equal((await drive(f.store, localAgents())).phase, 'completed');
});
test('direct mode enforces project authorization and external runtime without proposal duplicate writes', async () => {
  const f = await fixture('authorization');
  await assert.rejects(createRun({ ...f.config, executionMode: 'proposal' }, f.source, 'bad'), /requires native/);
  await assert.rejects(createRun({ ...f.config, runtimeDir: path.join(f.source, 'runtime') }, f.source, 'bad'), /must not overlap/);
  const unrelated = path.join(f.dir, 'unrelated'); fs.mkdirSync(unrelated); await assert.rejects(createRun(f.config, unrelated, 'bad'), /explicitly allowed/);
});
test('native Mock direct adapter uses actual files and independently verifies, with zero paid calls', async () => {
  const f = await fixture('mock-direct'); fs.writeFileSync(f.verifier, "const fs=require('fs'),a=require('node:assert/strict');const id=process.env.PERSONAL_AGENT_TASK_ID;for(const name of id==='hello'?['hello']:['hello','done'])a.equal(fs.readFileSync(name+'.txt','utf8'),name+'\\n');");
  const state = await drive(f.store, new MockAgents(f.config)); assert.equal(state.phase, 'completed'); assert.equal(state.claudeCalls, 0); assert.equal(state.loops, 2); assert.equal(state.workspace, f.source); assert.equal(fs.readFileSync(path.join(f.source, 'done.txt'), 'utf8'), 'done\n');
});
test('direct Mock refuses to overwrite existing user marker files', async () => {
  const f = await fixture('preserve-markers'); fs.writeFileSync(path.join(f.source, 'hello.txt'), '用户原有内容\n');
  await assert.rejects(createRun(f.config, f.source, 'another mock'), /拒绝覆盖/);
  assert.equal(fs.readFileSync(path.join(f.source, 'hello.txt'), 'utf8'), '用户原有内容\n');
});
test('direct project directories may live outside D drive while runtime remains separate', async () => {
  const f = await fixture('other-drive'); const source = path.resolve('.validation', 'plain-project-' + randomUUID()); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'answer.cjs'), 'module.exports=0;\n');
  const store = await createRun({ ...f.config, allowedRepositories: [source], runtimeDir: path.join(f.dir, 'other-runtime'),directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()} }, source, '跨盘普通项目');
  assert.equal((await drive(store, localAgents())).phase, 'completed'); assert.equal(fs.existsSync(path.join(source, '.git')), false);
});
