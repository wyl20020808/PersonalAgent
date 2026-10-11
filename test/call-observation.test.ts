import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { regressionFixture } from '../scripts/context-regression-fixtures.js';
import { runFixedRegression } from '../scripts/run-context-regression.js';
import { CallObservation, codexObservation, runUsage, redactCommand } from '../src/call-observation.js';
import { RealAgents } from '../src/real-agents.js';
import { callContext, recordContextPrompt } from '../src/context-navigation.js';
import { auditRecords } from '../src/context-trust.js';
import { contextHash } from '../src/project-context.js';
import { FlowError } from '../src/failure.js';

const root = process.platform === 'win32' ? `D:/pa-pc3/${randomUUID().slice(0, 8)}` : path.resolve('.validation', `pc3-${randomUUID()}`);
console.log(`Phase3 deterministic evidence root: ${root}`);
const folder = () => path.join(root, randomUUID().slice(0, 8));
const lines = (file: string) => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));

test('shell credential flags, quoted arguments and assignments are redacted without interpreting paths', () => {
  const command = redactCommand('cat combat/core.js --password "PRIVATE SECRET" --api-key secret123 --token=abcdef authorization=credential');
  for (const value of ['PRIVATE', 'secret123', 'abcdef', 'credential']) assert.equal(command.includes(value), false);
  assert.ok(command.includes('combat/core.js'));
});

test('supplied receipts match actual prompt; paths/catalog never become confirmed reads', async () => {
  const f = await regressionFixture(folder(), 'T1'), state = f.store.load();
  const navigation = await callContext(state, f.store, 'plan', new AbortController().signal), prompt = JSON.stringify({ context: navigation, goal: state.goal });
  recordContextPrompt(f.store, navigation, prompt);
  const call = new CallObservation(state, f.store, 'plan', prompt, navigation);
  call.finish('success');
  const reads = lines(f.store.file(`context/${call.usage.callId}.reads.jsonl`));
  assert.ok(reads.some(row => row.kind === 'supplied' && row.kind !== 'confirmed-read'));
  const overview = reads.find(row => row.kind === 'supplied' && row.jsonPointer.endsWith('/overview/content'));
  assert.equal(overview.sha256, contextHash(navigation!.overview.content));
  assert.equal(reads.some(row => row.kind === 'confirmed-read'), false);
  assert.equal(call.usage.inputTokens, null); assert.equal(call.usage.modelRequests, null);
  const finish = auditRecords(f.store.file('audit.jsonl')).find(event => event.event === 'observation-call-finish')!;
  assert.equal(finish.data.readsHash, contextHash(fs.readFileSync(finish.data.readsFile, 'utf8')));
});

test('Claude Read requires paired successful structured text result and safe actual range; shell stays shell', async () => {
  const f = await regressionFixture(folder(), 'T1'), call = new CallObservation(f.store.load(), f.store, 'plan', '{}');
  const use = (id: string, name: string, input: object) => call.observe({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });
  const result = (id: string, extra: object = {}, is_error = false) => call.observe({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'PRIVATE CONTENT NEVER LOGGED', is_error }] }, ...extra });
  use('read', 'Read', { file_path: 'combat/core.js', offset: 100, limit: 999 });
  const file = { filePath: 'combat/core.js', content: 'private', startLine: 2, numLines: 1 };
  result('read', { tool_use_result: { type: 'text', file } }); result('read', { tool_use_result: { type: 'text', file } });
  use('failed', 'Read', { file_path: 'combat/core.js' }); result('failed', { tool_use_result: { type: 'text', file } }, true);
  use('unknown', 'Read', { file_path: 'combat/core.js' }); result('unknown');
  use('escape', 'Read', { file_path: '../credentials.json' }); result('escape', { tool_use_result: { type: 'text', file: { ...file, filePath: '../credentials.json' } } });
  use('secret', 'Read', { file_path: '.env' }); result('secret', { tool_use_result: { type: 'text', file: { ...file, filePath: '.env' } } });
  use('image', 'Read', { file_path: 'combat/core.js' }); result('image', { tool_use_result: { type: 'image', file } });
  use('bash', 'Bash', { command: 'Get-Content combat/core.js; $password=SECRET_VALUE' }); result('bash');
  use('mcp', 'mcp__filesystem__read_file', { path: 'combat/core.js' }); result('mcp'); result('unpaired');
  call.finish('failed');
  const raw = fs.readFileSync(f.store.file(`context/${call.usage.callId}.reads.jsonl`), 'utf8'), rows = lines(f.store.file(`context/${call.usage.callId}.reads.jsonl`));
  assert.equal(rows.filter(row => row.kind === 'confirmed-read').length, 1);
  assert.deepEqual(rows.find(row => row.kind === 'confirmed-read').range, { startLine: 2, lineCount: 1 });
  assert.equal(rows.filter(row => row.kind === 'read-failed').length, 1); assert.equal(rows.filter(row => row.kind === 'shell-command').length, 2);
  assert.ok(rows.filter(row => row.kind === 'unobservable').length >= 5);
  assert.equal(raw.includes('SECRET_VALUE'), false); assert.equal(raw.includes('PRIVATE CONTENT'), false);
});

