import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun, drive } from '../src/controller.js';
import { RealAgents } from '../src/real-agents.js';
import { MockAgents } from '../src/adapters.js';
import { configSchema, validate, type Config, type DecisionDiscussion, type Plan } from '../src/schema.js';
import { Store } from '../src/store.js';
import { runUsage } from '../src/call-observation.js';
import { assertDiscussion } from '../src/decision-discussion.js';
import type { runProcess } from '../src/process.js';
import { mockContextDocuments } from '../src/project-context.js';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { createOpencodeClient } from '@opencode-ai/sdk/v2';
import { OpenCodeDecisionAgent, type OpenCodeLauncher } from '../src/opencode-decision-agent.js';

const root=path.resolve('.validation','p2a-'+randomUUID());fs.mkdirSync(root,{recursive:true});
const plan:Plan={humanDecision:null,tasks:[{id:'hello',instruction:'Create hello.txt',acceptance:['hello.txt contains hello and newline']}]};
async function fixture(rounds:0|1=1,primary:'a'|'b'='a',overrides:Partial<Config>={},context=false){
 const dir=path.join(root,randomUUID()),source=path.join(dir,'source');fs.mkdirSync(source,{recursive:true});fs.writeFileSync(path.join(source,'seed.txt'),'keep\n');
 // A mandatory full-project capture would reject this hardlink before either decision call.
 fs.linkSync(path.join(source,'seed.txt'),path.join(source,'seed-link.txt'));
 const verifier=path.join(dir,'verify.cjs');fs.writeFileSync(verifier,"const fs=require('fs');if(fs.readFileSync('hello.txt','utf8')!=='hello\\n')process.exit(1);");
 if(context){fs.writeFileSync(path.join(source,'core.js'),'initial\n');for(const [file,content] of Object.entries(mockContextDocuments(randomUUID(),'core.js'))){const target=path.join(source,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}}
 const decisionDiscussion:DecisionDiscussion={participants:[{id:'a',agent:{backend:'claude-code',model:'sonnet'}},{id:'b',agent:{backend:'claude-code',model:'opus'}}],primary,rounds};
 const config=validate<Config>(configSchema,{allowedRepositories:[source],runtimeDir:path.join(dir,'runtime'),mode:'real',projectMode:'direct',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},executionMode:'native',claudeExecutable:'never-paid-fixture',claudeStreaming:true,timeoutMs:10000,maxLoops:4,maxReworks:0,tests:[{executable:process.execPath,args:[verifier]}],mockScenario:'pass',decisionDiscussion,...overrides});
 return {config,source,store:await createRun(config,source,'Write hello; preserve existing seed')};
}
function records(store:Store){return fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s));}
function protocol(options:{failB?:boolean;hangB?:boolean;invalidOpinion?:boolean;invalidFinal?:boolean;human?:boolean;abort?:AbortController;wrongExecute?:boolean}={}){
 const prompts:any[]=[],executions:any[]=[],sessions=new Map<string,string>();let failB=options.failB;
 const run:typeof runProcess=async(executable,args,request)=>{
  if(executable===process.execPath){const payload=JSON.parse(request.input!);executions.push(payload);fs.writeFileSync(path.join(payload.workspace,'hello.txt'),options.wrongExecute?'wrong\n':'hello\n');request.onLine?.(JSON.stringify({type:'thread',id:'local-sdk-worker-thread'}));request.onLine?.(JSON.stringify({type:'result',data:{mode:'native',summary:'Local SDK worker fixture; no remote call'}}));return {exitCode:0,stdout:'',stderr:''};}
  const prompt=JSON.parse(request.input!),model=args[args.indexOf('--model')+1],sid=args[args.indexOf(args.includes('--resume')?'--resume':'--session-id')+1]!;
  if(sessions.has(sid))assert.equal(sessions.get(sid),model);else sessions.set(sid,model!);
  prompts.push({prompt,model,sid,args});
  if(failB&&model==='opus'&&prompt.decisionStage==='draft'){failB=false;throw Error('fixture B unavailable');}
  if(options.hangB&&model==='opus'&&prompt.decisionStage==='draft')await new Promise<void>((_resolve,reject)=>{const abort=()=>reject(Error('Fixture decision timeout'));request.signal!.addEventListener('abort',abort,{once:true});if(request.signal!.aborted)abort();});
  if(options.abort&&model==='opus'&&prompt.decisionStage==='draft'){options.abort.abort();throw Error('Stopped');}
  let output:any=prompt.decisionStage==='discussion'?{summary:`${model} independent opinion`,disagreements:['Different proposal'],amendments:['Keep seed']}:prompt.decisionStage?structuredClone(plan):{verdict:'pass',reason:'Local review fixture'};
  if(options.invalidOpinion&&prompt.decisionStage==='discussion')output={summary:'missing fields'};
  if(options.invalidFinal&&prompt.decisionStage==='synthesis')output={humanDecision:null,tasks:[plan.tasks[0],plan.tasks[0]]};
  if(options.human&&prompt.decisionStage==='synthesis')output={humanDecision:'Need explicit requirement clarification',tasks:[]};
  request.onLine?.(JSON.stringify({type:'system',subtype:'init',model}));
  request.onLine?.(JSON.stringify({type:'assistant',message:{id:randomUUID(),content:[{type:'text',text:`Public output from ${model}`}],usage:{input_tokens:10},model}}));
  const result={type:'result',session_id:sid,structured_output:output,usage:{input_tokens:10,output_tokens:10}};
  request.onLine?.(JSON.stringify(result));return {exitCode:0,stdout:JSON.stringify(result),stderr:''};
 };
 return {run,prompts,executions,sessions};
}
for(const rounds of [0,1] as const)for(const primary of ['a','b'] as const)test(`${rounds} rounds, primary ${primary}: independent CLI Sessions, fixed exchange, final Controller validation, one SDK executor`,async()=>{
 const f=await fixture(rounds,primary),p=protocol(),state=await drive(f.store,new RealAgents(f.config,p.run));
 assert.equal(state.phase,'completed',state.reason);assert.equal(state.loops,1);assert.equal(p.executions.length,1);
 assert.equal(p.prompts.length,4+2*rounds);assert.equal(state.claudeCalls,4+2*rounds);
 assert.equal(p.sessions.size,2);assert.equal(state.discussion!.participants.length,2);
 assert.notEqual(state.discussion!.participants[0]!.session!.sessionId,state.discussion!.participants[1]!.session!.sessionId);
 assert.equal(state.discussion!.participants.reduce((n,p)=>n+p.calls,0),state.claudeCalls);
 const drafts=p.prompts.filter(p=>p.prompt.decisionStage==='draft');assert.deepEqual(drafts.map(p=>p.model),['sonnet','opus']);
 for(const draft of drafts){assert.equal('exchange' in draft.prompt,false);assert.equal(draft.args.includes('--resume'),false);}
 const opinions=p.prompts.filter(p=>p.prompt.decisionStage==='discussion');assert.equal(opinions.length,2*rounds);
 for(const row of opinions){assert.deepEqual(row.prompt.exchange.peerDraft,plan);assert.equal('opinions' in row.prompt.exchange,false);assert.equal(row.args.includes('--resume'),true);}
 const synthesis=p.prompts.find(p=>p.prompt.decisionStage==='synthesis')!;assert.equal(synthesis.model,primary==='a'?'sonnet':'opus');assert.equal(Object.keys(synthesis.prompt.exchange.opinions).length,2*rounds);
 const events=records(f.store);assert.ok(events.findIndex(e=>e.event==='plan')<events.findIndex(e=>e.event==='codex-thread'));assert.deepEqual(events.filter(e=>e.event==='discussion-output').map(e=>[e.data.participantId,e.data.discussionStage]),rounds? [['a','draft'],['b','draft'],['a','discussion'],['b','discussion'],[primary,'synthesis']]:[['a','draft'],['b','draft'],[primary,'synthesis']]);
 const usage=runUsage(f.store).calls.filter(c=>c.phase!=='execute');assert.ok(usage.every(c=>c.participantId));assert.equal(usage.length,4+2*rounds);
 for(const receipt of usage){const persisted=JSON.parse(fs.readFileSync(f.store.file(`context/${receipt.callId}.usage.json`),'utf8'));assert.equal(persisted.participantId,receipt.participantId);assert.equal(JSON.parse(fs.readFileSync(receipt.manifestPath,'utf8')).participantId,receipt.participantId);}
 assert.equal(fs.readFileSync(path.join(f.source,'hello.txt'),'utf8'),'hello\n');assert.equal(fs.readFileSync(path.join(state.workspace,'seed.txt'),'utf8'),'keep\n');
 assert.equal(state.snapshotPolicy,'none');assert.equal(fs.existsSync(f.store.file('snapshot-objects')),false);assert.equal(fs.existsSync(f.store.file('project-baseline.json')),false);
});
test('failed B draft: explicit resume keeps A output and both sessions/call counts, no fallback or early Execute',async()=>{
 const f=await fixture(),p=protocol({failB:true});let state=await drive(f.store,new RealAgents(f.config,p.run));
 assert.equal(state.phase,'paused');assert.match(state.reason,/决策者 B.*failed/);assert.equal(p.executions.length,0);assert.equal(state.discussion!.steps[0]!.status,'success');
 const sid=state.discussion!.participants[0]!.session!.sessionId;
 state=await drive(new Store(f.config.runtimeDir,f.store.id),new RealAgents(f.config,p.run));assert.equal(p.prompts.length,2);assert.equal(state.phase,'paused');
 state=await drive(f.store,new RealAgents(f.config,p.run),'确认重试失败的 B 调用，保持原配置');assert.equal(state.phase,'completed',state.reason);
 assert.equal(p.prompts.filter(r=>r.prompt.decisionStage==='draft'&&r.model==='sonnet').length,1);assert.equal(state.discussion!.participants[0]!.session!.sessionId,sid);assert.equal(state.claudeCalls,7);
});
test('invalid opinion or invalid final Plan blocks Execute; Controller does not accept duplicate task IDs',async()=>{
 for(const option of [{invalidOpinion:true},{invalidFinal:true}]){const f=await fixture(),p=protocol(option),state=await drive(f.store,new RealAgents(f.config,p.run));assert.equal(p.executions.length,0);assert.notEqual(state.phase,'completed');assert.match(state.reason,option.invalidOpinion?/Schema/:/Duplicate task IDs/);}
});
test('Controller refuses a dual configuration whose adapter bypasses independent discussion calls',async()=>{
 const f=await fixture(),mock=new MockAgents(f.config);mock.plan=async()=>plan;
 const state=await drive(f.store,mock);assert.equal(state.phase,'paused');assert.equal(state.loops,0);assert.match(state.reason,/双决策周期未完成/);assert.equal(state.codexThreadId,null);
});
test('interruption preserves durable drafts; restart never silently retries unfinished planning',async()=>{
 const abort=new AbortController(),f=await fixture(),p=protocol({abort});let state=await drive(f.store,new RealAgents(f.config,p.run),undefined,abort.signal);
 assert.equal(state.phase,'stopped');assert.equal(p.executions.length,0);assert.equal(state.discussion!.steps[0]!.status,'success');
 // Simulate process loss after dispatch and before any result, not an orderly stop.
 state.phase='planning';state.discussion!.steps[1]!.status='running';f.store.save(state);
 const fresh=protocol();state=await drive(f.store,new RealAgents(f.config,fresh.run));assert.equal(state.phase,'paused');assert.equal(fresh.prompts.length,0);assert.equal(state.discussion!.steps[1]!.status,'interrupted');
 state=await drive(f.store,new RealAgents(f.config,fresh.run),'确认续接原 Session，重试未完成步骤');assert.equal(state.phase,'completed',state.reason);assert.equal(fresh.prompts.filter(r=>r.prompt.decisionStage==='draft').length,1);
});
test('primary-only Replan is labeled separately after human decision; no second discussion',async()=>{
 const f=await fixture(),p=protocol({human:true});let state=await drive(f.store,new RealAgents(f.config,p.run));assert.equal(state.phase,'paused');assert.equal(p.executions.length,0);
 state=await drive(f.store,new RealAgents(f.config,p.run),'需求已明确，继续');assert.equal(state.phase,'completed',state.reason);assert.equal(p.prompts.filter(r=>r.prompt.decisionStage==='replan').length,1);assert.equal(p.prompts.filter(r=>r.prompt.decisionStage==='discussion').length,2);
});
test('existing Review Guard vetoes primary pass when independent tests fail',async()=>{
 const f=await fixture(),p=protocol({wrongExecute:true}),state=await drive(f.store,new RealAgents(f.config,p.run));assert.equal(state.phase,'paused');assert.equal(state.evidence?.passed,false);assert.ok(records(f.store).some(e=>e.event==='review-vetoed'));
});
test('participant/model changes and shared Sessions are rejected, unsupported role configurations cannot start',async()=>{
 const f=await fixture(),p=protocol();await drive(f.store,new RealAgents(f.config,p.run));const state=f.store.load();
 state.config.decisionDiscussion!.rounds=0;assert.throws(()=>f.store.save(state),/Immutable/);
 const shared=f.store.load();shared.discussion!.participants[1]!.session=structuredClone(shared.discussion!.participants[0]!.session);shared.discussion!.participants[1]!.claudeSessionId=shared.discussion!.participants[0]!.claudeSessionId;assert.throws(()=>assertDiscussion(shared),/share/);
 for(const bad of [{...f.config,decisionDiscussion:{...f.config.decisionDiscussion,rounds:2}},{...f.config,decisionDiscussion:{participants:[{id:'a',agent:{backend:'unsupported'}},{id:'b',agent:{backend:'claude-code'}}],rounds:1,primary:'a'}},{...f.config,executionAgent:{backend:'opencode'}}])assert.throws(()=>validate(configSchema,bad));
});
test('legacy single decision and dual Mock runs retain accurate local-only labels',async()=>{
 const single=await fixture(0,'a',{mode:'mock',decisionDiscussion:undefined,decisionAgent:undefined});const singleState=await drive(single.store,new MockAgents(single.config));assert.equal(singleState.phase,'completed');assert.equal(singleState.discussion,undefined);assert.equal(singleState.claudeCalls,0);
 const dual=await fixture(1,'b',{mode:'mock'}),state=await drive(dual.store,new MockAgents(dual.config));assert.equal(state.phase,'completed',state.reason);assert.equal(state.discussion!.participants.reduce((n,p)=>n+p.calls,0),7);assert.ok(records(dual.store).filter(e=>e.event==='discussion-output').every(e=>e.data.mode==='mock'));assert.equal(runUsage(dual.store).calls.length,0);
});
test('every decision call gets its own real Project Context manifest and current module catalog',async()=>{
 const f=await fixture(1,'a',{},true),p=protocol(),agents=new RealAgents(f.config,p.run);
 await agents.plan(f.store.load(),f.store,new AbortController().signal);
 assert.equal(p.prompts.length,5);
 for(const row of p.prompts){assert.ok(row.prompt.context.moduleCatalog.some((m:any)=>m.id==='fixture'));assert.match(row.prompt.action,/moduleIds/);}
 const manifests=records(f.store).filter(e=>e.event==='context-manifest');assert.equal(manifests.length,5);assert.equal(new Set(manifests.map(e=>e.data.callId)).size,5);assert.ok(manifests.every(e=>e.data.participantId));
 const state=f.store.load();state.tasks=plan.tasks.map(t=>({...t,moduleIds:['fixture']}));f.store.save(state);await agents.review(state,f.store,new AbortController().signal);
 const reviewReceipt=runUsage(f.store).calls.find(c=>c.phase==='review')!;assert.equal(JSON.parse(fs.readFileSync(reviewReceipt.manifestPath,'utf8')).participantId,'a');
});
test('individual decision timeout remains explicit and never starts Execute or substitutes a model',async()=>{
 const f=await fixture(1,'a',{timeoutMs:500}),p=protocol({hangB:true}),state=await drive(f.store,new RealAgents(f.config,p.run));assert.equal(state.phase,'paused');assert.match(state.reason,/决策者 B.*timeout/);assert.equal(p.executions.length,0);assert.equal(state.discussion!.participants[1]!.calls,1);assert.equal(state.discussion!.steps[0]!.status,'success');
});
function localOpenCode(){
 const sessions=new Map<string,any>(),prompts:any[]=[],runtimes:string[]=[];let closes=0;
 const launcher:OpenCodeLauncher=async(_executable,directory,_signal,runtime)=>{
  runtimes.push(runtime!);const streams:ServerResponse[]=[];
  const server=createServer(async(req,res)=>{
   let body='';for await(const chunk of req)body+=chunk;const data=body?JSON.parse(body):{},url=new URL(req.url!,'http://localhost');
   const send=(value:any)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
   if(url.pathname==='/provider')return send({connected:['fixture'],all:[{id:'fixture',name:'Local fixture',models:Object.fromEntries(['m1','m2'].map(id=>[id,{id,name:id,capabilities:{toolcall:true}}]))}],default:{}});
   if(url.pathname==='/global/event'){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': local fixture\n\n');streams.push(res);return;}
   if(url.pathname==='/session'&&req.method==='POST'){const session={id:'ses_'+randomUUID(),directory,title:data.title};sessions.set(session.id,session);return send(session);}
   const match=url.pathname.match(/^\/session\/([^/]+)(.*)$/),id=match?.[1],tail=match?.[2];
   if(id&&tail==='')return send(sessions.get(id));
   if(id&&tail==='/message'){
    const prompt=JSON.parse(data.parts[0].text);prompts.push({id,model:data.model,prompt});
    const output=prompt.decisionStage==='discussion'?{summary:'Local OpenCode opinion',disagreements:['Fixture alternative'],amendments:['Keep seed']}:prompt.decisionStage?plan:{verdict:'pass',reason:'Local OpenCode review fixture'};
    return send({info:{id:'msg_'+randomUUID(),sessionID:id,role:'assistant',path:{cwd:directory},providerID:data.model.providerID,modelID:data.model.modelID,tokens:{input:12,output:4},structured:output},parts:[{id:randomUUID(),sessionID:id,type:'text',text:'Local OpenCode public output'}]});
   }
   res.writeHead(404);res.end();
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as any).port;
  return {client:createOpencodeClient({baseUrl:`http://127.0.0.1:${port}`,directory,throwOnError:true}),openapi:{paths:{'/session/{sessionID}/message':{post:{requestBody:{content:{'application/json':{schema:{properties:{format:{properties:{type:{const:'json_schema'}}}}}}}}}}}},async close(){closes++;for(const stream of streams)stream.end();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
 };
 return {launcher,prompts,runtimes,sessions,get closes(){return closes}};
}
for(const mixed of [false,true])test(`${mixed?'Claude Code + OpenCode':'OpenCode + OpenCode'} uses real V1 SDK against local HTTP fixtures with independent sessions and event attribution`,async()=>{
 const decisionDiscussion:DecisionDiscussion={participants:[{id:'a',agent:mixed?{backend:'claude-code',model:'sonnet'}:{backend:'opencode',opencode:{providerID:'fixture',modelID:'m1'}}},{id:'b',agent:{backend:'opencode',opencode:{providerID:'fixture',modelID:'m2'}}}],primary:'b',rounds:1};
 const f=await fixture(1,'b',{decisionDiscussion}),server=localOpenCode(),p=protocol(),agents=new RealAgents(f.config,p.run,undefined,config=>new OpenCodeDecisionAgent(config,server.launcher));
 const state=await drive(f.store,agents);assert.equal(state.phase,'completed',state.reason);assert.equal(state.claudeCalls,6);assert.equal(server.prompts.length,mixed?4:6);assert.equal(server.closes,server.prompts.length);
 assert.equal(server.sessions.size,mixed?1:2);assert.ok(server.runtimes.every(r=>/[/\\][ab]$/.test(r)));
 assert.equal(p.executions.length,1);assert.ok(server.prompts.filter(p=>p.prompt.decisionStage==='draft').every(p=>!p.prompt.exchange));
 assert.equal(state.discussion!.participants[1]!.calls,4);assert.equal(state.discussion!.participants[0]!.calls,2);
 for(const event of records(f.store).filter(e=>e.event==='agent-activity'&&e.data.agent==='opencode'))assert.equal(event.data.participantAgent.backend,'opencode');
 assert.ok([...server.sessions.values()].every(s=>/:[ab]$/.test(s.title)));
});
