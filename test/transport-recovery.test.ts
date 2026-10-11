import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { Codex, ThreadEvent } from '@openai/codex-sdk';
import { createRun, drive } from '../src/controller.js';
import { Store } from '../src/store.js';
import { RealAgents } from '../src/real-agents.js';
import { recoverTransport } from '../src/transport-recovery.js';
import { runCodexTurn } from '../src/native-agent.js';
import { runCodexDecisionTurn } from '../src/codex-decision-turn.js';
import { nativeResultSchema, type Config } from '../src/schema.js';
import { classifyFailure, FlowError } from '../src/failure.js';
import { codexPublicEvent } from '../src/telemetry.js';
import { runProcess } from '../src/process.js';

const root = path.resolve('.validation', `transport-${randomUUID()}`);
async function fixture(overrides:Partial<Config>={}) {
  const dir=path.join(root,randomUUID()),source=path.join(dir,'source');fs.mkdirSync(source,{recursive:true});
  const config:Config={allowedRepositories:[source],runtimeDir:path.join(dir,'runtime'),mode:'real',projectMode:'direct',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},executionMode:'native',claudeExecutable:'NEVER-PAID',timeoutMs:5000,transportRetryDelaysMs:[0,0,0],tests:[{executable:process.execPath,args:['-e',"require('node:assert/strict').equal(require('fs').readFileSync('result.txt','utf8'),'ok')"]}],mockScenario:'pass'};
  Object.assign(config,overrides);
  const store=await createRun(config,source,'local fault fixture');return {store,state:store.load(),config};
}
function sdk(events:ThreadEvent[]):Pick<Codex,'startThread'|'resumeThread'>{
  const thread={async runStreamed(){return {events:(async function*(){yield* events;})()};}};
  return {startThread:()=>thread,resumeThread:()=>thread} as unknown as Pick<Codex,'startThread'|'resumeThread'>;
}
const reconnect={type:'error',message:'Reconnecting... 1/5 (stream disconnected before completion: Transport error: network error: error decoding response body)'} as const;
test('installed SDK subprocess survives reconnect notification until delayed completion',async()=>{
  const {store,state}=await fixture();
  fs.writeFileSync(store.file('exec'),`import fs from 'node:fs';console.log(JSON.stringify({type:'thread.started',thread_id:'owned'}));console.log(JSON.stringify(${JSON.stringify(reconnect)}));setTimeout(()=>{fs.writeFileSync('continued.txt','yes');console.log(JSON.stringify({type:'item.completed',item:{id:'answer',type:'agent_message',text:'{"mode":"native","summary":"ok"}'}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1,cached_input_tokens:0}}));},80);`);
  const worker=store.file('sdk-worker.mjs');
  fs.writeFileSync(worker,`import {Codex} from ${JSON.stringify(pathToFileURL(path.resolve('node_modules/@openai/codex-sdk/dist/index.js')).href)};import {runCodexTurn} from ${JSON.stringify(pathToFileURL(path.resolve('dist/src/native-agent.js')).href)};import {runCodexDecisionTurn} from ${JSON.stringify(pathToFileURL(path.resolve('dist/src/codex-decision-turn.js')).href)};import {nativeResultSchema} from ${JSON.stringify(pathToFileURL(path.resolve('dist/src/schema.js')).href)};const sdk=new Codex({codexPathOverride:process.execPath});const request={workspace:${JSON.stringify(state.workspace)},threadId:null,prompt:'{}'};if(process.argv[2]==='decision')await runCodexDecisionTurn(sdk,{...request,runId:'fixture',role:'plan',schema:nativeResultSchema},()=>{});else await runCodexTurn(sdk,request,()=>{});`);
  for(const kind of ['execute','decision']){
    const result=await runProcess(process.execPath,[worker,kind],{cwd:store.dir,timeoutMs:5000});assert.equal(result.exitCode,0,result.stderr);assert.equal(fs.readFileSync(store.file('continued.txt'),'utf8'),'yes');fs.unlinkSync(store.file('continued.txt'));
  }
});
test('Claude streaming transport recovery preserves session and does not replay pending tools',async()=>{
  const {store,state,config}=await fixture({claudeStreaming:true});let calls=0;const sessions:string[]=[];
  const real=new RealAgents(config,async(_exe,args,options)=>{
    calls++;const key=args.includes('--resume')?'--resume':'--session-id';sessions.push(args[args.indexOf(key)+1]!);
    options.onLine!(JSON.stringify({type:'system',subtype:'init',session_id:sessions[0]}));
    options.onLine!(JSON.stringify({type:'result',is_error:calls===1,result:calls===1?'network error':'ok',session_id:sessions[0],structured_output:calls===1?undefined:{humanDecision:null,tasks:[{id:'one',instruction:'local',acceptance:['ok']}]}}));
    return {exitCode:calls===1?1:0,stdout:'',stderr:''};
  });
  await real.plan(state,store,new AbortController().signal);assert.equal(calls,2);assert.equal(sessions[0],sessions[1]);assert.equal(state.claudeCalls,2);
  const f=await fixture({claudeStreaming:true});let uncertainCalls=0;
  const uncertain=new RealAgents(f.config,async(_exe,_args,options)=>{
    uncertainCalls++;options.onLine!(JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',id:'pending',name:'Bash',input:{command:'write'}}]}}));
    options.onLine!(JSON.stringify({type:'result',is_error:true,result:'network error'}));return {exitCode:1,stdout:'',stderr:''};
  });
  await assert.rejects(uncertain.plan(f.state,f.store,new AbortController().signal),/tool results are unknown/);assert.equal(uncertainCalls,1);
});
test('decision retries reuse owned Thread and count every invocation',async()=>{
  const {store,state,config}=await fixture({decisionAgent:{backend:'codex'}});let calls=0;const ids:unknown[]=[];
  const real=new RealAgents(config,async(_exe,_args,options)=>{
    const request=JSON.parse(options.input!);calls++;ids.push(request.threadId);
    const scope={runId:request.runId,workspace:request.workspace,role:request.role,participantId:request.participantId??null,discussionStage:request.discussionStage??null};
    options.onLine!(JSON.stringify({type:'thread',id:'decision-owned',scope}));
    if(calls===1)return {exitCode:1,stdout:'',stderr:'stream disconnected before completion: network error'};
    options.onLine!(JSON.stringify({type:'observation',data:{type:'turn.completed',usage:{input_tokens:1,output_tokens:1,cached_input_tokens:0}},scope}));
    options.onLine!(JSON.stringify({type:'result',data:{humanDecision:null,tasks:[{id:'one',instruction:'local',acceptance:['ok']}]},scope}));
    return {exitCode:0,stdout:'',stderr:''};
  });
  assert.equal((await real.plan(state,store,new AbortController().signal)).tasks.length,1);
  assert.deepEqual(ids,[null,'decision-owned']);assert.equal(state.claudeCalls,2);assert.equal(state.codexThreadId,null);
  const starts=fs.readFileSync(store.file('audit.jsonl'),'utf8').split('\n').filter(line=>line.includes('observation-call-start')).map(line=>JSON.parse(line).data.callId);
  assert.equal(new Set(starts).size,2);
});
test('executor and decision consume reconnect progress until completed turn',async()=>{
  const events:ThreadEvent[]=[{type:'thread.started',thread_id:'owned'},reconnect,{type:'item.completed',item:{id:'final',type:'agent_message',text:'{"mode":"native","summary":"ok"}'}},{type:'turn.completed',usage:{input_tokens:1,output_tokens:1,cached_input_tokens:0} as never}];
  assert.ok(await runCodexTurn(sdk(events),{workspace:'D:/fixture',threadId:null,prompt:'{}'},()=>{}));
  assert.deepEqual(await runCodexDecisionTurn(sdk(events),{workspace:'D:/fixture',threadId:null,prompt:'{}',schema:nativeResultSchema,runId:'fixture',role:'plan'},()=>{}),{mode:'native',summary:'ok'});
  assert.equal(codexPublicEvent(reconnect)?.kind,'retry');
});
test('failed turn, incomplete stream, pending tools cannot succeed',async()=>{
  const run=(events:ThreadEvent[])=>runCodexTurn(sdk(events),{workspace:'D:/fixture',threadId:null,prompt:'{}'},()=>{});
  await assert.rejects(run([reconnect,{type:'turn.failed',error:{message:'stream disconnected'}}]),/stream disconnected/);
  await assert.rejects(run([reconnect]),/no completed result/);
  try { await run([reconnect]); } catch(error) { assert.equal(classifyFailure(error,'execute').kind,'transport'); }
  await assert.rejects(run([{type:'item.started',item:{id:'cmd',type:'command_execution',command:'write',aggregated_output:'',status:'in_progress'}},reconnect,{type:'turn.failed',error:{message:'network error'}}]),/unsafe recovery/);
  try { await run([reconnect,{type:'turn.failed',error:{message:'deterministic model error'}}]); } catch(error) { assert.notEqual(classifyFailure(error,'execute').kind,'transport'); }
});
test('Claude pre-init transport failure does not invent a resumable session',async()=>{
  const {store,state,config}=await fixture({claudeStreaming:true});let calls=0;
  const real=new RealAgents(config,async()=>{calls++;return {exitCode:1,stdout:'',stderr:'network error'};});
  await assert.rejects(real.plan(state,store,new AbortController().signal),/network error/);assert.equal(calls,1);assert.equal(state.claudeSessionId,null);assert.equal(state.decisionSession,undefined);
});
test('nonstream Claude error envelope retains confirmed session for manual recovery',async()=>{
  const {store,state,config}=await fixture({claudeStreaming:false});let calls=0;let id='';
  const real=new RealAgents(config,async(_exe,args)=>{calls++;id=args[args.indexOf('--session-id')+1]!;return {exitCode:1,stdout:JSON.stringify({is_error:true,session_id:id,result:'network error'}),stderr:''};});
  await assert.rejects(real.plan(state,store,new AbortController().signal),/tool results are unknown/);assert.equal(calls,1);assert.equal(state.claudeSessionId,id);assert.equal(state.decisionSession?.sessionId,id);
});
test('permanent errors stay outside transport classification',()=>{
  for(const [message,kind] of [['401 network error','authentication'],['429 rate limit','budget'],['Timeout network error','timeout'],['503 overloaded','transport']])assert.equal(classifyFailure(Error(message!),'execute').kind,kind);
  assert.equal(classifyFailure(new FlowError('safety','network error'),'execute').kind,'safety');
  assert.equal(classifyFailure(Error('unsafe recovery: network error'),'execute').kind,'safety');
  assert.equal(classifyFailure(Error('unsafe recovery: Codex tool results are unknown; manual recovery required'),'execute').kind,'interrupted');
});
test('bounded recovery preserves partial writes and counters',async()=>{
  const {state,store}=await fixture();state.codexThreadId='owned';let calls=0;
  assert.equal(await recoverTransport(state,store,new AbortController().signal,'execute',()=>state.codexThreadId,async()=>{calls++;fs.writeFileSync(path.join(state.workspace,'partial.txt'),'preserved');if(calls<3)throw new FlowError('transport','network error');return 'ok';}),'ok');
  assert.equal(calls,3);assert.equal(state.loops,0);assert.equal(state.reworks,0);assert.equal(state.codexThreadId,'owned');assert.equal(fs.readFileSync(path.join(state.workspace,'partial.txt'),'utf8'),'preserved');
});
test('exhaustion persists across restart; explicit new decision opens new window',async()=>{
  const {state,store}=await fixture();state.codexThreadId='owned';let calls=0;const operation=async()=>{calls++;throw Error('network error');};
  await assert.rejects(recoverTransport(state,store,new AbortController().signal,'execute',()=>state.codexThreadId,operation),/3 次/);
  await assert.rejects(recoverTransport(state,new Store(state.config.runtimeDir,state.id),new AbortController().signal,'execute',()=>state.codexThreadId,operation),/耗尽/);assert.equal(calls,4);
  state.feedback='User decision: explicitly retry';assert.equal(await recoverTransport(state,store,new AbortController().signal,'execute',()=>state.codexThreadId,async()=> 'ok'),'ok');
});
test('unknown thread never retries; stop interrupts waiting and restart never replays',async()=>{
  const {state,store}=await fixture();let calls=0;
  await assert.rejects(recoverTransport(state,store,new AbortController().signal,'execute',()=>null,async()=>{calls++;throw Error('network error');}),/network error/);assert.equal(calls,1);
  const stop=new AbortController();state.codexThreadId='owned';state.config.transportRetryDelaysMs=[30000];
  await assert.rejects(recoverTransport(state,store,stop.signal,'execute',()=>state.codexThreadId,async()=>{throw Error('network error');},async(ms,signal)=>{assert.ok(ms>=30000);stop.abort();signal.throwIfAborted();}));
  await assert.rejects(recoverTransport(state,store,new AbortController().signal,'execute',()=>state.codexThreadId,async()=> 'must not launch'),/等待已中断/);
});
test('abort after normally returned wait persists cancellation without dispatch',async()=>{
  const {store,state}=await fixture();state.codexThreadId='owned';const stop=new AbortController();let calls=0;
  await assert.rejects(recoverTransport(state,store,stop.signal,'execute',()=>state.codexThreadId,async()=>{calls++;throw Error('network error');},async()=>{stop.abort();}));assert.equal(calls,1);
  await assert.rejects(recoverTransport(state,store,new AbortController().signal,'execute',()=>state.codexThreadId,async()=> 'must not run'),/等待已中断/);
});
test('Controller retries executor within one loop then independently verifies',async()=>{
  const {store,config}=await fixture();let attempts=0;const ids:unknown[]=[];
  const real=new RealAgents(config,async(_exe,_args,options)=>{
    const request=JSON.parse(options.input!);ids.push(request.threadId);attempts++;options.onLine!(JSON.stringify({type:'thread',id:'owned'}));fs.writeFileSync(path.join(request.workspace,'partial.txt'),'preserved');
    if(attempts===1)return {exitCode:1,stdout:'',stderr:'stream disconnected before completion: network error'};
    assert.match(request.prompt,/先检查已有修改/);fs.writeFileSync(path.join(request.workspace,'result.txt'),'ok');options.onLine!(JSON.stringify({type:'result',data:{mode:'native',summary:'local fixture'}}));return {exitCode:0,stdout:'',stderr:''};
  });
  const result=await drive(store,{executionMode:'native',plan:async()=>({humanDecision:null,tasks:[{id:'one',instruction:'local',acceptance:['result is ok']}]}),execute:real.execute.bind(real),review:async()=>({verdict:'pass',reason:'local fixture'})});
  assert.equal(result.phase,'completed');assert.equal(result.loops,1);assert.equal(result.reworks,0);assert.equal(result.evidence?.passed,true);assert.deepEqual(ids,[null,'owned']);
});
