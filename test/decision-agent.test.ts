import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createOpencodeClient } from '@opencode-ai/sdk/v2';
import { createRun } from '../src/controller.js';
import { driveWithUserAcceptance as drive } from './helpers/accepted-flow.js';
import { OpenCodeDecisionAgent, discoverOpencodeModels, opencodePublicEvents, supportsStructuredOutput, startOpencodeService, type OpenCodeLauncher } from '../src/opencode-decision-agent.js';
import { ClaudeCodeDecisionAgent } from '../src/claude-code-decision-agent.js';
import { assertDecisionState, type DecisionRequest } from '../src/decision-agent.js';
import { planSchema, reviewSchema, type Config } from '../src/schema.js';
import { RealAgents } from '../src/real-agents.js';
import { Store, atomicJson } from '../src/store.js';
import { runUsage } from '../src/call-observation.js';
import { mockContextDocuments } from '../src/project-context.js';
import { git } from '../src/workspace.js';

const root = path.resolve('.validation',`da-${randomUUID().slice(0,6)}`);
fs.mkdirSync(root,{recursive:true});
const plan = {humanDecision:null,tasks:[{id:'core',instruction:'本地确定性夹具',acceptance:['可信验收通过'],moduleIds:['fixture']}]};
const review = {verdict:'pass',reason:'本地确定性假服务',contextReview:{expansionReason:'',unmappedReason:'',checkedContracts:[],modules:[{moduleId:'fixture',documentUpdated:false,noUpdateReason:'局部夹具修改不改变职责',checkedFiles:[],constraintsChanged:false,disposition:'已核对'}]}};
const api = { paths: {'/session/{sessionID}/message':{post:{requestBody:{content:{'application/json':{schema:{properties:{format:{oneOf:[{properties:{type:{const:'json_schema'}}}]}}}}}}}}} };
const records = (store:Store) => fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
async function fixture(context=false, extra:Partial<Config>={}) {
  const dir=path.join(root,randomUUID().slice(0,6)),source=path.join(dir,'s'); fs.mkdirSync(source,{recursive:true});
  fs.writeFileSync(path.join(source,'core.js'),'initial\n');
  if(context)for(const [file,content]of Object.entries(mockContextDocuments(randomUUID(),'core.js'))){const p=path.join(source,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,content);}
  const verify=path.join(dir,'verify.cjs'); fs.writeFileSync(verify,"require('node:assert/strict').equal(require('fs').readFileSync('core.js','utf8'),'fixed\\n')");
  const config:Config={allowedRepositories:[source],runtimeDir:path.join(dir,'r'),projectMode:'direct',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},executionMode:'native',mode:'mock',claudeExecutable:'never-paid',timeoutMs:3000,maxLoops:1,maxReworks:0,maxClaudeCalls:6,tests:[{executable:process.execPath,args:[verify]}],mockScenario:'pass',decisionAgent:{backend:'opencode',opencode:{providerID:'connected',modelID:'dynamic-model'}},...extra};
  const store=await createRun(config,source,'fixture');return{config,store,source,dir};
}
function request(f:Awaited<ReturnType<typeof fixture>>,role:'plan'|'review'='plan',signal=new AbortController().signal):DecisionRequest{
  const state=f.store.load();return {state,store:f.store,role,phase:role,prompt:JSON.stringify({action:'local mock only'}),schema:role==='plan'?planSchema:reviewSchema,workspace:fs.realpathSync(state.workspace),runId:state.id,taskId:role==='plan'?null:state.tasks[state.taskIndex]?.id??null,timeoutMs:f.config.timeoutMs,signal};
}
// Local HTTP server exercises the installed SDK serializer and SSE parser.
// Compatible legacy endpoints come from SDK 1.18.35; native 2.0.20's format
// absence is covered separately. No fixture ever launches a model process.
function fake(options:{output?:unknown;textOnly?:boolean;tools?:boolean;hang?:boolean;badOwner?:boolean;noFormat?:boolean;native?:boolean;nullUsage?:boolean}={}) {
  const sessions=new Map<string,any>();let calls=0,closes=0,aborts=0,prompts=0;const ports:number[]=[],requests:any[]=[];
  const launcher:OpenCodeLauncher=async(_executable,directory,signal)=>{
    calls++;const streams:ServerResponse[]=[];
    const server=createServer(async(req,res)=>{
      const url=new URL(req.url!,'http://localhost');let body='';for await(const chunk of req)body+=chunk;
      const data=body?JSON.parse(body):{};requests.push({path:url.pathname,query:Object.fromEntries(url.searchParams),body:data,header:req.headers['x-opencode-directory']});
      const send=(value:any)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
      if(url.pathname==='/provider')return send({connected:['connected'],all:[{id:'disconnected',name:'Do not expose',models:{}},{id:'connected',name:'Dynamic',key:'sk-secretmock0000',models:{dynamic:{id:'dynamic-model',name:'Dynamic Model',capabilities:{toolcall:options.tools!==false},secret:'never-expose'}}}],default:{}});
      if(url.pathname==='/api/provider')return send({location:{directory},data:[{id:'connected',name:'Dynamic',activation:'enabled',headers:{authorization:'secret'}}]});
      if(url.pathname==='/api/model')return send({location:{directory},data:[{id:'dynamic-model',providerID:'connected',name:'Dynamic Model',enabled:true,capabilities:{tools:true,input:["text","image"]},request:{headers:{authorization:'secret'}}}]});
      if(url.pathname==='/global/event'){
        res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': connected\n\n');streams.push(res);return;
      }
      if(url.pathname==='/session'&&req.method==='POST'){
        const session={id:`ses_${randomUUID()}`,directory,title:data.title};sessions.set(session.id,session);return send(session);
      }
      const match=url.pathname.match(/^\/session\/([^/]+)(.*)$/),id=match?.[1],tail=match?.[2];
      if(id&&tail==='')return send({...sessions.get(id),...(options.badOwner?{title:'other-run'}:{})});
      if(id&&tail==='/message'){
        prompts++;
        for(const s of streams) for(const [d,sid,type,text]of [[directory,id,'reasoning','PRIVATE_THINKING'],['D:/other',id,'text','WRONG_DIRECTORY'],[directory,'other','text','WRONG_SESSION'],[directory,id,'text','public sk-secretmock0000']]) s.write('data: '+JSON.stringify({directory:d,payload:{type:'message.part.updated',properties:{part:{id:randomUUID(),sessionID:sid,type,text}}}})+'\n\n');
        if(options.hang)return;
        return send({info:{id:`msg_${prompts}`,sessionID:id,role:'assistant',path:{cwd:directory},modelID:'dynamic-model',providerID:'connected',...(options.nullUsage?{}:{tokens:{input:12,output:3,cache:{read:4,write:0}}}),...(options.textOnly?{}:{structured:options.output??(data.format.schema.properties.tasks?plan:review)})},parts:[{id:'public',sessionID:id,type:'text',text:'public sk-secretmock0000'},{id:'hidden',sessionID:id,type:'reasoning',text:'PRIVATE_THINKING'}]});
      }
      if(id&&tail==='/abort'){aborts++;return send(true);}
      if(url.pathname==='/session/status')return send({});
      res.writeHead(404);res.end();
    });
    server.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as any).port;ports.push(port);
    const client=createOpencodeClient({baseUrl:`http://127.0.0.1:${port}`,directory,throwOnError:true});
    return {client,openapi:options.native?{paths:{'/api/provider':{},'/api/model':{}}}:options.noFormat?{paths:{}}:api,async close(){closes++;for(const s of streams)s.end();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
  };
  return {launcher,requests,ports,get calls(){return calls},get closes(){return closes},get aborts(){return aborts},get prompts(){return prompts}};
}
test('OpenCode SDK Plan/Review structured output, native usage, scope, resume, public redaction',async()=>{
  const f=await fixture(),server=fake(),adapter=new OpenCodeDecisionAgent(f.config,server.launcher);
  const first=await adapter.structured(request(f));assert.deepEqual(first.output,plan);assert.equal(first.usage.inputTokens,12);
  const second=await adapter.structured(request(f,'review'));assert.deepEqual(second.output,review);assert.equal(second.sessionId,first.sessionId);
  assert.equal(server.calls,2);assert.equal(server.closes,2);assert.notEqual(server.ports[0],server.ports[1]);
  for(const r of server.requests.filter(r=>r.path.startsWith('/session'))){assert.equal(r.query.directory,fs.realpathSync(f.store.load().workspace));}
  const prompt=server.requests.find(r=>r.path.endsWith('/message'))!.body;assert.equal(prompt.format.type,'json_schema');assert.equal(prompt.format.retryCount,0);assert.ok(prompt.system);assert.equal(prompt.tools,undefined);
  const log=fs.readFileSync(f.store.file('audit.jsonl'),'utf8');for(const secret of ['PRIVATE_THINKING','WRONG_DIRECTORY','WRONG_SESSION','sk-secretmock0000','never-expose'])assert.ok(!log.includes(secret));
  assert.ok(log.includes('已隐藏凭据'));assert.equal(f.store.load().claudeCalls,2);
  assert.equal(runUsage(f.store).reported.opencode.inputTokens,24);
});
test('OpenCode refuses malformed Schema output, plain text, missing model tools and native v2 format absence',async()=>{
  for(const options of [{output:{tasks:[]}},{textOnly:true},{tools:false},{noFormat:true},{native:true}]){
    const f=await fixture(),server=fake(options),adapter=new OpenCodeDecisionAgent(f.config,server.launcher);
    await assert.rejects(()=>adapter.structured(request(f)),/Schema|tools|structured output/);
    assert.equal(server.closes,1);assert.equal(f.store.load().claudeCalls,1);
    if('tools'in options||'noFormat'in options||'native'in options)assert.equal(server.prompts,0);
  }
});
test('dynamic model discovery returns only safe whitelist; v2 incompatibility remains unavailable',async()=>{
  for(const native of [false,true]){
    const server=fake({native});const result=await discoverOpencodeModels(undefined,root,server.launcher);
    assert.equal(result.providers[0]?.models[0]?.id,'dynamic-model');assert.equal(result.available,!native);assert.equal(server.closes,1);
    assert.equal(result.providers[0]?.models[0]?.capabilities.images,native?true:'unknown');
    assert.ok(!JSON.stringify(result).includes('secret'));assert.ok(!JSON.stringify(result).includes('disconnected'));
  }
});

