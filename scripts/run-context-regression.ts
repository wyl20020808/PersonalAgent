import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { regressionFixture, fixtureReview, geometry, requirements, writeFixture, type RegressionTask } from './context-regression-fixtures.js';
import { RealAgents } from '../src/real-agents.js';
import { drive } from '../src/controller.js';
import { runUsage } from '../src/call-observation.js';
import { auditRecords } from '../src/context-trust.js';
import { stampContext, contextHash } from '../src/project-context.js';
import { readProject } from '../src/project-files.js';
import type { runProcess } from '../src/process.js';

export async function runFixedRegression(directory: string, task: RegressionTask, version: 'main' | 'dev' = 'main', useGit = false) {
  const fixture = await regressionFixture(directory, task, version, useGit), original = readProject(fixture.source).digest;
  const received: any[] = [], started = Date.now();
  const injected: typeof runProcess = async (executable, _args, options) => {
    const worker = executable === process.execPath, request = JSON.parse(options.input!), prompt = worker ? JSON.parse(request.prompt) : request;
    const state = fixture.store.load(), phase = worker ? 'execute' : prompt.action.startsWith('Plan ') ? 'plan' : 'review';
    received.push({ phase, callId: prompt.context?.callId, moduleIds: prompt.context?.moduleIds, workspace: prompt.context?.workspace, version: prompt.context?.version, freshness: prompt.context?.freshness, contractHash: contextHash(JSON.stringify(prompt.evidence?.contextReport?.contracts ?? [])) });
    const emit = (event: object) => options.onLine?.(JSON.stringify(event));
    if (!worker) {
      const input = { input_tokens: 90, output_tokens: 1, cache_read_input_tokens: 20, cache_creation_input_tokens: 4 };
      const message = { id: 'fixture-request', model: 'fixture-claude-model', usage: input, content: [] };
      emit({ type: 'stream_event', event: { type: 'message_start', message } });
      emit({ type: 'assistant', message }); emit({ type: 'assistant', message });
      emit({ type: 'stream_event', event: { type: 'message_delta', usage: { output_tokens: 12 } } });
      const file = phase === 'plan' ? `docs/project-context/modules/${task === 'T1' ? 'game-app' : 'combat'}.md` : task === 'T1' ? 'app/hud.css' : 'combat/core.js';
      const content = fs.readFileSync(path.join(state.workspace, file), 'utf8');
      emit({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'fixture-read', name: 'Read', input: { file_path: path.join(state.workspace, file) } }] } });
      emit({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'fixture-read', content: '[内容仅在注入事件中]' }] }, tool_use_result: { type: 'text', file: { filePath: path.join(state.workspace, file), content, startLine: 1, numLines: content.trimEnd().split('\n').length } } });
      if (task === 'T3' && phase === 'plan') {
        assert.equal(fs.readFileSync(path.join(state.workspace, 'combat/core.js'), 'utf8').includes(`reach = ${version === 'dev' ? 5 : 2}`), true);
        assert.equal(prompt.context.freshness.length, version === 'dev' ? 1 : 0);
      }
      if (task === 'T2' && phase === 'review') { assert.deepEqual(prompt.evidence.contextReport.expandedModules, ['world']); assert.ok(prompt.evidence.contextReport.contracts.some((doc: any) => doc.id === 'geometry' && doc.content.includes(geometry))); }
      const result = phase === 'plan' ? { humanDecision: null, tasks: [{ id: task, instruction: requirements[task], moduleIds: [task === 'T1' ? 'game-app' : 'combat'], acceptance: ['固定独立源码/行为断言通过，关键契约与当前版本正确'] }] } : fixtureReview(prompt.evidence.contextReport);
      // The deliberately wrong T2 candidate even receives a Mock pass; independent verification vetoes it.
      emit({ type: 'result', is_error: false, usage: { input_tokens: phase === 'plan' ? 90 : 100090, output_tokens: phase === 'plan' ? 12 : 100012, cache_read_input_tokens: 20, cache_creation_input_tokens: 4 }, structured_output: result });
    } else {
      emit({ type: 'thread', id: 'fixture-codex-thread' });
      if (task === 'T1') writeFixture(state.workspace, 'app/hud.css', '.hud { font-size: 16px; gap: 8px; display: flex; }\n');
      if (task === 'T2') {
        const wrong = state.loops === 1;
        fixture.store.audit('regression-candidate-origin', { task, origin: wrong ? 'test-injected-wrong-candidate' : 'local-fixture-correction', autonomousModelError: false, files: ['combat/core.js', 'world/geometry.js'] });
        writeFixture(state.workspace, 'combat/core.js', `export const reach = ${wrong ? 4 : 3};\nexport const unit = "m";\n`);
        writeFixture(state.workspace, 'world/geometry.js', `export const wallX = 10;\nexport const unit = "${wrong ? 'cm' : 'm'}";\n// fixed cross-module fixture\n`);
      }
      if (task === 'T3') writeFixture(state.workspace, 'docs/project-context/modules/combat.md', fs.readFileSync(path.join(state.workspace, 'docs/project-context/modules/combat.md'), 'utf8').replaceAll('main 分支 reach=2', `${version} 分支 reach=${version === 'dev' ? 5 : 2}`) + `\n已现场核对 ${version} 分支当前源码，未修改业务实现。\n`);
      if (task !== 'T2' || state.loops > 1) {
        stampContext(state.workspace, task === 'T1' ? 'game-app' : 'combat', task === 'T1' ? ['app/hud.js', 'app/hud.css'] : ['combat/core.js']);
        if (task === 'T2') stampContext(state.workspace, 'world', ['world/geometry.js']);
      }
      emit({ type: 'observation', data: { type: 'item.completed', item: { type: 'command_execution', id: 'fixture-shell', command: 'Get-Content combat/core.js', status: 'completed', exit_code: 0 } } });
      emit({ type: 'observation', data: { type: 'turn.completed', usage: { input_tokens: 120, output_tokens: 18, cached_input_tokens: 30 } } });
      emit({ type: 'observation', data: { type: 'turn.completed', usage: { input_tokens: 120, output_tokens: 18, cached_input_tokens: 30 } } });
      emit({ type: 'result', data: { mode: 'native', summary: '明确标记本地注入式 Mock，不调用任何付费 Agent' } });
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  const state = await drive(fixture.store, new RealAgents(fixture.config, injected));
  assert.equal(state.phase, 'completed', state.reason); assert.equal(readProject(fixture.source).digest, original);
  const events = auditRecords(fixture.store.file('audit.jsonl')), usage = runUsage(fixture.store);
  const manifests = received.map(call => JSON.parse(fs.readFileSync(fixture.store.file(`context/${call.callId}.manifest.json`), 'utf8')));
  const reads = received.flatMap(call => fs.readFileSync(fixture.store.file(`context/${call.callId}.reads.jsonl`), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)));
  const result = { task, version, label: 'deterministic-injected-Mock-no-paid-agent', runId: state.id, directory, source: fixture.source, workspace: state.workspace, verifier: fixture.config.tests[0]!.args[0], durationMs: Date.now() - started,
    metrics: { finalIndependentPass: state.evidence!.passed, finalConstraintFailures: 0, wrongVersionReferences: 0, contextCausedReworks: 0, injectedCandidateReworks: task === 'T2' ? state.totalReworks ?? 0 : 0, modelConstraintOmissions: null, actualPaidCalls: 0, controllerClaudeCalls: state.claudeCalls, controllerCodexCalls: state.loops, nativeReadEvents: reads.filter(row => row.kind === 'confirmed-read').length, shellCommands: reads.filter(row => row.kind === 'shell-command').length },
    candidateOrigins: events.filter(event => event.event === 'regression-candidate-origin').map(event => event.data), independentChecks: events.filter(event => event.event === 'independent-check').map(event => ({ passed: event.data.passed, tests: event.data.tests, contextReport: event.data.contextReport })),
    received, manifests: manifests.map(manifest => ({ callId: manifest.callId, phase: manifest.phase, workspace: manifest.targetWorkspace, version: manifest.version, prompt: manifest.prompt, attached: manifest.attached })), usage,
    evidence: { audit: fixture.store.file('audit.jsonl'), finalDiff: state.evidence?.taskDiff ?? state.evidence?.diff, finalPlan: state.tasks, reviews: events.filter(event => event.event === 'review').map(event => event.data) } };
  writeFixture(directory, 'result.json', JSON.stringify(result, null, 2));
  return { ...fixture, result, received, reads, state };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.platform === 'win32' ? `D:/pa-pc3-demo/${randomUUID().slice(0, 8)}` : path.resolve('.validation', `pc3-${randomUUID()}`);
  const results = [];
  for (const task of ['T1', 'T2', 'T3'] as const) results.push((await runFixedRegression(path.join(root, task), task)).result);
  results.push((await runFixedRegression(path.join(root, 'T3-dev'), 'T3', 'dev', true)).result);
  writeFixture(path.resolve('validation/phase3'), `mock-demo-${Date.now()}.json`, JSON.stringify({ root, results }, null, 2));
  console.log(JSON.stringify({ root, results: results.map(result => ({ task: result.task, version: result.version, metrics: result.metrics, usage: result.usage.groups })) }, null, 2));
}
