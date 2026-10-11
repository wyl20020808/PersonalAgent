import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun, drive } from '../src/controller.js';
import { captureBaseline, baselineDiff, reviewEvidence } from '../src/incremental.js';
import { git } from '../src/workspace.js';
import { ClaudeCodeDecisionAgent } from '../src/claude-code-decision-agent.js';
import type { Config } from '../src/schema.js';
import type { Evidence } from '../src/store.js';
import type { runProcess } from '../src/process.js';

async function fixture() {
  const dir = path.resolve('.validation', 'token-' + randomUUID().slice(0, 8)), source = path.join(dir, 'source');
  fs.mkdirSync(source, { recursive: true });
  for (const name of ['old.txt', 'task.txt']) fs.writeFileSync(path.join(source, name), 'original\n');
  await git(source, ['init']); await git(source, ['add', '.']);
  await git(source, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
  fs.writeFileSync(path.join(source, 'old.txt'), 'PREEXISTING_SENTINEL\n' + '旧材料\n'.repeat(20000));
  const config: Config = { mode: 'real', mockScenario: 'pass', executionMode: 'native', projectMode: 'direct', directAuthorization: { projectPath: source, acknowledgedAt: new Date().toISOString() }, allowedRepositories: [source], runtimeDir: path.join(dir, 'runtime'), claudeExecutable: 'NEVER-PAID', timeoutMs: 10000, tests: [], decisionAgent: { backend: 'claude-code', model: 'sonnet' } };
  return { source, config, store: await createRun(config, source, 'Implement only task.txt') };
}
const signal = () => new AbortController().signal;

test('dirty Git lifecycle sends only changed patch sections; repeat recovery never reviews a recorded pass', async () => {
  const f = await fixture(); let reviews = 0, executions = 0;
  const agents = { executionMode: 'native' as const, async plan() { return { humanDecision: null, tasks: [{ id: 'edit', instruction: 'Edit task.txt', acceptance: ['after'] }] }; }, async execute() { executions++; fs.writeFileSync(path.join(f.source, 'task.txt'), 'after\n'); return { mode: 'native' as const, summary: 'Local protocol fixture' }; }, async review(state: ReturnType<typeof f.store.load>) { reviews++; const sent = JSON.stringify(reviewEvidence(state.evidence, f.store)); assert.ok(sent.length < 7000); assert.ok(!sent.includes('PREEXISTING_SENTINEL')); assert.match(sent, /task.txt/); assert.match(state.evidence!.diff, /PREEXISTING_SENTINEL/); return { verdict: 'pass' as const, reason: 'Local fixture verified actual file' }; } };
  const done = await drive(f.store, agents); assert.equal(done.phase, 'completed', done.reason);
  // Eight explicit resume requests cannot rerun an already completed task.
  for (let i = 0; i < 8; i++) assert.equal((await drive(f.store, agents, '继续')).phase, 'completed');
  assert.equal(reviews, 1); assert.equal(executions, 1); assert.equal(done.claudeSessionId, null);
  assert.ok(!fs.existsSync(f.store.file('snapshot-objects')));
});

test('checkpoint persists across recovery, detects edits inside a dirty file and a return to HEAD', async () => {
  const f = await fixture(), state = f.store.load(), name = 'round-1-baseline.json';
  await captureBaseline(f.store, state, name, signal());
  const checkpoint = f.store.file('git-review-round-1.json'), bytes = fs.readFileSync(checkpoint, 'utf8');
  assert.ok(bytes.length < 1500); assert.ok(!bytes.includes('PREEXISTING_SENTINEL'));
  fs.writeFileSync(path.join(f.source, 'old.txt'), 'changed dirty file\n');
  await captureBaseline(f.store, state, name, signal()); assert.equal(fs.readFileSync(checkpoint, 'utf8'), bytes);
  assert.match((await baselineDiff(f.store, state, name, signal()))!, /changed dirty file/);
  fs.writeFileSync(path.join(f.source, 'old.txt'), 'original\n');
  assert.match((await baselineDiff(f.store, state, name, signal()))!, /Previously dirty tracked file now matches HEAD/);
  const corrupted = JSON.parse(bytes); corrupted.sections = {}; fs.writeFileSync(checkpoint, JSON.stringify(corrupted));
  await assert.rejects(baselineDiff(f.store, state, name, signal()), /checkpoint mismatch/);
});

test('legacy unscoped evidence stays accessible without injecting old diff; UTF-8 excerpts obey byte limits', async () => {
  const f = await fixture();
  const evidence: Evidence = { diff: 'PREEXISTING_SENTINEL' + 'x'.repeat(200000), status: 'M old.txt', head: 'head', snapshotDigest: 'digest', tests: [], executorExitCode: 0, passed: false, issues: ['Critical warning'], verificationScope: 'limited tracked Git observations' };
  const legacy = reviewEvidence(evidence, f.store) as any;
  assert.equal(legacy.roundDiff, ''); assert.equal(legacy.unscopedDiff, true); assert.equal(legacy.diffOmitted, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(legacy.evidenceFile, 'utf8')), evidence);
  evidence.roundDiff = 'diff --git a/new.ts b/new.ts\n+' + '新'.repeat(20000);
  evidence.taskDiff = evidence.roundDiff + '\n+task';
  const bounded = reviewEvidence(evidence, f.store) as any;
  assert.ok(Buffer.byteLength(bounded.roundDiff) <= 16000); assert.ok(Buffer.byteLength(bounded.taskDiff) <= 8000);
  assert.ok(!bounded.roundDiff.includes('\uFFFD')); assert.equal(bounded.diffOmitted, true);
  assert.deepEqual(bounded.issues, evidence.issues); assert.deepEqual(bounded.tests, evidence.tests);
});

test('Claude decision uses native early compaction while resuming the same Session and keeping user settings', async () => {
  const f = await fixture(), state = f.store.load(), sessions: string[] = [];
  const run: typeof runProcess = async (_program, args, options) => {
    assert.equal(args[args.indexOf('--autocompact') + 1], '100k');
    assert.equal(options.env!.CLAUDE_CODE_AUTO_COMPACT_WINDOW, '100000');
    const id = args[args.indexOf(args.includes('--resume') ? '--resume' : '--session-id') + 1]!;
    sessions.push(id); options.onLine?.(JSON.stringify({ type: 'system', subtype: 'init', session_id: id }));
    options.onLine?.(JSON.stringify({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'auto', pre_tokens: 110000 } }));
    options.onLine?.(JSON.stringify({ type: 'result', session_id: id, structured_output: { ok: true } }));
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const adapter = new ClaudeCodeDecisionAgent(f.config, run), before = process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
  for (let i = 0; i < 2; i++) await adapter.structured({ state, store: f.store, signal: signal(), role: 'plan', phase: 'plan', schema: { type: 'object', properties: { ok: { const: true } }, required: ['ok'], additionalProperties: false }, prompt: '{}', workspace: fs.realpathSync(f.source), runId: state.id, taskId: null, timeoutMs: 10000 });
  assert.equal(sessions[0], sessions[1]); assert.equal(f.store.load().claudeCalls, 2); assert.equal(f.store.load().decisionSession?.sessionId, sessions[0]);
  assert.equal(process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, before);
});
