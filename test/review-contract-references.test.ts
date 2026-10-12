import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { regressionFixture, writeFixture } from '../scripts/context-regression-fixtures.js';
import { normalizeContractReferences, contextReviewProblems, reviewContractCatalog } from '../src/context-review.js';
import { driveWithUserAcceptance as drive } from './helpers/accepted-flow.js';
import { stampContext } from '../src/project-context.js';
import { auditRecords } from '../src/context-trust.js';
import { RealAgents } from '../src/real-agents.js';
import type { Review } from '../src/schema.js';

const originalBytes = fs.readFileSync(new URL('../../test/fixtures/t1-original-review.json', import.meta.url));
const original = JSON.parse(originalBytes.toString('utf8')) as { review: Review; source: string; runId: string };
const catalog = [{ id: 'hud', path: 'docs/project-context/contracts/hud.md' }, { id: 'geometry', path: 'docs/project-context/contracts/geometry.md' }];
const folder = () => process.platform === 'win32' ? `D:/pa-rev/${randomUUID().slice(0, 8)}` : path.resolve('.validation', `review-${randomUUID()}`);

test('exact IDs and full loaded relative paths normalize, mixed references deduplicate without changing actual historical Review', () => {
  for (const references of [['hud'], [catalog[0]!.path], ['hud', catalog[0]!.path, 'hud']]) {
    const result = normalizeContractReferences(references, catalog);
    assert.deepEqual(result.checkedContracts, ['hud']); assert.deepEqual(result.problems, []);
  }
  const before = JSON.stringify(original.review);
  const result = normalizeContractReferences(original.review.contextReview!.checkedContracts, catalog);
  assert.deepEqual(result.checkedContracts, ['hud', 'geometry']); assert.ok(result.mappings.every(row => row.via === 'exact-relative-path'));
  assert.equal(JSON.stringify(original.review), before);
  assert.deepEqual(fs.readFileSync(new URL('../../test/fixtures/t1-original-review.json', import.meta.url)), originalBytes);
});

test('filenames, titles, foreign paths, traversal, case changes and unknown IDs cannot impersonate a loaded contract', () => {
  for (const reference of ['hud.md', 'HUD title', '../contracts/hud.md', 'docs/project-context/contracts/../contracts/hud.md', 'D:/foreign/docs/project-context/contracts/hud.md', 'docs/other/contracts/hud.md', 'docs/project-context/contracts/HUD.md', ' hud ', 'unknown']) {
    const result = normalizeContractReferences([reference], catalog);
    assert.deepEqual(result.checkedContracts, []); assert.ok(result.problems.length, reference);
  }
  assert.ok(normalizeContractReferences(['hud'], [{ id: 'hud', path: '../hud.md' }]).problems.length);
  assert.ok(normalizeContractReferences(['hud'], [{ ...catalog[0]!, valid: false }]).problems.length);
});

test('ambiguous IDs or duplicate conflicting paths reject; identical baseline/current bindings are allowed', () => {
  for (const conflicting of [[...catalog, { id: 'hud', path: 'docs/project-context/contracts/other.md' }], [...catalog, { id: 'other', path: catalog[0]!.path }]]) {
    const result = normalizeContractReferences(['hud', catalog[0]!.path], conflicting);
    assert.deepEqual(result.checkedContracts, []); assert.ok(result.problems.length);
  }
  assert.deepEqual(normalizeContractReferences(['hud'], [...catalog, catalog[0]!]).problems, []);
});

async function replay(references = original.review.contextReview!.checkedContracts, forge = false, userAccept = true) {
  const fixture = await regressionFixture(folder(), 'T1');
  const raw: Review = structuredClone(original.review); raw.contextReview!.checkedContracts = [...references];
  const rawDrive = (await import('../src/controller.js')).drive;
  const result = await (userAccept ? drive : rawDrive)(fixture.store, {
    executionMode: 'native',
    async plan() { return { humanDecision: null, tasks: [{ id: 'T1-hud-style', moduleIds: ['game-app'], instruction: '固定 Mock 重放历史协议失败，修正 HUD', acceptance: ['外部固定验收通过'] }] }; },
    async execute(state) {
      writeFixture(state.workspace, 'app/hud.css', '.hud { font-size: 16px; gap: 8px; display: flex; }\n');
      stampContext(state.workspace, 'game-app', ['app/hud.css']);
      if (forge) { const p = path.join(state.workspace, catalog[0]!.path); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('status: proposed', 'status: accepted')); }
      return { mode: 'native' as const, summary: '明确标记 Mock，重放原始真实 Review，未调用真实 Agent' };
    },
    async review() { return raw; }
  });
  return { fixture, result, raw, events: auditRecords(fixture.store.file('audit.jsonl')) };
}