test('Claude usage deduplicates sibling messages and stream deltas; resumed aggregates never recounted', async () => {
  const f = await regressionFixture(folder(), 'T1'), call = new CallObservation(f.store.load(), f.store, 'review', '{}', undefined, true);
  const event = (id: string, input: number, parent?: string) => ({ type: 'assistant', parent_tool_use_id: parent, message: { id, model: 'fixture-model', usage: { input_tokens: input, output_tokens: 999, cache_read_input_tokens: 10, cache_creation_input_tokens: 2 }, content: [] } });
  call.observe(event('a', 100)); call.observe(event('a', 100));
  call.observe({ type: 'stream_event', event: { type: 'message_delta', usage: { output_tokens: 7 } } });
  call.observe({ type: 'stream_event', event: { type: 'message_delta', usage: { output_tokens: 9 } } });
  call.observe(event('a', 100)); // Never overwrite the streamed output with the assistant placeholder.
  call.observe(event('b', 50));
  call.observe({ type: 'stream_event', event: { type: 'message_delta', usage: { output_tokens: 3 } } });
  call.observe({ ...event('old', 999999), isReplay: true });
  call.observe({ type: 'result', usage: { input_tokens: 999999, output_tokens: 999999 } });
  const usage = call.finish('success');
  assert.equal(usage.inputTokens, 150); assert.equal(usage.outputTokens, 12); assert.equal(usage.cacheReadTokens, 20); assert.equal(usage.cacheCreationTokens, 4); assert.equal(usage.modelRequests, 2); assert.equal(usage.completeness, 'partial');
  assert.equal(runUsage(f.store).controllerCalls, 1);
  const next = new CallObservation(f.store.load(), f.store, 'review', '{}', undefined, true); next.finish('failed');
  assert.equal(runUsage(f.store).controllerCalls, 2); assert.equal(runUsage(f.store).reported.claude.inputTokens, null);
});

test('Codex typed command and usage mapping preserves cache writes, unknown model/requests, negatives and no Read inference', async () => {
  const f = await regressionFixture(folder(), 'T1'), call = new CallObservation(f.store.load(), f.store, 'execute', '{}');
  const command = codexObservation({ type: 'item.completed', item: { id: 'shell', type: 'command_execution', command: 'cat combat/core.js; authorization=SECRET', status: 'failed', exit_code: -1, aggregated_output: 'PRIVATE' } })!;
  call.observe(command);
  const usage = { input_tokens: 100, output_tokens: 10, cached_input_tokens: 80, cache_write_input_tokens: 5, reasoning_output_tokens: 3 };
  call.observe({ type: 'turn.completed', usage }); call.observe({ type: 'turn.completed', usage });
  call.observe({ type: 'item.completed', item: { id: 'not-read', type: 'file_change', changes: [{ path: 'combat/core.js' }] } });
  const result = call.finish('success');
  assert.equal(result.inputTokens, 100); assert.equal(result.cacheReadTokens, 80); assert.equal(result.cacheCreationTokens, 5); assert.equal(result.model, null); assert.equal(result.modelRequests, null);
  const rows = lines(f.store.file(`context/${result.callId}.reads.jsonl`)); assert.equal(rows.find(row => row.kind === 'shell-command').exitCode, -1); assert.equal(rows.some(row => row.kind === 'confirmed-read'), false); assert.equal(JSON.stringify(command).includes('PRIVATE'), false);
});

test('fresh Claude modelUsage replaces intermediate/main totals; resumed modelUsage stays evidence only', async () => {
  const f = await regressionFixture(folder(), 'T1');
  const modelUsage = { first: { inputTokens: 100, outputTokens: 10, cacheReadInputTokens: 20, cacheCreationInputTokens: 3 }, helper: { inputTokens: 40, outputTokens: 5, cacheReadInputTokens: 7, cacheCreationInputTokens: 2 } };
  const fresh = new CallObservation(f.store.load(), f.store, 'plan', '{}');
  fresh.observe({ type: 'assistant', message: { id: 'request', model: 'first', usage: { input_tokens: 100, output_tokens: 1 }, content: [] } });
  fresh.observe({ type: 'result', usage: { input_tokens: 100, output_tokens: 10 }, modelUsage });
  fresh.observe({ type: 'result', usage: { input_tokens: 100, output_tokens: 10 }, modelUsage });
  const result = fresh.finish('success'); assert.equal(result.inputTokens, 140); assert.equal(result.outputTokens, 15); assert.equal(result.cacheReadTokens, 27); assert.equal(result.cacheCreationTokens, 5); assert.equal(result.model, null); assert.deepEqual(result.models, ['first', 'helper']); assert.equal(result.completeness, 'complete');
  const resumed = new CallObservation(f.store.load(), f.store, 'review', '{}', undefined, true);
  resumed.observe({ type: 'result', usage: { input_tokens: 100, output_tokens: 10 }, modelUsage });
  const unknown = resumed.finish('success'); assert.equal(unknown.inputTokens, null); assert.equal(unknown.model, null); assert.equal(unknown.perModel.length, 0); assert.equal(unknown.completeness, 'unknown');
});

