import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRun, drive } from '../src/controller.js';
import { Store } from '../src/store.js';
import { git, snapshot } from '../src/workspace.js';
import { previewDelivery, approveDelivery, applyDelivery, deliveryStatus } from '../src/delivery.js';
import type { Agents } from '../src/adapters.js';
import type { Config } from '../src/schema.js';
import { runProcess } from '../src/process.js';

const root = path.resolve('.validation', `v02c-${randomUUID()}`); mkdirSync(root, { recursive: true });
async function fixture(label: string) {
  const dir = path.join(root, label); mkdirSync(dir); const source = path.join(dir, 'source'); mkdirSync(source);
  await git(source, ['init']); writeFileSync(path.join(source, 'seed.txt'), 'old-long-content\n'); writeFileSync(path.join(source, '.gitignore'), 'ignored/\n');
  await git(source, ['add', '.']); await git(source, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'requirements']);
  const target = path.join(dir, 'target'); await git(dir, ['clone', '--no-hardlinks', source, target]); await git(target, ['checkout', '-b', 'delivery-dev']);
  const rules = path.join(dir, 'acceptance.cjs');
  writeFileSync(rules, "const fs=require('node:fs'),a=require('node:assert/strict');a.equal(fs.readFileSync('seed.txt','utf8'),'new\\n');a.equal(fs.readFileSync('a.txt','utf8'),'a\\n');a.equal(fs.readFileSync('b.txt','utf8'),'b\\n');console.log('independent delivery acceptance passed');");
  const config: Config = { allowedRepositories: [source, target], runtimeDir: path.join(dir, 'runtime'), mode: 'mock', claudeExecutable: 'NEVER-SPAWN-CLAUDE', timeoutMs: 5000, maxLoops: 3, maxReworks: 1, tests: [{ executable: process.execPath, args: [rules] }], mockScenario: 'pass' };
  const store = await createRun(config, source, label);
  const agents: Agents = {
    async plan(state) { state.claudeSessionId = 'mock-cc'; return { humanDecision: null, tasks: [{ id: 'result', instruction: 'Update seed and add two files', acceptance: ['Independent test passes'] }] }; },
    async execute(state) { state.codexThreadId = 'mock-sdk'; return { summary: 'Approved UTF-8 proposal', changes: [{ path: 'seed.txt', content: 'new\n' }, { path: 'a.txt', content: 'a\n' }, { path: 'b.txt', content: 'b\n' }] }; },
    async review(state) { return { verdict: state.evidence?.passed ? 'pass' : 'rework', reason: 'Independent evidence' }; }
  };
  const completed = await drive(store, agents); assert.equal(completed.phase, 'completed');
  const configFile = path.join(dir, 'config.json'); writeFileSync(configFile, JSON.stringify(config));
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ label, source, target, rules, configFile, state: store.file('state.json'), audit: store.file('audit.jsonl') }, null, 2));
  return { dir, source, target, store, config, configFile, rules };
}
async function approved(f: Awaited<ReturnType<typeof fixture>>) {
  const preview = await previewDelivery(f.store, f.target, 'delivery-dev'); await approveDelivery(f.store, preview.id, preview.digest, 'Mock human explicitly approves this delivery digest'); return preview;
}
test('preview leaves target unchanged, approval alone does not apply, approved application verifies diff and bytes', async () => {
  const f = await fixture('success'); const before = await snapshot(f.target), head = await git(f.target, ['rev-parse', 'HEAD']);
  const p = await previewDelivery(f.store, f.target, 'delivery-dev'); assert.equal(await snapshot(f.target), before); assert.equal(await git(f.target, ['status', '--porcelain']), '');
  assert.ok(existsSync(path.join(p.directory, 'preview.md'))); assert.ok(existsSync(path.join(p.directory, 'diff.patch')));
  assert.equal((await approveDelivery(f.store, p.id, p.digest, 'Approve exact digest')).phase, 'approved'); assert.equal(await snapshot(f.target), before);
  const applied = await applyDelivery(f.store, p.id); assert.equal(applied.phase, 'applied'); assert.deepEqual(applied.written.length, 3);
  assert.equal(readFileSync(path.join(f.target, 'seed.txt'), 'utf8'), 'new\n'); assert.equal(await git(f.target, ['rev-parse', 'HEAD']), head);
  const result = await runProcess(process.execPath, [f.rules], { cwd: f.target, timeoutMs: 5000 }); assert.equal(result.exitCode, 0);
  writeFileSync(path.join(f.dir, 'target-tests.json'), JSON.stringify(result, null, 2));
  assert.equal(await git(f.source, ['status', '--porcelain']), '');
});
test('unapproved apply and wrong or empty approval never modify target', async () => {
  const f = await fixture('unauthorized'); const p = await previewDelivery(f.store, f.target, 'delivery-dev');
  await assert.rejects(applyDelivery(f.store, p.id), /no valid explicit approval/);
  await assert.rejects(approveDelivery(f.store, p.id, '0'.repeat(64), 'Approve'), /Explicit approval/);
  await assert.rejects(approveDelivery(f.store, p.id, p.digest, ''), /Explicit approval/);
  assert.equal(await git(f.target, ['status', '--porcelain']), ''); assert.equal((await deliveryStatus(f.store, p.id)).phase, 'preview');
});
test('incomplete state and missing independent or supervisor proof cannot preview', async () => {
  const f = await fixture('proof'); const original = f.store.load();
  f.store.save({ ...original, phase: 'paused' }); await assert.rejects(previewDelivery(f.store, f.target, 'delivery-dev'), /lacks completed/);
  f.store.save({ ...original, evidence: { ...original.evidence!, passed: false } }); await assert.rejects(previewDelivery(f.store, f.target, 'delivery-dev'), /lacks completed/);
  const legacy = { ...original, evidence: { ...original.evidence! } }; delete legacy.evidence.acceptanceRulesHash; f.store.save(legacy);
  await assert.rejects(previewDelivery(f.store, f.target, 'delivery-dev'), /fingerprints/); f.store.save(original);
  const audit = f.store.file('audit.jsonl'); writeFileSync(audit, readFileSync(audit, 'utf8').replace('Independent evidence', 'Forged review'));
  await assert.rejects(previewDelivery(f.store, f.target, 'delivery-dev'), /audit chain/);
});
test('dirty target, unallowed target, wrong branch and detached HEAD fail preview', async () => {
  const f = await fixture('target-precheck');
  await assert.rejects(previewDelivery(f.store, f.target, 'wrong-branch'), /branch or HEAD/);
  await assert.rejects(previewDelivery(f.store, f.dir, 'delivery-dev'), /allowed target/);
  writeFileSync(path.join(f.target, 'external.txt'), 'external'); await assert.rejects(previewDelivery(f.store, f.target, 'delivery-dev'), /must be clean/);
  await git(f.target, ['checkout', '--detach']); await assert.rejects(previewDelivery(f.store, f.target, 'delivery-dev'), /Git failed/);
});
for (const type of ['workspace', 'rules', 'preview', 'manifest', 'HEAD', 'branch', 'index', 'content', 'unrelated', 'ignored'] as const) test(`${type} replacement after approval invalidates without writing remaining files`, async () => {
  const f = await fixture(`invalid-${type}`); const p = await approved(f);
  if (type === 'workspace') writeFileSync(path.join(f.store.load().workspace, 'a.txt'), 'replaced');
  if (type === 'rules') writeFileSync(f.rules, "console.log('fake pass');");
  if (type === 'preview') writeFileSync(path.join(p.directory, 'preview.md'), 'Fake review preview');
  if (type === 'manifest') { const file = path.join(p.directory, 'manifest.json'); const value = JSON.parse(readFileSync(file, 'utf8')); value.changes[0].content = 'replaced'; writeFileSync(file, JSON.stringify(value)); }
  if (type === 'HEAD') await git(f.target, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'external head']);
  if (type === 'branch') await git(f.target, ['checkout', '-b', 'external-branch']);
  if (type === 'index') { writeFileSync(path.join(f.target, 'staged.txt'), 'staged'); await git(f.target, ['add', 'staged.txt']); }
  if (type === 'content') writeFileSync(path.join(f.target, 'seed.txt'), 'external edit');
  if (type === 'unrelated') writeFileSync(path.join(f.target, 'unrelated.txt'), 'external');
  if (type === 'ignored') writeFileSync(path.join(f.target, '.git/info/exclude'), 'a.txt\n');
  await assert.rejects(applyDelivery(f.store, p.id));
  const journal = JSON.parse(readFileSync(path.join(p.directory, 'state.json'), 'utf8')); assert.equal(journal.phase, 'invalidated'); assert.equal(journal.approval, null);
  assert.equal(existsSync(path.join(f.target, 'b.txt')), false); if (type === 'content') assert.equal(readFileSync(path.join(f.target, 'seed.txt'), 'utf8'), 'external edit');
});
test('change between preview and approval is rejected; status rechecks approved target', async () => {
  const f = await fixture('approval-status'); const original = readFileSync(path.join(f.target, 'seed.txt')); const p = await previewDelivery(f.store, f.target, 'delivery-dev');
  writeFileSync(path.join(f.target, 'seed.txt'), 'external'); await assert.rejects(approveDelivery(f.store, p.id, p.digest, 'Approve'), /conflict/);
  writeFileSync(path.join(f.target, 'seed.txt'), original); await approveDelivery(f.store, p.id, p.digest, 'Approve after inspection');
  writeFileSync(path.join(f.target, 'seed.txt'), 'external again'); assert.equal((await deliveryStatus(f.store, p.id)).phase, 'invalidated');
});
test('repeat application verifies without rewriting, then external conflict is preserved', async () => {
  const f = await fixture('repeat'); const p = await approved(f); await applyDelivery(f.store, p.id);
  const file = path.join(f.target, 'seed.txt'), mtime = statSync(file).mtimeMs;
  assert.equal((await applyDelivery(f.store, p.id)).phase, 'applied'); assert.equal(statSync(file).mtimeMs, mtime);
  writeFileSync(file, 'external after delivery'); await assert.rejects(applyDelivery(f.store, p.id), /conflict/); assert.equal(readFileSync(file, 'utf8'), 'external after delivery');
});
test('process killed after first file write recovers durable intent, skips rewrite and finishes once', async () => {
  const f = await fixture('process-recovery'); const p = await approved(f), worker = path.join(f.dir, 'crash-worker.mjs');
  writeFileSync(worker, `import{Store}from ${JSON.stringify(pathToFileURL(path.resolve('dist/src/store.js')).href)};import{applyDelivery}from ${JSON.stringify(pathToFileURL(path.resolve('dist/src/delivery.js')).href)};await applyDelivery(new Store(${JSON.stringify(f.config.runtimeDir)},${JSON.stringify(f.store.id)}),${JSON.stringify(p.id)},{afterWrite:async()=>{console.log('FAULT_AFTER_WRITE');process.kill(process.pid,'SIGKILL');}});`);
  const crashed = await runProcess(process.execPath, [worker], { cwd: f.dir, timeoutMs: 15000 }); assert.notEqual(crashed.exitCode, 0); assert.match(crashed.stdout, /FAULT_AFTER_WRITE/);
  writeFileSync(path.join(f.dir, 'process-fault.json'), JSON.stringify(crashed, null, 2));
  const state = JSON.parse(readFileSync(path.join(p.directory, 'state.json'), 'utf8')); assert.equal(state.phase, 'applying'); assert.ok(state.intent);
  const file = path.join(f.target, state.intent), mtime = statSync(file).mtimeMs;
  await assert.rejects(applyDelivery(new Store(f.config.runtimeDir, f.store.id), p.id), /explicit --resume/);
  assert.equal((await applyDelivery(new Store(f.config.runtimeDir, f.store.id), p.id, { resume: true })).phase, 'applied'); assert.equal(statSync(file).mtimeMs, mtime);
  assert.equal((await applyDelivery(f.store, p.id)).phase, 'applied'); assert.equal(statSync(file).mtimeMs, mtime);
  assert.equal((await runProcess(process.execPath, [f.rules], { cwd: f.target, timeoutMs: 5000 })).exitCode, 0);
});
test('interruption with external edit cannot recover or overwrite that file', async () => {
  const f = await fixture('process-conflict'); const p = await approved(f), worker = path.join(f.dir, 'crash-worker.mjs');
  writeFileSync(worker, `import{Store}from ${JSON.stringify(pathToFileURL(path.resolve('dist/src/store.js')).href)};import{applyDelivery}from ${JSON.stringify(pathToFileURL(path.resolve('dist/src/delivery.js')).href)};await applyDelivery(new Store(${JSON.stringify(f.config.runtimeDir)},${JSON.stringify(f.store.id)}),${JSON.stringify(p.id)},{afterWrite:async()=>{process.kill(process.pid,'SIGKILL');}});`);
  const result = await runProcess(process.execPath, [worker], { cwd: f.dir, timeoutMs: 15000 }); assert.notEqual(result.exitCode, 0);
  const state = JSON.parse(readFileSync(path.join(p.directory, 'state.json'), 'utf8')); writeFileSync(path.join(f.target, state.intent), 'external partial edit');
  await assert.rejects(applyDelivery(f.store, p.id, { resume: true }), /conflict/);
  assert.equal(readFileSync(path.join(f.target, state.intent), 'utf8'), 'external partial edit'); assert.equal(existsSync(path.join(f.target, 'b.txt')), false);
  writeFileSync(path.join(f.dir, 'process-fault.json'), JSON.stringify(result));
});
test('safe path guards still reject protected targets and ignored collisions', async () => {
  const f = await fixture('path'); mkdirSync(path.join(f.target, 'ignored')); writeFileSync(path.join(f.target, 'ignored/result.txt'), 'external ignored file');
  const p = await approved(f); const manifest = JSON.parse(readFileSync(path.join(p.directory, 'manifest.json'), 'utf8')); manifest.changes[0].path = '../escape.txt';
  writeFileSync(path.join(p.directory, 'manifest.json'), JSON.stringify(manifest)); await assert.rejects(applyDelivery(f.store, p.id)); assert.equal(existsSync(path.join(f.dir, 'escape.txt')), false);
});
test('CLI preview and explicit approval/apply route never instantiate real agents', async () => {
  const f = await fixture('cli'); const args = ['--config', f.configFile, '--id', f.store.id]; const cli = path.resolve('dist/src/cli.js');
  const preview = await runProcess(process.execPath, [cli, 'delivery-preview', ...args, '--repo', f.target, '--branch', 'delivery-dev'], { cwd: f.dir, timeoutMs: 15000 }); assert.equal(preview.exitCode, 0); const p = JSON.parse(preview.stdout);
  const denied = await runProcess(process.execPath, [cli, 'delivery-apply', ...args, '--delivery', p.id], { cwd: f.dir, timeoutMs: 15000 }); assert.equal(denied.exitCode, 1); assert.equal(await git(f.target, ['status', '--porcelain']), '');
  const approval = await runProcess(process.execPath, [cli, 'delivery-approve', ...args, '--delivery', p.id, '--approval', p.digest, '--decision', 'Mock explicit human approval'], { cwd: f.dir, timeoutMs: 15000 }); assert.equal(approval.exitCode, 0);
  const applied = await runProcess(process.execPath, [cli, 'delivery-apply', ...args, '--delivery', p.id], { cwd: f.dir, timeoutMs: 15000 }); assert.equal(applied.exitCode, 0); assert.equal(JSON.parse(applied.stdout).phase, 'applied');
});
test('hardlinked target cannot modify a file outside authorized repository', async () => {
  const f = await fixture('hardlink'); const target = path.join(f.target, 'seed.txt'), outside = path.join(f.dir, 'external-hardlink.txt');
  renameSync(target, outside); linkSync(outside, target); const before = readFileSync(outside);
  await assert.rejects(previewDelivery(f.store, f.target, 'delivery-dev'), /hardlink/);
  assert.ok(before.equals(readFileSync(outside))); assert.equal(await git(f.target, ['status', '--porcelain']), '');
});
