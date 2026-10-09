import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Codex, ThreadEvent } from '@openai/codex-sdk';
import { createRun, drive } from '../src/controller.js';
import { git, snapshot, nativeAgentEnv } from '../src/workspace.js';
import { nativeThreadOptions, runCodexTurn } from '../src/native-agent.js';
import { runProcess } from '../src/process.js';
import { activityRecorder, claudePublicEvents, codexPublicEvent } from '../src/telemetry.js';
import { RealAgents } from '../src/real-agents.js';
import { recordClaudeCall } from '../src/agent-usage.js';
import { atomicJson } from '../src/store.js';
import { FlowError } from '../src/failure.js';
import type { Agents } from '../src/adapters.js';
import type { Config, NativeResult } from '../src/schema.js';

const root = path.resolve('.validation', `v03c2-native-${randomUUID()}`);
fs.mkdirSync(root, { recursive: true });
async function fixture(name: string, overrides: Partial<Config> = {}) {
  const dir = path.join(root, name), repo = path.join(dir, 'repository'); fs.mkdirSync(repo, { recursive: true });
  await git(repo, ['init']); fs.writeFileSync(path.join(repo, 'seed.txt'), 'initial\n');
  await git(repo, ['add', '.']); await git(repo, ['-c', 'user.name=Local Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'isolated fixture']);
  const verifier = path.join(dir, 'acceptance.cjs');
  fs.writeFileSync(verifier, "const fs=require('fs'),a=require('node:assert/strict');a.equal(fs.readFileSync('result.txt','utf8'),'fixed\\n');a.equal(fs.readFileSync('seed.txt','utf8'),'reviewed\\n');console.log('Controller independent acceptance passed');");
  const config: Config = { allowedRepositories: [repo], runtimeDir: path.join(dir, 'runtime'), mode: 'real', claudeExecutable: 'NEVER-LAUNCH-PAID-AGENT', maxClaudeCalls: 8, timeoutMs: 5000, maxLoops: 4, maxReworks: 2, tests: [{ executable: process.execPath, args: [verifier] }], mockScenario: 'pass', ...overrides };
  const store = await createRun(config, repo, name);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ service: 'local fixture; no model invocation', source: repo, runId: store.id, audit: store.file('audit.jsonl'), verifier }, null, 2));
  return { store, config, repo, dir };
}
const audit = (file: string): any[] => fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
function agents(): Agents {
  return {
    executionMode: 'native',
    async plan(state, store) { recordClaudeCall(state, store, 'plan'); fs.writeFileSync(path.join(state.workspace, 'plan-note.txt'), '规划阶段实际修改\n'); return { humanDecision: null, tasks: [{ id: 'native', instruction: '修复并验证', acceptance: ['独立验收通过'] }] }; },
    async execute(state, store) { state.codexThreadId ??= 'fixture-thread'; store.save(state); fs.writeFileSync(path.join(state.workspace, 'result.txt'), 'fixed\n'); return { mode: 'native', summary: '本地原生适配器夹具已修改 result.txt' }; },
    async review(state, store) { recordClaudeCall(state, store, 'review'); fs.writeFileSync(path.join(state.workspace, 'seed.txt'), 'reviewed\n'); return { verdict: 'pass', reason: '本地审查夹具已修复 seed.txt；等待 Controller 独立验收' }; }
  };
}

test('native options restore SDK full access without changing model or extensions', () => {
  assert.deepEqual(nativeThreadOptions('D:/fixture'), { workingDirectory: 'D:/fixture', skipGitRepoCheck: true, sandboxMode: 'danger-full-access', approvalPolicy: 'never', networkAccessEnabled: true, webSearchMode: 'live' });
  for (const key of ['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_DISABLE_AUTO_MEMORY']) assert.equal(nativeAgentEnv()[key], process.env[key]);
  assert.equal('model' in nativeThreadOptions('D:/fixture'), false);
});