for (const kind of ['timeout', 'interrupted', 'invalid-output'] as const) test(`RealAgents injected ${kind} retains usage and never completes missing data`, async () => {
  const f = await regressionFixture(folder(), 'T1'), state = f.store.load(), abort = new AbortController();
  const agents = new RealAgents(f.config, async (_exe, _args, options) => {
    options.onLine!(JSON.stringify({ type: 'assistant', message: { id: 'partial', model: 'fixture-model', usage: { input_tokens: 11, output_tokens: 1 }, content: [] } }));
    if (kind === 'interrupted') abort.abort();
    if (kind !== 'invalid-output') throw new FlowError(kind === 'timeout' ? 'timeout' : 'interrupted', 'Injected local failure');
    options.onLine!(JSON.stringify({ type: 'result', structured_output: { invalid: true } })); return { exitCode: 0, stdout: '', stderr: '' };
  });
  await assert.rejects(agents.plan(state, f.store, abort.signal));
  const usage = runUsage(f.store).calls[0]!; assert.equal(usage.inputTokens, 11); assert.equal(usage.outputTokens, null); assert.equal(usage.status, kind === 'interrupted' ? 'interrupted' : 'failed'); assert.equal(usage.completeness, 'partial');
});

test('partial progress survives missing finish; old Runs and calls remain separate; audit tampering rejected', async () => {
  const f = await regressionFixture(folder(), 'T1'), other = await regressionFixture(folder(), 'T1');
  const call = new CallObservation(f.store.load(), f.store, 'execute', '{}');
  call.observe({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 2 } });
  assert.equal(runUsage(f.store).calls[0]!.status, 'running'); assert.equal(runUsage(f.store).calls[0]!.inputTokens, 10); assert.equal(runUsage(f.store).complete, false);
  assert.equal(runUsage(other.store).controllerCalls, 0); call.finish('interrupted');
  const file = f.store.file('audit.jsonl'); fs.appendFileSync(file, '{"event":"agent-usage","data":{}}\n'); assert.throws(() => runUsage(f.store), /审计|Audit|integrity/);
});

for (const task of ['T1', 'T2', 'T3'] as const) test(`${task} repeatable fixed task uses actual Diff, full contracts and decision/user acceptance (injected Mock)`, async () => {
  const f = await runFixedRegression(folder(), task);
  assert.equal(f.result.metrics.actualPaidCalls, 0); assert.equal(f.result.metrics.finalIndependentPass, true);
  assert.equal(f.result.usage.calls.length, task === 'T2' ? 5 : 3);
  assert.ok(f.result.usage.calls.every(call => call.runId === f.store.id));
  assert.ok(f.reads.every(row => row.runId === f.store.id));
  assert.ok(f.received.every(call => !JSON.stringify(call).includes('export const')));
  if (task === 'T1') { assert.deepEqual(f.state.tasks[0]!.moduleIds, ['game-app']); assert.equal(f.result.metrics.injectedCandidateReworks, 0); assert.ok(f.result.evidence.finalDiff?.includes('font-size: 16px')); }
  if (task === 'T2') {
    assert.deepEqual(f.result.independentChecks.map(check => check.passed), [false, true]); assert.equal(f.result.metrics.injectedCandidateReworks, 1);
    assert.equal(f.result.candidateOrigins[0]!.autonomousModelError, false);
    assert.ok(auditRecords(f.store.file('audit.jsonl')).some(event => event.event === 'review' && event.data.verdict === 'rework'));
    assert.ok(f.reads.some(row => row.kind === 'supplied' && row.jsonPointer.includes('/contracts/')));
    assert.ok(!f.reads.some(row => row.kind === 'confirmed-read' && row.agent === 'codex'));
  }
});

test('T3 main/dev Git versions and stale hashes use fresh workspace knowledge, never historical manifest', async () => {
  const main = await runFixedRegression(folder(), 'T3', 'main', true), dev = await runFixedRegression(folder(), 'T3', 'dev', true);
  assert.notEqual(main.received[0]!.version.head, dev.received[0]!.version.head);
  assert.equal(main.received[0]!.freshness.length, 0); assert.equal(dev.received[0]!.freshness[0].code, 'MODULE_HASH_MISMATCH');
  assert.notEqual(main.received[0]!.workspace, dev.received[0]!.workspace);
  assert.equal(fs.readFileSync(path.join(main.state.workspace, 'combat/core.js'), 'utf8').includes('reach = 2'), true);
  assert.equal(fs.readFileSync(path.join(dev.state.workspace, 'combat/core.js'), 'utf8').includes('reach = 5'), true);
  const before = fs.readFileSync(main.store.file(`context/${main.received[0]!.callId}.manifest.json`), 'utf8');
  const navigation = await callContext(main.state, main.store, 'plan', new AbortController().signal);
  assert.notEqual(navigation!.callId, main.received[0]!.callId); assert.equal(navigation!.workspace, main.received[0]!.workspace);
  assert.equal(fs.readFileSync(main.store.file(`context/${main.received[0]!.callId}.manifest.json`), 'utf8'), before);
});
