import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { findRun, usageReport, usageTable } from '../src/usage-report.js';

const root = path.resolve('.validation', 'usage-report-' + randomUUID().slice(0, 8));
function run(id: string, parent: string, calls: object[], extra: { event: string; data: object }[] = []) {
  const dir = path.join(root, parent, 'runs', id); fs.mkdirSync(dir, { recursive: true });
  const events = [...calls.map(data => ({ event: 'agent-usage', data })), ...extra].map((event, index) => ({ time: new Date(Date.UTC(2026, 9, 12, 0, index)).toISOString(), ...event }));
  fs.writeFileSync(path.join(dir, 'audit.jsonl'), events.map(event => JSON.stringify(event)).join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ id, goal: 'Fixture goal', phase: 'completed', tasks: [{ id: 'a' }, { id: 'b' }], completedTaskIds: ['a', 'b'], loops: 3, totalReworks: 1 }));
  return dir;
}
let sequence = 0;
const call = (agent: string, phase: string, taskId: string | null, resumed: boolean, tokens: (number | null)[], source = agent === 'codex' ? 'codex-sdk-0.161.0-turn.completed' : 'claude-cli-stream-json', status = 'success') =>
  ({ callId: randomUUID(), agent, phase, taskId, resumed, source, status, startedAt: new Date(Date.UTC(2026, 9, 12, 1, sequence++)).toISOString(), inputTokens: tokens[0], cacheReadTokens: tokens[1], cacheCreationTokens: tokens[2] ?? null, outputTokens: tokens[3] ?? 1 });

test('usage report normalizes protocols, restores old Codex Thread totals and counts flow events', () => {
  const id = randomUUID(), dir = run(id, 'instance', [
    call('claude', 'plan', null, false, [10, 100, 20, 5]),
    call('codex', 'execute', 'a', false, [1000, 800, null, 50]),
    call('codex', 'execute', 'a', true, [2500, 2100, null, 80]),
    call('codex', 'execute', 'b', true, [null, null, null, null], undefined, 'failed'),
    call('codex', 'execute', 'b', true, [400, 300, null, 9], 'codex-sdk-0.161.0-turn.completed-thread-delta'),
    call('codex', 'review', 'a', true, [700, 600, null, 7]),
    call('claude', 'review', 'b', true, [5, 50, 0, 3])
  ], [{ event: 'review', data: { verdict: 'rework' } }, { event: 'review', data: { verdict: 'pass' } }, { event: 'review', data: { verdict: 'pass' } }, { event: 'execution-session-rotated', data: {} }, { event: 'rework-replan', data: {} }]);
  const report = usageReport(dir);
  assert.deepEqual(report.tokens.byPhase.plan, { calls: 1, counted: 1, input: 130, cached: 100, output: 5 });
  // 1000 fresh, then 2500 - 1000 from the running total, then a recorded delta of 400.
  assert.deepEqual(report.tokens.byPhase.execute, { calls: 4, counted: 3, input: 2900, cached: 2400, output: 89 });
  // A resumed decision Thread without an earlier total cannot be restored and is left out.
  assert.deepEqual(report.tokens.byPhase.review, { calls: 2, counted: 1, input: 55, cached: 50, output: 3 });
  assert.deepEqual(report.calls, { total: 7, failed: 1, interrupted: 0, withoutUsage: 1, unresolvedThreadTotals: 1 });
  assert.deepEqual([report.tokens.total.input, report.cachedPercent, report.inputPerCompletedTask], [3085, 82.7, 1543]);
  assert.deepEqual(report.executionsPerTask, { tasks: 2, average: 2, max: 2 });
  assert.deepEqual([report.reviews, report.sessionRotations, report.reworkReplans], [{ rework: 1, pass: 2 }, 1, 1]);
  const table = usageTable([report, report]).split('\n');
  assert.match(table[0]!, new RegExp(`^Run\\s+${id.slice(0, 8)}\\s+${id.slice(0, 8)}`));
  assert.ok(table.some(line => /^输入合计\s+3,085\s+3,085/.test(line)));
});

test('findRun picks the copy with the longest audit and reports a missing Run', () => {
  const id = randomUUID();
  run(id, 'copy', [call('claude', 'plan', null, false, [1, 1, 1, 1])]);
  const full = run(id, path.join('instances', 'dev'), [call('claude', 'plan', null, false, [1, 1, 1, 1]), call('claude', 'review', 'a', true, [1, 1, 1, 1])]);
  assert.equal(findRun(root, id), full);
  assert.throws(() => findRun(root, randomUUID()), /not found/);
});