test('real adapters complete Plan Execute Review without authorization; usage and audit remain readable', async () => {
  const f = await fixture('no-paid-gate', {maxClaudeCalls:1,claudeStreaming:false,executionMode:'native',globalBudget:{file:path.join(root,'missing-history.json'),limit:1}});
  let cc=0,codex=0;
  const adapter = new RealAgents(f.config, async (program,_args,options) => {
    if(program===f.config.claudeExecutable){
      cc++;
      const output=cc===1?{humanDecision:null,tasks:[{id:'native',instruction:'local injected task',acceptance:['independent fixture passes']}]}:{verdict:'pass',reason:'local injected review'};
      return {exitCode:0,stdout:JSON.stringify({session_id:'local-cc',structured_output:output,usage:{input_tokens:10,output_tokens:5}}),stderr:''};
    }
    codex++;
    fs.writeFileSync(path.join(f.store.load().workspace,'result.txt'),'fixed\n');
    fs.writeFileSync(path.join(f.store.load().workspace,'seed.txt'),'reviewed\n');
    options.onLine?.(JSON.stringify({type:'thread',id:'local-codex'}));
    options.onLine?.(JSON.stringify({type:'observation',data:{type:'turn.completed',usage:{input_tokens:12,output_tokens:6,cached_input_tokens:0}}}));
    options.onLine?.(JSON.stringify({type:'result',data:{mode:'native',summary:'local injected result'}}));
    return {exitCode:0,stdout:'',stderr:''};
  });
  const state=await drive(f.store,adapter);
  assert.equal(state.phase,'completed');assert.equal(cc,2);assert.equal(codex,1);assert.equal(state.claudeCalls,2);assert.equal(state.codexThreadId,'local-codex');assert.equal(state.claudeSessionId,'local-cc');
  assert.equal(fs.existsSync(f.config.globalBudget!.file),false);
  const {runUsage}=await import('../src/call-observation.js');
  const usage=runUsage(f.store);assert.equal(usage.calls.length,3);assert.ok(usage.calls.some(call=>call.agent==='codex'&&call.inputTokens===12));
  assert.ok(audit(f.store.file('audit.jsonl')).some(event=>event.event==='agent-finish'));
});

for(const agent of ['claude','codex'] as const) for(const [message,kind] of [['401 OAuth token expired','authentication'],['HTTP 429 Too Many Requests','budget'],['usage limit exceeded','budget']] as const) test(`${agent} provider ${kind} remains reported without local authorization`,async()=>{
  const f=await fixture(`provider-${agent}-${message.slice(0,3)}`,{maxClaudeCalls:1,claudeStreaming:false});
  const state=f.store.load();state.tasks=[{id:'native',instruction:'local injected task',acceptance:['local fixture']}];f.store.save(state);
  let calls=0;
  const adapter=new RealAgents(f.config,async()=>{calls++;return {exitCode:1,stdout:JSON.stringify({is_error:true,result:message}),stderr:message};});
  await assert.rejects(agent==='claude'?adapter.plan(state,f.store,new AbortController().signal):adapter.execute(state,f.store,new AbortController().signal),(error:unknown)=>error instanceof FlowError&&error.kind===kind&&error.message.includes(message));
  assert.equal(calls,1);
});