test('Controller preserves original T1 decision receipt without machine normalization', async () => {
  const before = JSON.stringify(original.review), f = await replay();
  assert.equal(f.result.phase, 'completed', f.result.reason); assert.equal(f.result.evidence!.userAccepted, true);
  const saved = f.events.find(e => e.event === 'review')!;
  assert.deepEqual(saved.data, original.review); assert.equal(JSON.stringify(original.review), before);
  assert.deepEqual(f.result.evidence!.decisionReview, original.review);
  assert.equal(f.events.some(e => e.event === 'context-review-references'), false);
  const normalized = normalizeContractReferences(original.review.contextReview!.checkedContracts, catalog);
  assert.deepEqual(normalized.checkedContracts, ['hud', 'geometry']); assert.deepEqual(normalized.problems, []);
  // Reading the prior Run does not schedule, resume or rewrite it under new code.
  const oldState = path.join(path.dirname(original.source), 'r/runs', original.runId, 'state.json');
  if (fs.existsSync(oldState)) { const old = JSON.parse(fs.readFileSync(oldState, 'utf8')); assert.equal(old.phase, 'paused'); assert.equal(old.claudeCalls, 2); assert.equal(old.loops, 1); }
});

test('missing contract references remain visible for decision and user judgment', async () => {
  for (const references of [[], ['geometry'], ['docs/other/contracts/hud.md']]) {
    const f = await replay(references);
    assert.equal(f.result.phase, 'completed'); assert.ok(!f.events.some(e => e.event === 'review-vetoed'));
    assert.ok(contextReviewProblems(f.result.evidence!.contextReport, f.raw).some(p => p.includes('hud')));
  }
});

test('forged document status stays untrusted while decision receipt waits for user acceptance', async () => {
  const f = await replay([catalog[0]!.path], true, false);
  assert.equal(f.result.phase, 'paused');
  assert.equal(f.result.evidence!.decisionReview!.verdict,'pass');
  assert.equal(f.result.evidence!.userAccepted,undefined);
  assert.ok(f.result.evidence!.contextReport!.findings.some(finding => finding.code === 'CONFIRMATION_UNVERIFIABLE' && finding.origin === 'task'));
  assert.ok(contextReviewProblems(f.result.evidence!.contextReport, f.raw).length);
});

test('actual RealAgents Review assembly declares precise IDs, live title/path/status mappings and required subset without fabricated checks', async () => {
  const f = await replay(), state = f.fixture.store.load(); state.taskIndex = 0; f.fixture.store.save(state);
  let prompt: any;
  const agents = new RealAgents(f.fixture.config, async (_executable, _args, options) => {
    prompt = JSON.parse(options.input!);
    options.onLine!(JSON.stringify({ type: 'result', is_error: false, structured_output: structuredClone(original.review) }));
    return { exitCode: 0, stdout: '', stderr: '' };
  });
  const returned = await agents.review(state, f.fixture.store, new AbortController().signal);
  assert.deepEqual(returned, original.review);
  assert.match(prompt.contextInstruction, /checkedContracts 若提供.*精确 ID/);
  const hud = prompt.contractReferences.find((row: any) => row.id === 'hud'), geometry = prompt.contractReferences.find((row: any) => row.id === 'geometry');
  assert.equal(hud.title, 'hud'); assert.equal(hud.path, catalog[0]!.path); assert.equal(hud.status, 'proposed'); assert.equal(hud.required, true);
  assert.equal(geometry.required, false); assert.equal(geometry.status, 'proposed');
  assert.deepEqual(prompt.contractReferences, reviewContractCatalog(state));
});
