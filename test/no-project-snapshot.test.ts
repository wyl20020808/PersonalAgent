import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { drive as controllerDrive, createRun } from '../src/controller.js';
import { driveWithUserAcceptance as drive } from './helpers/accepted-flow.js';
import { git, observeWorkspace, nativeAgentEnv } from '../src/workspace.js';
import { loadProject, restoreProject } from '../src/project-files.js';
import { previewDelivery, approveDelivery, applyDelivery } from '../src/delivery.js';
import { mockContextDocuments, stampContext, contextHash } from '../src/project-context.js';
import { callContext } from '../src/context-navigation.js';
import { manualAcceptanceDigest, acceptManual } from '../src/manual-acceptance.js';
import type { Config } from '../src/schema.js';
import type { Agents } from '../src/adapters.js';

const root = path.resolve('.validation', `ns-${randomUUID().slice(0, 8)}`);
async function fixture(gitProject = false, context = false, tests = true) {
  const dir = path.join(root, randomUUID().slice(0, 8)), source = path.join(dir, 'project'); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'main.ts'), 'before\n');
  // A sparse asset plus a hardlink would make the old mandatory baseline reject.
  const fd = fs.openSync(path.join(source, 'asset.bin'), 'w'); fs.ftruncateSync(fd, 512 * 1024 * 1024); fs.closeSync(fd);
  fs.linkSync(path.join(source, 'asset.bin'), path.join(source, 'asset-link.bin'));
  if (context) {
    for (const [name, content] of Object.entries(mockContextDocuments(randomUUID(), 'main.ts'))) {
      fs.mkdirSync(path.dirname(path.join(source, name)), { recursive: true }); fs.writeFileSync(path.join(source, name), content);
    }
    stampContext(source, 'fixture', ['main.ts']);
  }
  if (gitProject) {
    await git(source, ['init']); await git(source, ['add', 'main.ts']);
    await git(source, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
    fs.writeFileSync(path.join(source, 'main.ts'), 'user dirty content\n');
  }
  const config: Config = { mode: 'mock', executionMode: 'native', projectMode: 'direct', directAuthorization: { projectPath: source, acknowledgedAt: new Date().toISOString() }, runtimeDir: path.join(dir, 'runtime'), allowedRepositories: [source], claudeExecutable: 'NEVER-PAID', timeoutMs: 10000, maxLoops: 2, maxReworks: 1, tests: tests ? [{ executable: process.execPath, args: ['-e', "require('node:assert/strict').equal(require('node:fs').readFileSync('main.ts','utf8'),'after\\n')"] }] : [], mockScenario: 'pass' };
  return { source, config, store: await createRun(config, source, 'Edit selected source with native tools'), context };
}
function agents(context: boolean): Agents {
  return {
    executionMode: 'native',
    async plan(state) {
      state.claudeSessionId = 'local-plan-session';
      return { humanDecision: null, tasks: [{ id: 'edit', instruction: 'Edit main.ts', acceptance: ['Configured test passes'], ...(context ? { moduleIds: ['fixture'] } : {}) }] };
    },
    async execute(state, store) {
      state.codexThreadId = 'local-native-thread'; store.save(state);
      fs.writeFileSync(path.join(state.workspace, 'main.ts'), 'after\n');
      if (context) stampContext(state.workspace, 'fixture', ['main.ts']);
      return { mode: 'native', summary: 'Local native fixture; no paid Agent' };
    },
    async review(state) {
      assert.match(state.evidence!.verificationScope!, /未验证全量/);
      const report = state.evidence?.contextReport;
      return { verdict: 'pass', reason: 'Configured tests and explicit scope inspected by local fixture', ...(report ? { contextReview: { expansionReason: '', unmappedReason: '', checkedContracts: [], modules: report.affectedModules.map(module => ({ moduleId: module.moduleId, documentUpdated: module.documentUpdated, noUpdateReason: 'Only stamped source changed', checkedFiles: module.checkedFiles, constraintsChanged: false, disposition: 'Checked stamped file and document' })) } } : {}) };
    }
  };
}
for (const gitProject of [false, true]) test(`large ${gitProject ? 'dirty Git' : 'non-Git'} direct project completes Plan/Execute/Review without backup`, async () => {
  const { source, store } = await fixture(gitProject);
  const state = await drive(store, agents(false));
  assert.equal(state.phase, 'completed', state.reason);
  assert.equal(state.workspace, source); assert.equal(state.snapshotPolicy, 'none');
  assert.equal(state.claudeSessionId, 'local-plan-session'); assert.equal(state.codexThreadId, 'local-native-thread');
  assert.equal(state.evidence!.userAccepted, true); assert.ok(state.evidence!.verificationScope);
  assert.equal(fs.existsSync(store.file('snapshot-objects')), false);
  assert.equal(fs.existsSync(store.file('project-baseline.json')), false);
  assert.equal(fs.readdirSync(store.dir).some(name => /baseline|recovery-/.test(name)), false);
  const audit = fs.readFileSync(store.file('audit.jsonl'), 'utf8');
  assert.match(audit, /agent-start/); assert.match(audit, /fixture-decision-check/); assert.match(audit, /review/); assert.doesNotMatch(audit, /snapshot-coverage/);
  assert.throws(() => restoreProject(store, '', 'restore'), /no project backup/);
  const preview = await previewDelivery(store, source, 'direct');
  assert.match(fs.readFileSync(path.join(preview.directory, 'preview.md'), 'utf8'), /未验证全量/);
  await assert.rejects(applyDelivery(store, preview.id), /no valid explicit approval/);
  await approveDelivery(store, preview.id, preview.digest, 'Approve existing result within explicitly limited scope');
  const delivery = await applyDelivery(store, preview.id);
  assert.equal(delivery.phase, 'applied'); assert.match(delivery.reason, /Controller 未执行验收测试/); assert.deepEqual(delivery.written, []);
});
test('Project Context checks only documents and checked_files; native environment stays intact', async () => {
  const { store, source } = await fixture(false, true);
  const before = await observeWorkspace(store.load());
  fs.writeFileSync(path.join(source, 'main.ts'), 'intervening\n');
  assert.notEqual(await observeWorkspace(store.load()), before);
  const navigationState = store.load(); navigationState.goal = 'fixture main.ts'; store.save(navigationState);
  const navigation = await callContext(store.load(), store, 'plan', new AbortController().signal);
  assert.equal(navigation!.freshness[0].path, 'main.ts'); assert.match(navigation!.verificationScope, /checked_files/);
  const state = await drive(store, agents(true)); assert.equal(state.phase, 'completed', state.reason);
  assert.ok(state.evidence!.contextReport!.affectedModules[0]!.checkedFiles.includes('main.ts'));
  assert.match(state.evidence!.contextReport!.verificationScope!, /未验证全量/);
  assert.equal(fs.existsSync(store.file('snapshot-objects')), false);
  assert.equal(JSON.stringify(nativeAgentEnv()) === JSON.stringify({ ...process.env }), true, 'Native environment differs');
});
test('manual acceptance remains explicit when no tests exist', async () => {
  const { store } = await fixture(false, false, false);
  const paused = await controllerDrive(store, agents(false)); assert.equal(paused.phase, 'paused');
  const digest = manualAcceptanceDigest(paused); assert.ok(digest);
  await assert.rejects(acceptManual(store, digest!, ''), /observations/);
  const state = await acceptManual(store, digest!, 'Observed selected file; full non-Git diff is unverified');
  assert.equal(state.phase, 'completed'); assert.equal(state.evidence!.passed, false);
});
test('new isolation reports unavailable copy/apply guarantees without scanning source', async () => {
  const { source, config } = await fixture(false);
  await assert.rejects(createRun({ ...config, projectMode: 'isolated' }, source, 'isolation'), /no longer automatic/);
  await assert.rejects(createRun(config, source, 'onboarding', { purpose: 'context-onboarding' }), /onboarding isolation is unavailable/);
});
test('historical state and inline snapshot remain readable without migration', async () => {
  const { store } = await fixture(false);
  const state = store.load(); delete state.snapshotPolicy; store.save(state);
  assert.equal(store.load().snapshotPolicy, undefined);
  const files = { 'main.ts': Buffer.from('old content').toString('base64') }, file = store.file('legacy-snapshot.json');
  fs.writeFileSync(file, JSON.stringify({ files, digest: contextHash(JSON.stringify(files)) }));
  assert.equal(Buffer.from(loadProject(file).files['main.ts']!, 'base64').toString(), 'old content');
});
test('durable native result resumes through fresh tests and review without replaying Execute', async () => {
  const { store, source } = await fixture(false);
  const completed = await drive(store, agents(false)); assert.equal(completed.phase, 'completed');
  completed.phase = 'executing'; completed.nextPhase = 'execute'; completed.taskIndex = 0; completed.evidence = null;
  store.save(completed); fs.writeFileSync(path.join(source, 'user-extra.txt'), 'Preserved external change\n');
  const resumedAgents = agents(false); let reviews = 0;
  resumedAgents.execute = async () => { throw Error('Execute must not replay a durable native result'); };
  const review = resumedAgents.review; resumedAgents.review = async (...args) => { reviews++; return review(...args); };
  const resumed = await drive(store, resumedAgents);
  assert.equal(resumed.phase, 'completed', resumed.reason); assert.equal(reviews, 1);
  assert.equal(resumed.codexThreadId, 'local-native-thread'); assert.equal(resumed.loops, 1);
  assert.equal(fs.readFileSync(path.join(source, 'user-extra.txt'), 'utf8'), 'Preserved external change\n');
  assert.match(fs.readFileSync(store.file('audit.jsonl'), 'utf8'), /native-result-recovered/);
});
test('clean Git isolated workflow uses Git clone without content baseline; automatic Apply stays unavailable', async () => {
  const { config } = await fixture(false);
  const source = path.join(path.dirname(config.runtimeDir), 'clean'); fs.mkdirSync(source); fs.writeFileSync(path.join(source, 'main.ts'), 'before\n');
  await git(source, ['init']); await git(source, ['add', 'main.ts']);
  await git(source, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
  const store = await createRun({ ...config, allowedRepositories: [source], projectMode: 'isolated' }, source, 'Isolated Git edit');
  const state = await drive(store, agents(false)); assert.equal(state.phase, 'completed', state.reason);
  assert.equal(fs.readFileSync(path.join(source, 'main.ts'), 'utf8'), 'before\n');
  assert.equal(fs.existsSync(store.file('snapshot-objects')), false);
  await assert.rejects(previewDelivery(store, source, 'project-files'), /cannot safely Apply/);
});
test('20001 project files do not impose a startup snapshot gate', async () => {
  const { source, config } = await fixture(false);
  const files = path.join(source, 'many-files'); fs.mkdirSync(files);
  for (let index = 0; index < 20001; index++) fs.writeFileSync(path.join(files, `${index}.txt`), '');
  const store = await createRun(config, source, 'Plan in a large file-count directory');
  assert.equal(store.load().phase, 'planning');
  assert.equal(fs.existsSync(store.file('project-baseline.json')), false);
  assert.equal(fs.existsSync(store.file('snapshot-objects')), false);
});
test('malformed Context edits remain auditable and cannot receive a verification pass', async () => {
  const { store } = await fixture(false, true);
  const local = agents(true);
  local.execute = async state => {
    fs.writeFileSync(path.join(state.workspace, 'main.ts'), 'after\n');
    fs.writeFileSync(path.join(state.workspace, 'docs/project-context/modules/fixture.md'), 'invalid module document\n');
    return { mode: 'native', summary: 'Local malformed Context fixture' };
  };
  const state = await drive(store, local);
  assert.equal(state.phase,'completed'); assert.equal(state.evidence?.userAccepted,true);
  assert.equal(state.evidence?.passed, false);
  assert.ok(state.evidence?.contextReport?.findings.some(finding => finding.code === 'CONTEXT_INVALID'));
  assert.match(fs.readFileSync(store.file('audit.jsonl'), 'utf8'), /agent-finish/);
});