test('SDK stream consumer allows failed test then repair and success within one turn (local fixture)', async () => {
  const f = await fixture('single-turn'); const workspace = f.store.load().workspace; const emitted: any[] = [], exits: number[] = [];
  // This generator is explicitly a fixture, not evidence of a model/tool service call.
  const thread = { async runStreamed(_prompt: string, options: object) {
    assert.deepEqual(options, {});
    async function* events(): AsyncGenerator<ThreadEvent> {
      yield { type: 'thread.started', thread_id: 'fixture-native-thread' };
      yield { type: 'turn.started' };
      const scripts = ["require('fs').writeFileSync('result.txt','wrong\\n')", "require('node:assert/strict').equal(require('fs').readFileSync('result.txt','utf8'),'fixed\\n')", "require('fs').writeFileSync('result.txt','fixed\\n')", "require('node:assert/strict').equal(require('fs').readFileSync('result.txt','utf8'),'fixed\\n');console.log('agent fixture test passed')"];
      for (const [index, script] of scripts.entries()) {
        const command = `${process.execPath} -e ${JSON.stringify(script)}`;
        yield { type: 'item.started', item: { id: `command-${index}`, type: 'command_execution', command, status: 'in_progress', aggregated_output: '' } };
        const result = await runProcess(process.execPath, ['-e', script], { cwd: workspace, timeoutMs: 5000 }); exits.push(result.exitCode);
        yield { type: 'item.completed', item: { id: `command-${index}`, type: 'command_execution', command, status: result.exitCode === 0 ? 'completed' : 'failed', exit_code: result.exitCode, aggregated_output: result.stdout + result.stderr } };
      }
      yield { type: 'item.completed', item: { id: 'patch', type: 'file_change', status: 'completed', changes: [{ path: 'result.txt', kind: 'update' }] } };
      yield { type: 'item.completed', item: { id: 'final', type: 'agent_message', text: '本地夹具：修改、测试失败、修复、测试成功' } };
      yield { type: 'turn.completed', usage: {} as never };
    }
    return { events: events() };
  } };
  const sdk = { startThread(options: object) { assert.deepEqual(options, nativeThreadOptions(workspace)); return thread; }, resumeThread() { throw Error('unexpected resume'); } } as unknown as Pick<Codex, 'startThread' | 'resumeThread'>;
  const result = await runCodexTurn(sdk, { workspace, threadId: null, prompt: '本地夹具' }, e => emitted.push(e));
  assert.deepEqual(exits, [0, 1, 0, 0]); assert.equal((result as NativeResult).mode, 'native');
  assert.equal(fs.readFileSync(path.join(workspace, 'result.txt'), 'utf8'), 'fixed\n');
  assert.ok(emitted.some(e => e.type === 'activity' && e.data?.text.includes('exit_code=1')));
  assert.ok(emitted.some(e => e.type === 'activity' && e.data?.text.includes('agent fixture test passed')));
  fs.writeFileSync(path.join(f.dir, 'local-turn-events.json'), JSON.stringify({ service: 'local fixture', exits, emitted }, null, 2));
});

test('native controller includes planning, executor and reviewer modifications and revalidates review', async () => {
  const f = await fixture('all-agent-changes'), state = await drive(f.store, agents());
  assert.equal(state.phase, 'completed'); assert.equal(state.loops, 1); assert.equal(state.claudeCalls, 3);
  assert.match(state.evidence!.diff, /plan-note.txt/); assert.match(state.evidence!.diff, /reviewed/); assert.match(state.evidence!.diff, /fixed/);
  assert.equal(fs.existsSync(f.store.file('application-1.json')), false);
  const events = audit(f.store.file('audit.jsonl'));
  assert.deepEqual(events.filter(e => e.event === 'independent-check').map(e => e.data.passed), [false, true]);
  assert.equal(events.filter(e => e.event === 'review-modified-workspace').length, 1);
  assert.ok(events.some(e => e.event === 'agent-finish' && e.data.agent === 'claude' && e.data.role === 'plan' && e.data.changed));
  assert.equal(await git(f.repo, ['status', '--porcelain']), '');
  assert.equal(fs.readFileSync(path.join(f.repo, 'seed.txt'), 'utf8'), 'initial\n');
});