test('connected provider without tool-capable models remains visible but cannot claim availability',async()=>{
  const server=fake({tools:false});const result=await discoverOpencodeModels(undefined,root,server.launcher);
  assert.equal(result.available,false);assert.match(result.reason,/No OpenCode model supports/);
  assert.equal(result.providers[0]?.models[0]?.capabilities.tools,false);
  assert.equal(result.providers[0]?.models[0]?.capabilities.structuredOutput,false);
  assert.equal(server.prompts,0);assert.equal(server.closes,1);
});
test('cancel calls session.abort, waits idle and releases owned server; timeout also terminates',async()=>{
  for(const timeout of [false,true]){
    const f=await fixture(false,{timeoutMs:150}),server=fake({hang:true}),adapter=new OpenCodeDecisionAgent(f.config,server.launcher),cancel=new AbortController();
    const result=adapter.structured(request(f,'plan',cancel.signal));if(!timeout)setTimeout(()=>cancel.abort(),80);
    await assert.rejects(()=>result,timeout?/Timeout/:/Stopped/);assert.equal(server.aborts,1);assert.equal(server.closes,1);
    assert.ok(server.requests.some(r=>r.path==='/session/status'));
  }
});
test('unknown usage stays null; never estimates tokens or complete request counts',async()=>{
  const f=await fixture(),server=fake({nullUsage:true});const result=await new OpenCodeDecisionAgent(f.config,server.launcher).structured(request(f));
  for(const key of ['inputTokens','outputTokens','cacheReadTokens','cacheCreationTokens','modelRequests']as const)assert.equal(result.usage[key],null);
  assert.equal(result.usage.completeness,'unknown');
});
test('immutable identity and Run/Task/directory/session ownership reject before service start',async()=>{
  const f=await fixture(),server=fake(),adapter=new OpenCodeDecisionAgent(f.config,server.launcher);
  for(const key of ['runId','taskId','workspace']as const){const r=request(f);r[key]='wrong';await assert.rejects(()=>adapter.structured(r),/scope/);}
  const state=f.store.load();state.decisionSession={backend:'opencode',sessionId:'ses_other',runId:'wrong',workspace:state.workspace,directory:state.workspace};assert.throws(()=>assertDecisionState(state),/ownership/);
  state.decisionSession={...state.decisionSession,runId:state.id,directory:'other'};assert.throws(()=>assertDecisionState(state),/ownership/);
  state.decisionAgent={backend:'claude-code'};assert.throws(()=>f.store.save(state),/Immutable/);assert.equal(server.calls,0);
  const r=request(f);r.state.config={...r.state.config,decisionAgent:{backend:'claude-code'}};assert.throws(()=>assertDecisionState(r.state),/Immutable/);
});
test('remote Session ownership and disappearance fail; no fallback session or backend',async()=>{
  const f=await fixture(),server=fake({badOwner:true}),adapter=new OpenCodeDecisionAgent(f.config,server.launcher);
  await adapter.structured(request(f));await assert.rejects(()=>adapter.structured(request(f,'review')),/ownership/);assert.equal(server.prompts,1);assert.equal(server.closes,2);
});
test('legacy Claude CLI parameters, public stream, resume and usage preserve old contract',async()=>{
  const f=await fixture(false,{decisionAgent:undefined}),calls:string[][]=[];
  const adapter=new ClaudeCodeDecisionAgent(f.config,async(executable,args,options)=>{
    assert.equal(executable,'never-paid');calls.push(args);assert.equal(options.cwd,f.store.load().workspace);
    const event={type:'result',session_id:f.store.load().claudeSessionId,structured_output:args.includes('--resume')?review:plan,modelUsage:{'mock-claude':{inputTokens:10,outputTokens:2,cacheReadInputTokens:0,cacheCreationInputTokens:0}}};options.onLine!(JSON.stringify(event));return{exitCode:0,stdout:'',stderr:''};
  });
  await adapter.structured(request(f));await adapter.structured(request(f,'review'));
  assert.ok(calls[0]?.includes('--session-id'));assert.ok(calls[1]?.includes('--resume'));
  for(const args of calls)for(const value of ['--permission-mode','bypassPermissions','--system-prompt-snapshot','off','--append-system-prompt','--json-schema','--verbose','--include-partial-messages'])assert.ok(args.includes(value));
  assert.equal(records(f.store).filter(e=>e.event==='claude-exit').length,2);assert.equal(runUsage(f.store).reported.claude.inputTokens,null);
});
test('legacy paid budget fields do not block OpenCode; decision usage remains counted',async()=>{
  const f=await fixture(false,{maxClaudeCalls:1}),server=fake(),adapter=new OpenCodeDecisionAgent(f.config,server.launcher);
  await adapter.structured(request(f));await adapter.structured(request(f,'review'));assert.equal(server.calls,2);assert.equal(f.store.load().claudeCalls,2);
  const budget=path.join(f.dir,'missing-global.json');
  const g=await fixture(false,{globalBudget:{file:budget,limit:1}}),a=new OpenCodeDecisionAgent(g.config,server.launcher);
  await a.structured(request(g));await a.structured(request(g,'review'));assert.equal(server.calls,4);assert.equal(fs.existsSync(budget),false);
});
test('formal Controller OpenCode fake backend with native Mock execution preserves Context and transported decision',async()=>{
  for(const fail of [false,true]){
    const f=await fixture(true),server=fake(),real=new RealAgents(f.config,undefined,new OpenCodeDecisionAgent(f.config,server.launcher));
    const done=await drive(f.store,{executionMode:'native',plan:real.plan.bind(real),review:real.review.bind(real),async execute(state){fs.writeFileSync(path.join(state.workspace,'core.js'),fail?'wrong\n':'fixed\n');return{mode:'native',summary:'本地 Mock 执行，无付费请求'};}});
    assert.equal(done.phase,'completed');assert.equal(done.claudeCalls,2);assert.equal(done.evidence?.passed,false);assert.equal(done.evidence?.decisionAccepted,true);
    assert.equal(fs.readFileSync(path.join(f.source,'core.js'),'utf8'),fail?'wrong\n':'fixed\n');
    assert.ok(records(f.store).some(e=>e.event==='context-manifest'));
    assert.ok(!records(f.store).some(e=>e.event==='review-vetoed'));
    assert.equal(server.closes,2);
  }
});
test('event allowlist discards reasoning and missing/wrong scope',()=>{
  for(const type of ['reasoning','file','snapshot'])assert.deepEqual(opencodePublicEvents({directory:'d',payload:{properties:{part:{sessionID:'s',type,text:'hidden'}}}},'d','s'),[]);
  assert.deepEqual(opencodePublicEvents({payload:{properties:{part:{sessionID:'s',type:'text',text:'no directory'}}}},'d','s'),[]);
  assert.equal(supportsStructuredOutput({paths:{'/api/session/{sessionID}/prompt':{}}}),false);
});
test('owned launcher uses atomic dynamic ports and kills real local Node process trees on success/startup error/cancel',async()=>{
  const script=path.join(root,'server.cjs');fs.writeFileSync(script,"const http=require('http');const s=http.createServer((q,r)=>{r.setHeader('Content-Type','application/json');r.end(JSON.stringify({paths:{}}));});s.listen(0,'127.0.0.1',()=>console.log('server listening on http://127.0.0.1:'+s.address().port));");
  const children:ChildProcess[]=[],argsSeen:string[][]=[];
  const spawner:typeof spawn=((_exe:string,args:string[],options:any)=>{argsSeen.push(args);const c=spawn(process.execPath,[script],options);children.push(c);return c;}) as typeof spawn;
  const services=await Promise.all([startOpencodeService(process.execPath,root,new AbortController().signal,undefined,spawner),startOpencodeService(process.execPath,root,new AbortController().signal,undefined,spawner)]);
  for(const args of argsSeen)assert.deepEqual(args,['serve','--hostname','127.0.0.1','--port','0']);
  await Promise.all(services.map(service=>service.close()));for(const c of children)assert.throws(()=>process.kill(c.pid!,0));
  const broken=path.join(root,'broken.cjs');fs.writeFileSync(broken,"console.error('secret startup log');process.exit(1)");
  const failedSpawner:typeof spawn=((_exe:string,_args:string[],options:any)=>spawn(process.execPath,[broken],options))as typeof spawn;
  await assert.rejects(()=>startOpencodeService(process.execPath,root,new AbortController().signal,undefined,failedSpawner),/failed to start/);
  const waitingSpawner:typeof spawn=((_exe:string,_args:string[],options:any)=>{const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],options);children.push(c);return c;})as typeof spawn;
  await assert.rejects(()=>startOpencodeService(process.execPath,root,AbortSignal.timeout(100),undefined,waitingSpawner),/Stopped/);for(const c of children)assert.throws(()=>process.kill(c.pid!,0));
});
test('formal real-mode OpenCode uses current dev scheduling without shared authorization files',async()=>{
  for(const limit of [1,2]){
    const f=await fixture(false,{mode:'real'}),server=fake(),real=new RealAgents(f.config,undefined,new OpenCodeDecisionAgent(f.config,server.launcher));
    const cc=path.join(f.dir,'missing-cc.json'),cx=path.join(f.dir,'missing-cx.json'),policy=path.join(f.dir,'missing-policy.json');
    const done=await drive(f.store,{executionMode:'native',plan:real.plan.bind(real),review:real.review.bind(real),async execute(state){fs.writeFileSync(path.join(state.workspace,'core.js'),'fixed\n');return{mode:'native',summary:'Mock execution'};}});
    assert.equal(done.phase,'completed');assert.equal(server.calls,2);assert.equal(done.claudeCalls,2);for(const file of [cc,cx,policy])assert.equal(fs.existsSync(file),false);
  }
});
test('failed Run preparation still freezes the selected Decision Agent identity',async()=>{
  const f=await fixture();await git(f.source,['init']);await git(f.source,['add','.']);await git(f.source,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']);
  const head=(await git(f.source,['rev-parse','HEAD'])).trim();const object=path.join(f.source,'.git','objects',head.slice(0,2),head.slice(2));fs.unlinkSync(object);
  let runId:string|undefined;
  await assert.rejects(()=>createRun({...f.config,projectMode:'isolated'},f.source,'corrupt fixture'),(error:any)=>{runId=error.runId;return /Git|git|bad object|revision/.test(error.message);});
  assert.ok(runId);const state=new Store(f.config.runtimeDir,runId).load();assert.deepEqual(state.decisionAgent,{backend:'opencode',providerID:'connected',modelID:'dynamic-model'});assertDecisionState(state);assert.equal(state.phase,'failed');
});

test('zero-timeout OpenCode decision completes and explicit cancellation remains authoritative',async()=>{
 const f=await fixture(false,{timeoutMs:0}),server=fake(),adapter=new OpenCodeDecisionAgent(f.config,server.launcher);
 const first=await adapter.structured(request(f));assert.deepEqual(first.output,plan);assert.equal(server.prompts,1);
 const stopped=await fixture(false,{timeoutMs:0}),hanging=fake({hang:true}),cancel=new AbortController(),pending=new OpenCodeDecisionAgent(stopped.config,hanging.launcher).structured(request(stopped,'plan',cancel.signal));
 const timer=setTimeout(()=>cancel.abort(),250);
 try{await assert.rejects(pending,/Stopped/);}finally{clearTimeout(timer);}
 assert.equal(hanging.aborts,1);assert.equal(hanging.closes,1);
});

test('Claude and Codex process adapters use the persisted unlimited duration',async()=>{
 const f=await fixture(false,{decisionAgent:{backend:'claude-code'},timeoutMs:150,claudeStreaming:false});
 const state=f.store.load();state.config.timeoutMs=0;f.store.save(state);
 const claude=new ClaudeCodeDecisionAgent(f.config,async(_exe,args,options)=>{
  assert.equal(options.timeoutMs,0);
  const sessionId=args[args.indexOf('--session-id')+1];
  return {exitCode:0,stderr:'',stdout:JSON.stringify({session_id:sessionId,structured_output:plan})};
 });
 const reply=await claude.structured({...request(f),state:f.store.load(),timeoutMs:0});assert.deepEqual(reply.output,plan);
 const executing=f.store.load();executing.tasks=plan.tasks;executing.loops=1;executing.phase='executing';f.store.save(executing);
 const agents=new RealAgents(f.config,async(_exe,_args,options)=>{
  assert.equal(options.timeoutMs,0);assert.ok(options.onLine);
  options.onLine!(JSON.stringify({type:'result',data:{mode:'native',summary:'LOCAL worker fixture'}}));
  return {exitCode:0,stdout:'',stderr:''};
 });
 const output=await agents.execute(executing,f.store,new AbortController().signal);
 assert.ok('mode' in output);assert.equal(output.mode,'native');
});
