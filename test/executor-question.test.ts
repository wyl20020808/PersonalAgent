import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun, drive } from '../src/controller.js';
import { git } from '../src/workspace.js';
import { supervisionBlock } from '../src/automatic-supervision.js';
import { AWAITING_REPLY, USER_QUESTION_MARK, asksUser, questionOptions } from '../src/user-question.js';
import type { Agents } from '../src/adapters.js';
import type { Config } from '../src/schema.js';

const root = path.resolve('.validation', 'executor-question-' + randomUUID().slice(0, 8));

test('only a final message opening with the mark is a question', () => {
  assert.equal(asksUser(`\n${USER_QUESTION_MARK}\n是否删除？\n- 删除\n- 保留`), true);
  assert.equal(asksUser(`已完成。此前曾写 ${USER_QUESTION_MARK}`), false);
  assert.deepEqual(questionOptions(`${USER_QUESTION_MARK}\n涉及：\n- 12 份副本\n\n是否删除？\n- 批准删除\n- 保留\n\n执行 Session：abc`), ['批准删除', '保留']);
  assert.deepEqual(questionOptions('已完成：\n- 改动 A'), []);
});

test('an executor question pauses without review and the reply returns straight to the executor', async () => {
  const dir = path.join(root, randomUUID().slice(0, 8)), source = path.join(dir, 'source'); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'result.txt'), 'before\n');
  await git(source, ['init']); await git(source, ['add', 'result.txt']);
  await git(source, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture']);
  const config: Config = { mode: 'mock', mockScenario: 'pass', executionMode: 'native', projectMode: 'direct', directAuthorization: { projectPath: source, acknowledgedAt: new Date().toISOString() }, allowedRepositories: [source], runtimeDir: path.join(dir, 'runtime'), claudeExecutable: 'NEVER-PAID', timeoutMs: 5000, tests: [] };
  const store = await createRun(config, source, 'Clean up intermediate files');
  let plans = 0, reviews = 0; const replies: (string | undefined)[] = [];
  const agents: Agents = { executionMode: 'native',
    async plan() { plans++; return { humanDecision: null, tasks: [{ id: 'cleanup', instruction: 'Remove intermediates', acceptance: ['removed'] }] }; },
    async execute(state) {
      replies.push(state.executorQuestion?.reply);
      if (replies.length === 1) return { mode: 'native', summary: `${USER_QUESTION_MARK}\n是否批准删除清单？\n- 批准上述清单删除\n- 保留，暂不删除` };
      fs.appendFileSync(path.join(state.workspace, 'result.txt'), 'cleaned\n'); return { mode: 'native', summary: '已按批准清理' };
    },
    async review() { reviews++; return { verdict: 'pass', reason: 'Local decision fixture' }; } };

  const asked = await drive(store, agents);
  assert.equal(asked.phase, 'paused'); assert.equal(asked.nextPhase, 'execute'); assert.equal(asked.reason, AWAITING_REPLY);
  assert.deepEqual(asked.executorQuestion, { taskId: 'cleanup', loop: 1 });
  assert.equal(reviews, 0);
  assert.ok(supervisionBlock(asked), 'automatic delegation must not answer for the user');

  // The desktop routes a substantive reply at an execute checkpoint as rework; it is an answer, not a rework.
  const done = await drive(store, agents, '批准上述清单删除', undefined, undefined, 'rework');
  assert.equal(done.phase, 'completed');
  assert.deepEqual(replies, [undefined, '批准上述清单删除']);
  assert.equal(plans, 1); assert.equal(reviews, 1);
  assert.equal(done.reworks, 0); assert.equal(done.totalReworks ?? 0, 0);
  assert.equal(done.executorQuestion, undefined);
  const audit = fs.readFileSync(store.file('audit.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(audit.filter(event => event.event === 'executor-question').length, 1);
});