test('native mode rejects old file proposal without duplicate application', async () => {
  const f = await fixture('mixed-result'), a = agents();
  a.execute = async state => { fs.writeFileSync(path.join(state.workspace, 'result.txt'), 'native\n'); return { summary: 'duplicate', changes: [{ path: 'result.txt', content: 'overwritten\n' }] }; };
  const state = await drive(f.store, a); assert.equal(state.phase, 'failed');
  assert.equal(fs.readFileSync(path.join(state.workspace, 'result.txt'), 'utf8'), 'native\n'); assert.equal(fs.existsSync(f.store.file('application-1.json')), false);
});

test('interrupted native changes survive resume with same thread and task baseline', async () => {
  const f = await fixture('interruption'), a = agents(), original = a.execute;
  a.execute = async (state, store, signal) => { await original(state, store, signal); fs.writeFileSync(path.join(state.workspace, 'partial.txt'), 'preserved\n'); throw new FlowError('executor', 'Injected local interruption'); };
  const paused = await drive(f.store, a); assert.equal(paused.phase, 'paused'); assert.equal(paused.loops, 1);
  assert.equal((await drive(f.store, a)).loops, 1);
  a.execute = async (state, store, signal) => { assert.equal(state.codexThreadId, 'fixture-thread'); assert.equal(fs.readFileSync(path.join(state.workspace, 'partial.txt'), 'utf8'), 'preserved\n'); return original(state, store, signal); };
  const done = await drive(f.store, a, '继续保留修改并修复'); assert.equal(done.phase, 'completed'); assert.equal(done.loops, 2); assert.match(done.evidence!.taskDiff!, /partial.txt/);
});

test('durable native result recovers without executing or writing files again', async () => {
  const f = await fixture('receipt'), a = agents(), state = f.store.load(); state.tasks = (await a.plan(state, f.store, new AbortController().signal)).tasks;
  state.beforeExecution = await snapshot(state.workspace); state.phase = 'executing'; state.nextPhase = 'execute'; state.nativeExecution = true; state.loops = 1; f.store.save(state);
  const result = await a.execute(state, f.store, new AbortController().signal);
  atomicJson(f.store.file('native-result-1.json'), { result, snapshot: await snapshot(state.workspace), head: await git(state.workspace, ['rev-parse', 'HEAD']) });
  const file = path.join(state.workspace, 'result.txt'), mtime = fs.statSync(file).mtimeMs;
  a.execute = async () => { throw Error('must not replay'); };
  const done = await drive(f.store, a); assert.equal(done.phase, 'completed'); assert.equal(done.loops, 1); assert.equal(fs.statSync(file).mtimeMs, mtime);
});

test('Claude review repair finishes beyond historical call limit after independent verification', async () => {
  const f = await fixture('review-budget', { maxClaudeCalls: 1 }); const state = await drive(f.store, agents());
  assert.equal(state.phase, 'completed'); assert.equal(state.claudeCalls, 3); assert.equal(state.reworks, 0);
  assert.equal(state.evidence?.passed, true); assert.equal(state.taskIndex, 1); assert.equal(fs.readFileSync(path.join(state.workspace, 'seed.txt'), 'utf8'), 'reviewed\n');
});
test('repeated CC review modifications are bounded by repair control across recovery', async () => {
  const f = await fixture('review-repair-loop', {maxClaudeCalls:1,maxReworks:1}), adapter=agents();
  adapter.review=async(state,store)=>{recordClaudeCall(state,store,'review');fs.writeFileSync(path.join(state.workspace,'review-note.txt'),String(state.claudeCalls));return {verdict:'pass',reason:'local changing fixture'};};
  const state=await drive(f.store,adapter);assert.equal(state.phase,'paused');assert.equal(state.reason,'Review repair limit reached');assert.equal(state.claudeCalls,3);assert.equal(state.reviewRepairs,1);assert.equal(state.nextPhase,'verify');
  assert.equal((await drive(f.store,adapter)).claudeCalls,3);
});

