import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { seedFiles, initialFiles, requirements, writeFixture } from '../../dist/scripts/context-regression-fixtures.js';
import { assertT2ReviewStage } from '../../dist/scripts/context-regression-review.js';
import { createRun, drive } from '../../dist/src/controller.js';
import { RealAgents } from '../../dist/src/real-agents.js';
import { runProcess } from '../../dist/src/process.js';
import { readProject } from '../../dist/src/project-files.js';
import { git } from '../../dist/src/workspace.js';
import { captureBaseline, baselineDiff } from '../../dist/src/incremental.js';
import { runUsage } from '../../dist/src/call-observation.js';
import { auditRecords } from '../../dist/src/context-trust.js';
import { initializeGlobalBudget } from '../../dist/src/global-budget.js';
import { loadProjectContext } from '../../dist/src/project-context.js';
import { FlowError } from '../../dist/src/failure.js';

// Execution harness only: imports the accepted build; no substituted Agent output.
const build = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sha = value => createHash('sha256').update(value).digest('hex');
const json = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2), { flag: 'wx' }); };
const mode = process.argv[2];
const root = process.argv[3] ?? `D:/pa-pc3-real/20261009-${randomUUID().slice(0, 8)}`;
assert.match(root.replaceAll('\\', '/'), /^D:\/pa-pc3-real\/20261009-[a-z0-9]{8}$/);
const batchFile = path.join(root, 'batch.json');
const tasks = ['T2', 'T3'];
function fingerprints(directory) {
  const rows = {};
  function walk(relative) { for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) { const p = path.join(relative, entry.name); if (entry.isDirectory()) walk(p); else rows[p.replaceAll('\\', '/')] = sha(fs.readFileSync(path.join(directory, p))); } }
  for (const p of ['dist', 'src', 'test']) walk(p);
  return rows;
}
function verifyBuild() {
  const repairedAcceptance = path.join(build, 'validation/phase3/harness-fix/acceptance.json');
  const accepted = JSON.parse(fs.readFileSync(fs.existsSync(repairedAcceptance) ? repairedAcceptance : path.join(build, 'validation/phase3/review-fix/acceptance.json')));
  const manifest = JSON.parse(fs.readFileSync(accepted.manifest));
  const current = fingerprints(build), tested = fingerprints(manifest.cwd);
  assert.deepEqual(current, tested, 'Current source/build differs from newly accepted full regression');
  assert.equal(accepted.controllerTests, 242);
  const bytes = fs.readFileSync(path.join(build, 'validation/phase3/harness-fix/specialized.log'));
  const specialized = bytes[0] === 255 && bytes[1] === 254 ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8');
  assert.match(specialized.replaceAll('\r\n', '\n'), /# pass 11\n# fail 0\n# cancelled 0\n# skipped 0/);
  assert.match(fs.readFileSync(accepted.controllerLog, 'utf8'), new RegExp('# pass ' + accepted.controllerTests + '\n# fail 0\n# cancelled 0\n# skipped 0'));
  assert.match(fs.readFileSync(accepted.desktopLog, 'utf8'), /# pass 72\n# fail 0/);
  for (const electron of accepted.electron) { assert.equal(electron.failed, 0); assert.ok(electron.passed > 0); assert.equal(sha(fs.readFileSync(electron.log)), electron.hash); }
  const historical = JSON.parse(fs.readFileSync(path.join(build, 'validation/phase3/review-fix/old-batch-before.json')));
  for (const [relative, hash] of Object.entries(historical.hashes)) assert.equal(sha(fs.readFileSync(path.join(historical.root, relative))), hash, 'Historical evidence changed: ' + relative);
  const previous = JSON.parse(fs.readFileSync('D:/pa-pc3-real/20261009-c67e41d2/final-evidence-sha256.json'));
  for (const [relative, hash] of Object.entries(previous.hashes)) assert.equal(sha(fs.readFileSync(path.join(previous.root, relative))), hash, 'Previous batch evidence changed: ' + relative);
  const t1 = JSON.parse(fs.readFileSync(path.join(previous.root, 'T1/result.json')));
  assert.equal(t1.behaviorConclusion, 'PASS'); assert.equal(t1.phase, 'completed');
  assert.equal(t1.runId, 'ea0ecbe2-1326-44cc-a606-e04766f92435');
  const evidenceHashes = Object.fromEntries(['validation/phase3/run-real-fixed-review-repair.mjs', 'validation/phase3/run-real-t2-t3-final.mjs', 'validation/phase3/harness-fix/specialized.log', 'scripts/context-regression-fixtures.ts', 'scripts/context-regression-review.ts', 'dist/scripts/context-regression-fixtures.js', 'dist/scripts/context-regression-review.js', 'PROJECT_CONTEXT_V11_PHASE3_T2_T3_REAL_REGRESSION_PLAN.md'].map(relative => [relative, sha(fs.readFileSync(path.join(build, relative)))]));
  evidenceHashes[accepted.controllerLog] = sha(fs.readFileSync(accepted.controllerLog));
  return { build, files: current, evidenceHashes, compiledTestFiles: manifest.tests.length, controller: '242/242', specialized: '11/11', desktop: '72/72', electron: accepted.electron, acceptedTestRoot: manifest.cwd, historicalBatchUnchanged: true, previousBatchUnchanged: true, historicalT1: { runId: t1.runId, result: path.join(previous.root, 'T1/result.json'), hash: sha(fs.readFileSync(path.join(previous.root, 'T1/result.json'))) } };
}
if (mode === 'prepare') {
  assert.equal(fs.existsSync(root), false, 'Never replace existing batch');
  const preflight = verifyBuild();
  fs.mkdirSync(root, { recursive: true });
  json(path.join(root, 'preflight.json'), preflight);
  const authorization = { authorizedAt: new Date().toISOString(), source: 'User explicit final new T2/T3 authorization, CC <=7 Codex <=3, T2 Execute rework <=1, 2026-10-09', expected: { claude: 5, codex: 3 }, maximum: { claude: 7, codex: 3 }, runs: tasks, rework: { T2: 1, T3: 0 }, noDeliveryApproval: true, noCommitMergePush: true, noAmountLimitRequested: true };
  json(path.join(root, 'authorization.json'), authorization);
  // Existing registry budgets belong to cafe/fish projects; do not reset or reuse them.
  const registry = 'D:/PersonalAgent/.desktop-data/profiles.json';
  const policies = fs.existsSync(registry) ? JSON.parse(fs.readFileSync(registry)).profiles.map(p => { const c = JSON.parse(fs.readFileSync(p.file)); return { config: p.file, repositories: c.allowedRepositories, globalBudget: c.globalBudget ?? null }; }) : [];
  json(path.join(root, 'existing-policy-check.json'), { policies, applicableToNewFixture: false, note: 'Known policies are scoped to prior projects. New ledger binds this newly explicit authorization only; no historic ledger reset.' });
  const ledger = path.join(root, 'authorized-cc-budget.json'); initializeGlobalBudget(ledger, 7);
  const fixtures = [];
  for (const task of tasks) {
    const directory = path.join(root, task), source = path.join(directory, 's'); seedFiles(source, task);
    const version = task === 'T3' ? 'dev' : 'main';
    let branches = null;
    if (task === 'T3') {
      await git(source, ['init', '-b', 'main']); await git(source, ['add', '.']);
      await git(source, ['-c', 'user.name=Fixed Regression Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Fixed regression main seed']);
      const main = await git(source, ['rev-parse', 'HEAD']);
      json(path.join(directory, 'main-readonly-snapshot.json'), readProject(source));
      await git(source, ['checkout', '-b', 'dev']);
      writeFixture(source, 'combat/core.js', 'export const reach = 5;\nexport const unit = "m";\n');
      await git(source, ['add', 'combat/core.js']);
      await git(source, ['-c', 'user.name=Fixed Regression Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Fixed dev seed with stale main knowledge']);
      branches = { main, dev: await git(source, ['rev-parse', 'HEAD']), current: await git(source, ['branch', '--show-current']) };
      assert.equal(branches.current, 'dev'); assert.notEqual(branches.main, branches.dev);
      const doc = loadProjectContext(source).modules.find(m => m.metadata.id === 'combat');
      assert.notEqual(doc.metadata.checked_files['combat/core.js'], sha(fs.readFileSync(path.join(source, 'combat/core.js'))));
    }
    const originalVerifier = `D:/pa-pc3-demo/432736ee/${task === 'T3' ? 'T3-dev' : task}/independent.cjs`;
    const verifier = path.join(directory, 'independent.cjs'); fs.copyFileSync(originalVerifier, verifier, fs.constants.COPYFILE_EXCL);
    assert.equal(sha(fs.readFileSync(verifier)), sha(fs.readFileSync(`D:/pa-pc3-real/20261009-c67e41d2/${task}/independent.cjs`)), 'Fixed independent verifier changed');
    const config = { allowedRepositories: [source], runtimeDir: path.join(directory, 'r'), projectMode: 'isolated', executionMode: 'native', mode: 'real', claudeExecutable: 'C:/Users/WYL20/.local/bin/claude.exe', timeoutMs: 600000, maxLoops: task === 'T2' ? 2 : 1, maxReworks: task === 'T2' ? 1 : 0, maxClaudeCalls: task === 'T2' ? 4 : 3, globalBudget: { file: ledger, limit: 7 }, tests: [{ executable: process.execPath, args: [verifier] }], mockScenario: 'pass' };
    json(path.join(directory, 'config.json'), config);
    const fixture = { task, version, directory, source, verifier, verifierHash: sha(fs.readFileSync(verifier)), seedHash: sha(JSON.stringify(initialFiles)), sourceSnapshot: readProject(source), branches, requirements: requirements[task] };
    json(path.join(directory, 'fixture.json'), fixture); fixtures.push({ task, directory, source, version });
  }
  json(batchFile, { root, authorization, fixtures, build }); console.log(JSON.stringify({ prepared: root, calls: 0 }));
} else if (mode === 'run') {
  verifyBuild();
  const batch = JSON.parse(fs.readFileSync(batchFile)), task = process.argv[4]; assert.ok(tasks.includes(task));
  const index = tasks.indexOf(task), directory = path.join(root, task);
  for (const previous of tasks.slice(0, index)) { const p = JSON.parse(fs.readFileSync(path.join(root, previous, 'result.json'))); assert.equal(p.behaviorConclusion, 'PASS', 'Previous task blocked'); }
  assert.equal(fs.existsSync(path.join(directory, 'run.json')), false, 'Only one Run per task; never replay');
  const fixture = JSON.parse(fs.readFileSync(path.join(directory, 'fixture.json'))), config = JSON.parse(fs.readFileSync(path.join(directory, 'config.json')));
  assert.deepEqual(batch.authorization.maximum, { claude: 7, codex: 3 });
  assert.deepEqual(batch.authorization.runs, tasks);
  assert.equal(config.maxLoops, task === 'T2' ? 2 : 1);
  assert.equal(config.maxReworks, task === 'T2' ? 1 : 0);
  assert.equal(config.maxClaudeCalls, task === 'T2' ? 4 : 3);
  assert.equal(config.globalBudget.limit, 7);
  assert.equal(config.globalBudget.file, path.join(root, 'authorized-cc-budget.json'));
  const prepared = JSON.parse(fs.readFileSync(path.join(root, 'preflight.json')));
  assert.equal(sha(fs.readFileSync(fileURLToPath(import.meta.url))), prepared.evidenceHashes['validation/phase3/run-real-t2-t3-final.mjs'], 'Execution harness changed after preparation');
  assert.equal(readProject(fixture.source).digest, fixture.sourceSnapshot.digest);
  assert.equal(sha(fs.readFileSync(fixture.verifier)), fixture.verifierHash);
  const goal = requirements[task] + '\n执行边界：只规划一个正式任务；T1 唯一模块 game-app，T2/T3 唯一计划模块 combat。只完成本固定需求，不新增模块或测试文件；不批准或应用 Delivery，不提交、合并、推送。';
  let store;
  try { store = await createRun(config, fixture.source, goal); }
  catch (error) { json(path.join(directory, 'prepare-failure.json'), { error: error.message, runId: error.runId ?? null }); throw error; }
  json(path.join(directory, 'run.json'), { runId: store.id, runDir: store.dir, createdAt: new Date().toISOString(), config });
  const started = Date.now();
  const raw = async (executable, args, options) => {
    const number = store.load().claudeCalls ?? 0, worker = executable === process.execPath;
    const file = path.join(directory, `native-${worker ? 'codex-' + store.load().loops : 'claude-' + number}.public.jsonl`);
    const fd = fs.openSync(file, 'wx');
    const publicEvent = event => {
      if (event.type === 'stream_event' && event.event?.content_block?.type === 'thinking') return null;
      if (event.type === 'stream_event' && /thinking|signature/.test(event.event?.delta?.type ?? '')) return null;
      if (event.message?.content) event.message.content = event.message.content.filter(block => !['thinking', 'redacted_thinking'].includes(block.type));
      if (event.type === 'system' && event.subtype === 'init') return { type: 'system', subtype: 'init', session_id: event.session_id, model: event.model, cwd: event.cwd, permissionMode: event.permissionMode };
      return event;
    };
    try { return await runProcess(executable, args, { ...options, onLine(line) { const event = publicEvent(JSON.parse(line)); if (event) fs.writeSync(fd, JSON.stringify(event) + '\n'); options.onLine?.(line); } }); }
    finally { fs.fsyncSync(fd); fs.closeSync(fd); store.audit('real-regression-native-evidence', { file, hash: sha(fs.readFileSync(file)), hiddenThinkingOmitted: true }); }
  };
  const real = new RealAgents(config, raw);
  function guardScope(state) {
    const current = readProject(state.workspace), baseline = fixture.sourceSnapshot;
    const allowed = task === 'T1' ? ['app/hud.css', 'docs/project-context/modules/game-app.md'] : task === 'T2' ? ['combat/core.js', 'world/geometry.js', 'docs/project-context/modules/combat.md', 'docs/project-context/modules/world.md'] : ['docs/project-context/modules/combat.md'];
    for (const name of new Set([...Object.keys(current.files), ...Object.keys(baseline.files)])) if (current.files[name] !== baseline.files[name] && !allowed.includes(name)) throw new FlowError('safety', 'Fixed regression scope exceeded: ' + name);
    assert.equal(sha(fs.readFileSync(fixture.verifier)), fixture.verifierHash);
  }
  const guarded = {
    executionMode: 'native',
    async plan(state, s, signal) {
      const output = await real.plan(state, s, signal);
      if (output.humanDecision || output.tasks.length !== 1 || JSON.stringify(output.tasks[0]?.moduleIds) !== JSON.stringify([task === 'T1' ? 'game-app' : 'combat'])) throw new FlowError('safety', 'Fixed regression requires one relevant task; actual Plan preserved');
      guardScope(state); return output;
    },
    async execute(state, s, signal) {
      const baseline = `real-model-before-${state.loops}.json`; await captureBaseline(s, state, baseline, signal);
      const output = await real.execute(state, s, signal); guardScope(state);
      const actual = { output, snapshot: readProject(state.workspace), diff: await baselineDiff(s, state, baseline, signal) };
      json(path.join(directory, `codex-actual-${state.loops}.json`), actual);
      s.audit("real-regression-model-output", { loop: state.loops, file: path.join(directory, `codex-actual-${state.loops}.json`), fileHash: sha(fs.readFileSync(path.join(directory, `codex-actual-${state.loops}.json`))), snapshot: actual.snapshot.digest, origin: "real-Codex-Execute-before-test-overlay" });
      if (task === 'T2' && state.loops === 1) {
        const before = readProject(state.workspace);
        writeFixture(state.workspace, 'combat/core.js', 'export const reach = 4;\nexport const unit = "m";\n');
        writeFixture(state.workspace, 'world/geometry.js', 'export const wallX = 10;\nexport const unit = "cm";\n// fixed cross-module fixture\n');
        const after = readProject(state.workspace);
        const origin = { task, origin: 'test-injected-wrong-candidate', provenance: 'test-injected', autonomousModelError: false, files: ['combat/core.js', 'world/geometry.js'], before, after, candidateDiff: await baselineDiff(s, state, baseline, signal), originalModelEvidence: path.join(directory, 'codex-actual-1.json') };
        json(path.join(directory, 'test-injected-candidate.json'), origin); s.audit('regression-candidate-origin', origin);
      }
      return output;
    },
    async review(state, s, signal) {
      if (task === 'T2') {
        s.audit('regression-review-stage', assertT2ReviewStage(state, s));
      }
      const output = await real.review(state, s, signal); guardScope(state); return output;
    }
  };
  console.log(JSON.stringify({ task, runId: store.id, runDir: store.dir, status: 'starting-real-controller' }));
  let state, thrown = null;
  try { state = await drive(store, guarded); } catch (error) { thrown = error.message; state = store.load(); }
  const events = auditRecords(store.file('audit.jsonl')), usage = runUsage(store), sourceUnchanged = readProject(fixture.source).digest === fixture.sourceSnapshot.digest;
  const receipts = fs.readdirSync(store.file('context')).filter(n => n.endsWith('.reads.jsonl')).flatMap(n => fs.readFileSync(store.file('context/' + n), 'utf8').split('\n').filter(Boolean).map(v => JSON.parse(v)));
  const manifests = fs.readdirSync(store.file('context')).filter(n => n.endsWith('.manifest.json')).map(n => JSON.parse(fs.readFileSync(store.file('context/' + n))));
  const counts = { claude: state.claudeCalls ?? 0, codex: state.loops, reworks: state.totalReworks ?? 0 };
  const result = { task, version: fixture.version, runId: store.id, runDir: store.dir, source: fixture.source, workspace: state.workspace, behaviorConclusion: state.phase === 'completed' && state.evidence?.passed && sourceUnchanged && !thrown ? 'PASS' : 'FAIL', observationConclusion: usage.complete ? 'PASS' : 'PARTIAL', phase: state.phase, reason: state.reason, thrown, durationMs: Date.now() - started, counts, sourceUnchanged, actualPaidCalls: counts.claude + counts.codex, usage, readKinds: Object.fromEntries([...new Set(receipts.map(r => r.kind))].map(k => [k, receipts.filter(r => r.kind === k).length])), manifests: manifests.map(m => ({ callId: m.callId, phase: m.phase, version: m.version, freshness: m.navigation?.freshness, prompt: m.prompt, moduleIds: m.moduleIds, suppliedPaths: m.moduleDocumentPaths })), tasks: state.tasks, independentChecks: events.filter(e => e.event === 'independent-check').map(e => e.data), reviews: events.filter(e => e.event === 'review').map(e => e.data), normalizedReferences: events.filter(e => e.event === 'context-review-references').map(e => e.data), agentChanges: events.filter(e => e.event === 'agent-finish').map(e => e.data), finalSnapshot: readProject(state.workspace), evidence: { audit: store.file('audit.jsonl'), manifests: store.file('context'), publicNativeStreams: directory, finalDiff: state.evidence?.taskDiff ?? state.evidence?.diff }, injection: task === 'T2' ? path.join(directory, 'test-injected-candidate.json') : null, note: 'Real native Agent data only; null stays unknown. Read coverage cannot prove all file I/O. No automatic delivery approval/application.' };
  json(path.join(directory, 'result.json'), result);
  console.log(JSON.stringify({ task, runId: store.id, behavior: result.behaviorConclusion, observation: result.observationConclusion, phase: state.phase, reason: state.reason, counts, tokens: usage.reported, readKinds: result.readKinds }));
  if (result.behaviorConclusion !== 'PASS') process.exitCode = 2;
} else throw new Error('Usage: run-real-t2-t3-final.mjs prepare [root] | run root T2|T3');
