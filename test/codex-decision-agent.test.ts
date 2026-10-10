import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import type { Codex, ThreadOptions } from '@openai/codex-sdk';
import { createOpencodeClient } from '@opencode-ai/sdk/v2';
import { createRun, drive } from '../src/controller.js';
import { RealAgents } from '../src/real-agents.js';
import { CodexDecisionAgent } from '../src/codex-decision-agent.js';
import { runCodexDecisionTurn, codexOutputSchema, restoreOptionalFields, type CodexDecisionTurn } from '../src/codex-decision-turn.js';
import { OpenCodeDecisionAgent, type OpenCodeLauncher } from '../src/opencode-decision-agent.js';
import { assertDecisionState, type DecisionRequest } from '../src/decision-agent.js';
import { assertDiscussion } from '../src/decision-discussion.js';
import { configSchema, validate, planSchema, reviewSchema, type Config, type DecisionChoice } from '../src/schema.js';
import { Store } from '../src/store.js';
import { runUsage } from '../src/call-observation.js';
import { mockContextDocuments } from '../src/project-context.js';
import { runProcess } from '../src/process.js';

const root = path.resolve('.validation', 'p3a-' + randomUUID()); fs.mkdirSync(root, { recursive: true });
const plan = { humanDecision: null, tasks: [{ id: 'core', instruction: 'Set core.js to fixed', acceptance: ['core.js contains fixed'], moduleIds: ['fixture'] }] };
const review = { verdict: 'pass', reason: 'Local injected SDK review', contextReview: { expansionReason: '', unmappedReason: '', checkedContracts: [], modules: [{ moduleId: 'fixture', documentUpdated: false, noUpdateReason: 'Fixture leaves responsibility unchanged', checkedFiles: [], constraintsChanged: false, disposition: 'Local fixture' }] } };
const opinion = { summary: 'Independent local opinion', disagreements: ['Keep one executor'], amendments: ['Preserve seed'] };
async function fixture(extra: Partial<Config> = {}, context = false) {
  const dir = path.join(root, randomUUID().slice(0, 8)), source = path.join(dir, 's'); fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'core.js'), 'initial\n');
  if (context) for (const [file, content] of Object.entries(mockContextDocuments(randomUUID(), 'core.js'))) { const target = path.join(source, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
  const verify = path.join(dir, 'verify.cjs'); fs.writeFileSync(verify, "require('node:assert/strict').equal(require('fs').readFileSync('core.js','utf8'),'fixed\\n')");
  const config = validate<Config>(configSchema, { allowedRepositories: [source], runtimeDir: path.join(dir, 'r'), mode: 'real', projectMode: 'direct', directAuthorization: { projectPath: source, acknowledgedAt: new Date().toISOString() }, executionMode: 'native', claudeExecutable: 'never-paid', timeoutMs: 3000, maxLoops: 2, maxReworks: 0, tests: [{ executable: process.execPath, args: [verify] }], mockScenario: 'pass', decisionAgent: { backend: 'codex', model: 'fixture-model' }, ...extra });
  return { config, source, store: await createRun(config, source, 'Local fixtures only') };
}
function request(f: Awaited<ReturnType<typeof fixture>>, role: 'plan' | 'review' = 'plan'): DecisionRequest {
  const state = f.store.load(); return { state, store: f.store, role, phase: role, prompt: JSON.stringify({ action: 'Local fixture' }), schema: role === 'plan' ? planSchema : reviewSchema, workspace: fs.realpathSync(state.workspace), runId: state.id, taskId: role === 'plan' ? null : state.tasks[state.taskIndex]?.id ?? null, timeoutMs: f.config.timeoutMs, signal: new AbortController().signal };
}
function protocol(options: { failB?: boolean; timeout?: boolean; abort?: AbortController; invalid?: boolean; missingThread?: boolean; badScope?: boolean; shared?: boolean; wrongExecute?: boolean; noCompleted?: boolean } = {}) {
  const calls: { request: CodexDecisionTurn; options: ThreadOptions; prompt: any; resumed: boolean }[] = [], execution: any[] = [], sessions = new Map<string, string>();
  let fail = options.failB;
  const run: typeof runProcess = async (executable, args, processOptions) => {
    if (args[0]?.endsWith('codex-decision-worker.js')) {
      const r = JSON.parse(processOptions.input!) as CodexDecisionTurn, prompt = JSON.parse(r.prompt);
      const scope = { runId: r.runId, workspace: r.workspace, role: r.role, participantId: r.participantId ?? null, discussionStage: r.discussionStage ?? null };
      const sid = options.shared ? 'execution-thread' : r.threadId ?? 'decision-' + randomUUID();
      const thread = (threadOptions: ThreadOptions = {}) => ({
        async runStreamed(_prompt: string, turnOptions: any) {
          assert.deepEqual(turnOptions.outputSchema, codexOutputSchema(r.schema));
          calls.push({ request: r, options: threadOptions, prompt, resumed: !!r.threadId });
          if (sessions.has(sid)) assert.equal(sessions.get(sid), r.model ?? 'default'); else sessions.set(sid, r.model ?? 'default');
          return { events: (async function* () {
            if (!options.missingThread) yield { type: 'thread.started', thread_id: sid };
            yield { type: 'turn.started' };
            if (fail && r.participantId === 'b' && r.discussionStage === 'draft') { fail = false; throw Error('fixture B unavailable'); }
            if (options.timeout) throw Error('Timeout after 50 ms');
            if (options.abort) { options.abort.abort(); throw Error('Stopped'); }
            yield { type: 'item.completed', item: { id: 'reasoning', type: 'reasoning', text: 'DO_NOT_DISPLAY_REASONING' } };
            yield { type: 'item.completed', item: { id: 'read', type: 'command_execution', command: 'type core.js', aggregated_output: 'local', status: 'completed', exit_code: 0 } };
            const output = options.invalid ? { tasks: [] } : r.role === 'review' ? review : r.discussionStage === 'discussion' ? opinion : plan;
            yield { type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: JSON.stringify(output) } };
            if (!options.noCompleted) yield { type: 'turn.completed', usage: { input_tokens: 12, cached_input_tokens: 2, output_tokens: 4 } };
          })() };
        }
      });
      const sdk = { startThread: thread, resumeThread(id: string, threadOptions: ThreadOptions) { assert.equal(id, r.threadId); return thread(threadOptions); } } as unknown as Pick<Codex, 'startThread' | 'resumeThread'>;
      const result = await runCodexDecisionTurn(sdk, r, event => processOptions.onLine!(JSON.stringify({ ...event, scope: options.badScope ? { ...scope, runId: 'wrong' } : scope })));
      processOptions.onLine!(JSON.stringify({ type: 'result', data: result, scope })); return { exitCode: 0, stdout: '', stderr: '' };
    }
    if (executable === process.execPath) {
      const r = JSON.parse(processOptions.input!); execution.push(r);
      fs.writeFileSync(path.join(r.workspace, 'core.js'), options.wrongExecute ? 'wrong\n' : 'fixed\n');
      processOptions.onLine!(JSON.stringify({ type: 'thread', id: 'execution-thread' }));
      processOptions.onLine!(JSON.stringify({ type: 'result', data: { mode: 'native', summary: 'Local execution fixture' } }));
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    // Existing Claude adapter protocol; never launches the CLI.
    const prompt = JSON.parse(processOptions.input!), sid = args[args.indexOf(args.includes('--resume') ? '--resume' : '--session-id') + 1];
    const result = { type: 'result', session_id: sid, structured_output: prompt.action.startsWith('Plan') ? prompt.decisionStage === 'discussion' ? opinion : plan : review };
    processOptions.onLine!(JSON.stringify(result)); return { exitCode: 0, stdout: JSON.stringify(result), stderr: '' };
  };
  return { run, calls, execution, sessions };
}
function localOpenCode() {
  const sessions = new Map<string, any>();
  const launcher: OpenCodeLauncher = async (_executable, directory) => {
    const streams: ServerResponse[] = [];
    const server = createServer(async (req, res) => {
      let body = ''; for await (const chunk of req) body += chunk; const data = body ? JSON.parse(body) : {}, url = new URL(req.url!, 'http://localhost');
      const send = (value: any) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
      if (url.pathname === '/provider') return send({ connected: ['fixture'], all: [{ id: 'fixture', name: 'Local', models: { m: { id: 'm', name: 'm', capabilities: { toolcall: true } } } }], default: {} });
      if (url.pathname === '/global/event') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(': local\n\n'); streams.push(res); return; }
      if (url.pathname === '/session' && req.method === 'POST') { const s = { id: 'ses_' + randomUUID(), directory, title: data.title }; sessions.set(s.id, s); return send(s); }
      const match = url.pathname.match(/^\/session\/([^/]+)(.*)$/), id = match?.[1], tail = match?.[2];
      if (id && tail === '') return send(sessions.get(id));
      if (id && tail === '/message') {
        const prompt = JSON.parse(data.parts[0].text);
        return send({ info: { id: 'msg_' + randomUUID(), sessionID: id, role: 'assistant', path: { cwd: directory }, providerID: 'fixture', modelID: 'm', tokens: { input: 12, output: 4 }, structured: prompt.action.startsWith('Plan') ? prompt.decisionStage === 'discussion' ? opinion : plan : review }, parts: [] });
      }
      res.writeHead(404); res.end();
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    return { client: createOpencodeClient({ baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, directory, throwOnError: true }), openapi: { paths: { '/session/{sessionID}/message': { post: { requestBody: { content: { 'application/json': { schema: { properties: { format: { properties: { type: { const: 'json_schema' } } } } } } } } } } } }, async close() { for (const stream of streams) stream.end(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
  };
  return { launcher, sessions };
}

test('single Codex Plan/Review, SDK schema/model/native permissions, separate execution, Context, usage and resume', async () => {
  const f = await fixture({}, true), p = protocol(), done = await drive(f.store, new RealAgents(f.config, p.run));
  assert.equal(done.phase, 'completed', done.reason); assert.equal(p.calls.length, 2); assert.equal(p.execution.length, 1);
  assert.equal(p.calls[0]!.resumed, false); assert.equal(p.calls[1]!.resumed, true);
  assert.equal(done.decisionSession?.backend, 'codex'); assert.notEqual(done.decisionSession?.sessionId, done.codexThreadId); assert.equal(done.claudeSessionId, null);
  for (const call of p.calls) { assert.equal(call.options.model, 'fixture-model'); assert.equal(call.options.sandboxMode, 'read-only'); assert.equal(call.options.approvalPolicy, 'never'); assert.equal(call.options.workingDirectory, f.source); assert.ok(call.prompt.context.moduleCatalog.some((m: any) => m.id === 'fixture')); }
  const usage = runUsage(f.store); assert.equal(usage.calls.filter(c => c.agent === 'codex' && c.phase !== 'execute').length, 2); assert.equal(usage.reported.codex.inputTokens, null); // executor fixture reports no usage
  assert.equal(usage.calls.find(c => c.phase === 'plan')!.inputTokens, 12); assert.equal(usage.calls.find(c => c.phase === 'review')!.controllerCall, 2);
  assert.equal(JSON.parse(fs.readFileSync(f.store.file('state.json'), 'utf8')).config.decisionAgent.model, 'fixture-model');
  const audit = fs.readFileSync(f.store.file('audit.jsonl'), 'utf8'); assert.ok(!audit.includes('DO_NOT_DISPLAY_REASONING')); assert.ok(audit.includes('codex-decision-thread'));
  const receipt = fs.readFileSync(f.store.file(`context/${usage.calls.find(c => c.phase === 'plan')!.callId}.reads.jsonl`), 'utf8'); assert.ok(receipt.includes('type core.js')); assert.ok(!receipt.includes('confirmed-read'));
});
for (const backend of ['codex', 'claude-code', 'opencode'] as const) for (const rounds of [0, 1] as const) for (const primary of ['a', 'b'] as const) test(`Codex + ${backend}, ${rounds} rounds, primary ${primary}: independent threads, real adapters and one executor`, async () => {
  const second: DecisionChoice = backend === 'opencode' ? { backend, opencode: { providerID: 'fixture', modelID: 'm' } } : { backend, model: 'fixture-second' };
  const f = await fixture({ decisionAgent: undefined, decisionDiscussion: { participants: [{ id: 'a', agent: { backend: 'codex', model: 'fixture-first' } }, { id: 'b', agent: second }], primary, rounds } });
  const p = protocol(), open = localOpenCode(), done = await drive(f.store, new RealAgents(f.config, p.run, undefined, config => new OpenCodeDecisionAgent(config, open.launcher)));
  assert.equal(done.phase, 'completed', done.reason); assert.equal(p.execution.length, 1); assert.equal(done.claudeCalls, 4 + 2 * rounds);
  const [a, b] = done.discussion!.participants; assert.notEqual(a!.session!.sessionId, b!.session!.sessionId); assert.notEqual(a!.session!.sessionId, done.codexThreadId); assert.notEqual(b!.session!.sessionId, done.codexThreadId);
  assert.equal(a!.calls + b!.calls, done.claudeCalls); assert.equal(done.discussion!.steps.length, 3 + 2 * rounds);
  const drafts = p.calls.filter(c => c.request.discussionStage === 'draft'); assert.ok(drafts.every(c => !c.prompt.exchange && !c.resumed));
  assert.ok(p.calls.filter(c => c.request.discussionStage === 'discussion').every(c => !c.prompt.exchange.opinions));
  const usage = runUsage(f.store).calls.filter(c => c.phase !== 'execute'); assert.ok(usage.every(c => c.participantId));
  assert.equal(usage.find(c => c.phase === 'review')!.participantId, primary);
  assert.equal(new Store(f.config.runtimeDir, f.store.id).load().discussion!.participants[0]!.agent.backend, 'codex');
});
test('failed second Codex preserves started Thread and first draft, explicit resume reuses failed Thread and counts', async () => {
  const f = await fixture({ decisionDiscussion: { participants: [{ id: 'a', agent: { backend: 'codex' } }, { id: 'b', agent: { backend: 'codex' } }], primary: 'b', rounds: 1 }, decisionAgent: undefined }), p = protocol({ failB: true }), agents = new RealAgents(f.config, p.run);
  let state = await drive(f.store, agents); assert.equal(state.phase, 'paused'); assert.equal(p.execution.length, 0);
  const sid = state.discussion!.participants[1]!.session!.sessionId; assert.equal(state.discussion!.steps[0]!.status, 'success');
  state = await drive(f.store, agents); assert.equal(p.calls.length, 2); assert.equal(state.phase, 'paused');
  state = await drive(f.store, agents, 'Retry failed decision with existing Thread'); assert.equal(state.phase, 'completed', state.reason);
  assert.equal(state.discussion!.participants[1]!.session!.sessionId, sid); assert.equal(p.calls.filter(c => c.request.participantId === 'a' && c.request.discussionStage === 'draft').length, 1); assert.equal(state.claudeCalls, 7);
});
test('malformed output, missing completion/thread, wrong scope, timeout and interruption never Execute; recovery preserves Thread', async () => {
  for (const options of [{ invalid: true }, { missingThread: true }, { noCompleted: true }, { badScope: true }, { timeout: true }, { abort: new AbortController() }]) {
    const f = await fixture(), p = protocol(options), state = await drive(f.store, new RealAgents(f.config, p.run), undefined, 'abort' in options ? options.abort?.signal : undefined);
    assert.notEqual(state.phase, 'completed'); assert.equal(p.execution.length, 0); assert.equal(state.claudeCalls, 1);
    assert.equal(runUsage(f.store).calls[0]!.status, 'abort' in options ? 'interrupted' : 'failed');
    if ('timeout' in options || 'abort' in options) {
      const sid = state.decisionSession!.sessionId, retry = protocol(), done = await drive(f.store, new RealAgents(f.config, retry.run), 'Resume existing decision Thread');
      assert.equal(done.phase, 'completed', done.reason); assert.equal(done.decisionSession!.sessionId, sid); assert.equal(done.claudeCalls, 3);
    }
  }
});
test('ownership rejects mixed execution/decision Threads, shared dual Sessions and scope/config tampering', async () => {
  const f = await fixture(), p = protocol(), adapter = new CodexDecisionAgent(f.config, p.run); await adapter.structured(request(f));
  const state = f.store.load(); state.codexThreadId = state.decisionSession!.sessionId; assert.throws(() => assertDecisionState(state), /share/);
  const empty = f.store.load(); empty.decisionSession!.sessionId = ''; assert.throws(() => assertDecisionState(empty), /ownership/);
  const r = request(f); r.runId = 'wrong'; await assert.rejects(() => adapter.structured(r), /scope/);
  const changed = f.store.load(); changed.config.decisionAgent = { backend: 'codex', model: 'changed' }; assert.throws(() => assertDecisionState(changed), /Immutable/);
  const dual = await fixture({ decisionAgent: undefined, decisionDiscussion: { participants: [{ id: 'a', agent: { backend: 'codex' } }, { id: 'b', agent: { backend: 'codex' } }], primary: 'a', rounds: 0 } }), dp = protocol(); await drive(dual.store, new RealAgents(dual.config, dp.run));
  const shared = dual.store.load(); shared.discussion!.participants[1]!.session = shared.discussion!.participants[0]!.session; assert.throws(() => assertDiscussion(shared), /share/);
  const collision = await fixture(), cp = protocol({ shared: true }), stopped = await drive(collision.store, new RealAgents(collision.config, cp.run)); assert.equal(stopped.phase, 'failed'); assert.match(stopped.reason, /share/);
});
test('Codex pass cannot bypass Review Guard; Mock stays local and unique executor configuration stays enforced', async () => {
  const f = await fixture(), p = protocol({ wrongExecute: true }), state = await drive(f.store, new RealAgents(f.config, p.run)); assert.equal(state.phase, 'paused'); assert.equal(state.evidence?.passed, false); assert.match(fs.readFileSync(f.store.file('audit.jsonl'), 'utf8'), /review-vetoed/);
  for (const extra of [{ executionAgent: { backend: 'claude-code' } }, { executionAgents: [{ backend: 'codex' }, { backend: 'codex' }] }, { decisionAgent: { backend: 'codex', model: 'bad model' } }]) assert.throws(() => validate(configSchema, { ...f.config, ...extra }));
});

function installedSdkWorker(f: Awaited<ReturnType<typeof fixture>>, hang = false) {
  // Node loads the local "exec" script as argv[0]. The installed SDK still builds
  // actual CLI arguments/schema files and parses JSONL; no model binary is launched.
  fs.writeFileSync(f.store.file('exec'), `import fs from 'node:fs';const a=process.argv.slice(2);
    for(const [key,value] of [['--sandbox','read-only'],['--cd',${JSON.stringify(f.source)}],['--model','fixture-model']])if(a[a.indexOf(key)+1]!==value)throw Error('SDK option mismatch '+key);
    const schema=JSON.parse(fs.readFileSync(a[a.indexOf('--output-schema')+1],'utf8'));
    const id=a.includes('resume')?a[a.indexOf('resume')+1]:'local-installed-sdk-thread';
    console.log(JSON.stringify({type:'thread.started',thread_id:id}));
    ${hang ? "setInterval(()=>{},1000);" : `console.log(JSON.stringify({type:'item.completed',item:{id:'answer',type:'agent_message',text:JSON.stringify(schema.properties.tasks?${JSON.stringify(plan)}:${JSON.stringify(review)})}}));
    console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:8,cached_input_tokens:1,output_tokens:3}}));`}`);
  const helper = f.store.file('local-worker.mjs');
  fs.writeFileSync(helper, `import {Codex} from ${JSON.stringify(pathToFileURL(path.resolve('node_modules/@openai/codex-sdk/dist/index.js')).href)};
    import {runCodexDecisionTurn} from ${JSON.stringify(pathToFileURL(path.resolve('dist/src/codex-decision-turn.js')).href)};
    let input='';for await(const chunk of process.stdin)input+=chunk;
    const request=JSON.parse(input),scope={runId:request.runId,workspace:request.workspace,role:request.role,participantId:request.participantId??null,discussionStage:request.discussionStage??null};
    try{const output=await runCodexDecisionTurn(new Codex({codexPathOverride:process.execPath}),request,event=>console.log(JSON.stringify({...event,scope})));
    console.log(JSON.stringify({type:'result',data:output,scope}));}catch(error){console.error(error.message);process.exitCode=1;}`);
  const run: typeof runProcess = (executable, _args, options) => runProcess(executable, [helper], options);
  return run;
}
test('installed Codex SDK serializes outputSchema/model/read-only/directory and parses Plan/Review JSONL with resume', async () => {
  const f = await fixture(), adapter = new CodexDecisionAgent(f.config, installedSdkWorker(f));
  const first = await adapter.structured(request(f)), second = await adapter.structured(request(f, 'review'));
  assert.deepEqual(first.output, plan); assert.deepEqual(second.output, review); assert.equal(second.sessionId, first.sessionId);
  assert.equal(second.usage.inputTokens, 8); assert.equal(second.usage.resumed, true);
});
for (const cancel of [false, true]) test(`installed SDK local hanging child: ${cancel ? 'interrupt' : 'timeout'} closes owned worker and retains Thread for recovery`, async () => {
  const f = await fixture({ timeoutMs: 1000 }), local = installedSdkWorker(f, true);
  const r = request(f), abort = new AbortController(); r.signal = abort.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run: typeof runProcess = (executable, args, options) => local(executable, args, { ...options, onLine(line) { options.onLine?.(line); if (cancel && JSON.parse(line).type === 'thread') timer = setTimeout(() => abort.abort(), 30); } });
  const adapter = new CodexDecisionAgent(f.config, run);
  try { await assert.rejects(adapter.structured(r), cancel ? /Stopped/ : /Timeout/); } finally { if (timer) clearTimeout(timer); }
  assert.equal(f.store.load().decisionSession?.sessionId, 'local-installed-sdk-thread');
  const recovered = await new CodexDecisionAgent(f.config, installedSdkWorker(f)).structured(request(f));
  assert.equal(recovered.usage.resumed, true); assert.equal(f.store.load().claudeCalls, 2);
});