test('native CLI inherits configuration and session with no turn/tool restrictions', async () => {
  const f = await fixture('cli-contract'); const state = f.store.load(); state.claudeSessionId = randomUUID();
  const run: typeof runProcess = async (_exe, args, options) => {
    assert.equal(args[args.indexOf('--permission-mode') + 1], 'bypassPermissions');
    assert.equal(args[args.indexOf('--resume') + 1], state.claudeSessionId);
    for (const flag of ['--tools', '--strict-mcp-config', '--disable-slash-commands', '--setting-sources', '--settings', '--max-turns', '--model', '--system-prompt']) assert.equal(args.includes(flag), false, flag);
    assert.equal(options.cwd, state.workspace); assert.equal(options.env?.CODEX_HOME, process.env.CODEX_HOME); assert.equal(options.env?.CLAUDE_CONFIG_DIR, process.env.CLAUDE_CONFIG_DIR);
    options.onLine!(JSON.stringify({ type: 'result', structured_output: { humanDecision: null, tasks: [{ id: 'native', instruction: '本地测试', acceptance: ['通过'] }] } }));
    return { exitCode: 0, stdout: '', stderr: '' };
  };
  assert.equal((await new RealAgents(f.config, run).plan(state, f.store, new AbortController().signal)).tasks.length, 1);
});

test('Claude tool blocks and results are retained without hidden thinking', () => {
  const events = claudePublicEvents({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'PRIVATE' }, { type: 'text', text: '公开进度' }, { type: 'tool_use', id: 'a', name: 'Read', input: { file_path: 'seed.txt' } }, { type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'npm test' } }] } });
  assert.equal(events.length, 3); assert.equal(JSON.stringify(events).includes('PRIVATE'), false);
  const results = claudePublicEvents({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'b', is_error: true, content: 'test failed' }] } });
  assert.equal(results[0]!.kind, 'error'); assert.match(results[0]!.text, /test failed/);
});

test('SDK MCP, web and file events stay visible, nonfatal tool errors do not end turn', async () => {
  for (const item of [{ id: 'm', type: 'mcp_tool_call', server: 'local', tool: 'fixture', status: 'failed', error: { message: 'fixture failure' } }, { id: 'w', type: 'web_search', query: 'fixture' }, { id: 'f', type: 'file_change', status: 'completed', changes: [{ path: 'x', kind: 'add' }] }]) assert.ok(codexPublicEvent({ type: 'item.completed', item }));
  const f = await fixture('uncapped'), state = f.store.load(), record = activityRecorder(state, f.store, 'codex', 'many');
  for (let n = 0; n < 125; n++) record({ key: String(n), kind: 'tool', title: '本地夹具', text: String(n) });
  assert.equal(audit(f.store.file('audit.jsonl')).filter(e => e.event === 'agent-activity').length, 125);
});

test('native SDK resume uses original thread and allows tools in proposal compatibility', async () => {
  const emitted: object[] = [];
  const sdk = { startThread() { throw Error('must resume'); }, resumeThread(id: string, options: object) {
    assert.equal(id, 'existing'); assert.deepEqual(options, nativeThreadOptions('D:/fixture'));
    return { async runStreamed(_prompt: string, turn: any) { assert.ok(turn.outputSchema); return { events: (async function* () {
      yield { type: 'item.completed', item: { id: 'm', type: 'mcp_tool_call', server: 'fixture', tool: 'fixture', status: 'failed', error: { message: 'nonfatal' } } };
      yield { type: 'item.completed', item: { id: 'last', type: 'agent_message', text: JSON.stringify({ summary: '提案', changes: [] }) } };
      yield { type: 'turn.completed', usage: {} };
    })() }; } };
  } } as unknown as Pick<Codex, 'startThread' | 'resumeThread'>;
  assert.deepEqual(await runCodexTurn(sdk, { workspace: 'D:/fixture', threadId: 'existing', prompt: 'test', executionMode: 'proposal' }, e => emitted.push(e)), { summary: '提案', changes: [] });
});
