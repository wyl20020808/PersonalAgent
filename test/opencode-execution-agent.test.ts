import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer, type ServerResponse} from 'node:http';
import {once} from 'node:events';
import {createOpencodeClient} from '@opencode-ai/sdk/v2';
import {createRun, drive} from '../src/controller.js';
import {OpenCodeDecisionAgent, type OpenCodeLauncher} from '../src/opencode-decision-agent.js';
import {OpenCodeExecutionAgent, assertExecutionState, executionPermissions, discoverOpencodeExecutionModels} from '../src/opencode-execution-agent.js';
import {RealAgents} from '../src/real-agents.js';
import {MockAgents} from '../src/adapters.js';
import {configSchema, validate, type Config, type DecisionChoice} from '../src/schema.js';
import {runUsage} from '../src/call-observation.js';
import {previewDelivery, deliveryStatus} from '../src/delivery.js';
import {git} from '../src/workspace.js';

const root=path.resolve('.validation','p3c-'+randomUUID().slice(0,8));fs.mkdirSync(root,{recursive:true});
const choice:Extract<DecisionChoice,{backend:'opencode'}>={backend:'opencode',opencode:{providerID:'fixture',modelID:'local'}};
const task={id:'core',instruction:'Update core.js',acceptance:['core.js is fixed']};
const plan={humanDecision:null,tasks:[task]};
const api={paths:{'/session':{post:{requestBody:{content:{'application/json':{schema:{properties:{permission:{type:'array'}}}}}}}},'/session/{sessionID}/message':{post:{requestBody:{content:{'application/json':{schema:{properties:{agent:{type:'string'},format:{properties:{type:{const:'json_schema'}}}}}}}}}},...Object.fromEntries(['/agent','/experimental/tool','/experimental/tool/ids','/global/event','/session/{sessionID}','/session/status','/session/{sessionID}/abort'].map(p=>[p,{}]))}};
type Options={missingCreation?:boolean;badStatus?:boolean;badFinish?:string;hang?:boolean;badOwner?:boolean;badModel?:boolean;missingTools?:boolean;missingProtocol?:boolean;error?:boolean;textOnly?:boolean;unfinished?:boolean;wrongSession?:boolean;wrongPart?:boolean;failTest?:boolean;busy?:boolean;closeFailure?:boolean;streamFailure?:boolean;afterWrite?:(directory:string)=>void};
function fake(options:Options={}){
 const sessions=new Map<string,any>(),requests:any[]=[];let prompts=0,closes=0,aborts=0;
 const launcher:OpenCodeLauncher=async(_exe,directory,_signal,runtime)=>{
  const streams:ServerResponse[]=[];
  const server=createServer(async(req,res)=>{
   let text='';for await(const chunk of req)text+=chunk;const body=text?JSON.parse(text):{};
   const url=new URL(req.url!,'http://127.0.0.1');requests.push({route:url.pathname,body,directory:url.searchParams.get('directory'),runtime});
   const send=(value:any)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
   if(url.pathname==='/provider')return send({connected:['fixture'],all:[{id:'fixture',name:'LOCAL MOCK',models:{local:{id:'local',name:'LOCAL MOCK',capabilities:{toolcall:true}}}}]});
   if(url.pathname==='/experimental/tool/ids')return send(options.missingCreation?['read','edit','bash']:options.missingTools?['read']:['read','edit','write','bash']);
   if(url.pathname==='/agent')return send([{name:'build',mode:'primary'}]);
   if(url.pathname==='/global/event'){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': ready\n\n');streams.push(res);return;}
   if(url.pathname==='/session'&&req.method==='POST'){const s={id:'ses_'+randomUUID(),directory,title:body.title,permission:body.permission};sessions.set(s.id,s);return send(s);}
   if(url.pathname==='/session/status')return send(options.badStatus?null:options.busy?Object.fromEntries([...sessions.keys()].map(id=>[id,{type:'busy'}])):{});
   const match=url.pathname.match(/^\/session\/([^/]+)(.*)$/),id=match?.[1],tail=match?.[2];
   if(id&&tail==='')return send({...sessions.get(id),...(options.badOwner?{title:'wrong-owner'}:{})});
   if(id&&tail==='/abort'){aborts++;return send(true);}
   if(id&&tail==='/message'){
    prompts++;const execution=body.format.schema.properties.mode, discussion=body.format.schema.properties.disagreements;
    const parts:any[]=[];
    if(execution){
     fs.writeFileSync(path.join(directory,'core.js'),options.failTest?'incorrect\n':'fixed\n');options.afterWrite?.(directory);
     for(const part of [{id:'edit-'+prompts,sessionID:id,type:'tool',tool:'edit',callID:'native-edit',state:{status:'completed',input:{filePath:path.join(directory,'core.js')},output:'LOCAL MOCK write',metadata:{diff:'local fixture diff'}}},{id:'bash-'+prompts,sessionID:id,type:'tool',tool:'bash',callID:'native-bash',state:{status:'completed',input:{command:'node verify.js'},output:'LOCAL MOCK check',metadata:{exit:0}}}])parts.push(part);
     for(const s of streams){for(const part of [...parts,{id:'hidden',sessionID:id,type:'reasoning',text:'PRIVATE_THINKING'},{id:'wrong',sessionID:'wrong',type:'text',text:'WRONG_SESSION'}])s.write('data: '+JSON.stringify({directory,payload:{type:'message.part.updated',properties:{part}}})+'\n\n');s.write('data: '+JSON.stringify({directory:'wrong',payload:{properties:{part:{id:'bad-dir',sessionID:id,type:'text',text:'WRONG_DIRECTORY'}}}})+'\n\n');if(options.streamFailure)s.end();}
     if(options.hang)return;
    }
    if(options.wrongPart)parts.push({id:'other',sessionID:'other',type:'text',text:'other'});
    const structured=execution?{mode:'native',summary:'LOCAL MOCK SDK execution fixture'}:discussion?{summary:'LOCAL MOCK opinion',disagreements:[],amendments:[]}:body.format.schema.properties.tasks?plan:{verdict:'pass',reason:'LOCAL MOCK Review'};
    return send({info:{id:'msg_'+prompts,sessionID:options.wrongSession?'other':id,role:'assistant',providerID:'fixture',modelID:options.badModel?'other':'local',path:{cwd:directory},...(options.unfinished?{}:{finish:options.badFinish??'stop'}),tokens:{input:10,output:2,cache:{read:0,write:0}},...(options.error?{error:{name:'ProviderError'}}:{}),...(options.textOnly?{}:{structured})},parts});
   }
   res.writeHead(404);res.end();
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const client=createOpencodeClient({baseUrl:'http://127.0.0.1:'+(server.address() as any).port,directory,throwOnError:true});
  return {client,openapi:options.missingProtocol?{paths:{}}:api,async close(){closes++;for(const s of streams)s.end();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));if(options.closeFailure)throw Error('exit unknown');}};
 };
 return {launcher,requests,sessions,get prompts(){return prompts},get closes(){return closes},get aborts(){return aborts}};
}
async function fixture(extra:Partial<Config>={}){
 const dir=path.join(root,randomUUID().slice(0,8)),source=path.join(dir,'source');fs.mkdirSync(source,{recursive:true});fs.writeFileSync(path.join(source,'core.js'),'initial\n');
 await git(source,['init']);await git(source,['add','core.js']);await git(source,['-c','user.name=Local Fixture','-c','user.email=local@example.invalid','commit','-m','initial fixture']);
 const verify=path.join(dir,'verify.cjs');fs.writeFileSync(verify,"require('node:assert/strict').equal(require('fs').readFileSync('core.js','utf8'),'fixed\\n')");
 const config:Config={allowedRepositories:[source],runtimeDir:path.join(dir,'runtime'),projectMode:'direct',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},mode:'mock',executionMode:'native',executionAgent:choice,decisionAgent:choice,claudeExecutable:'never-paid',timeoutMs:3000,maxLoops:3,maxReworks:1,tests:[{executable:process.execPath,args:[verify]}],mockScenario:'pass',...extra};
 return {dir,source,config,store:await createRun(config,source,'LOCAL MOCK ONLY')};
}
function real(f:Awaited<ReturnType<typeof fixture>>,server:ReturnType<typeof fake>){return new RealAgents(f.config,async(_exe,args,options)=>{
 if(!options.onLine||_exe===process.execPath)throw Error('unexpected Codex call');
 options.onLine(JSON.stringify({type:'result',session_id:JSON.parse(options.input!).sessionId,structured_output:args.includes('--resume')?{verdict:'pass',reason:'LOCAL MOCK Claude Review'}:plan}));return {exitCode:0,stdout:'',stderr:''};
},new OpenCodeDecisionAgent(f.config,server.launcher),config=>new OpenCodeDecisionAgent(config,server.launcher),new OpenCodeExecutionAgent(f.config,server.launcher));}
const records=(store:Awaited<ReturnType<typeof fixture>>['store'])=>fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s));
function pending(f:Awaited<ReturnType<typeof fixture>>){const state=f.store.load();state.tasks=[task];state.phase='executing';state.nativeExecution=true;state.loops=1;f.store.save(state);return state;}

test('SDK Execute uses native tools, independent Session, correct receipts, Review and human Delivery',async()=>{
 const f=await fixture(),server=fake(),done=await drive(f.store,real(f,server));
 assert.equal(done.phase,'completed');assert.equal(done.claudeCalls,2);assert.equal(done.codexThreadId,null);assert.notEqual(done.decisionSession?.sessionId,done.executionSession?.sessionId);
 assert.equal(done.executionAttempt?.status,'success');assert.equal(fs.readFileSync(path.join(f.source,'core.js'),'utf8'),'fixed\n');
 const prompt=server.requests.find(r=>r.body.agent==='build');assert.deepEqual(prompt.body.model,{providerID:'fixture',modelID:'local'});assert.equal(prompt.body.format.retryCount,0);
 assert.equal(server.prompts,3);assert.equal(server.closes,3);assert.deepEqual([...server.sessions.values()].find(s=>s.title.includes(':execution:')).permission,executionPermissions);
 const events=records(f.store),activities=events.filter(e=>e.event==='agent-activity'&&e.data.scope?.startsWith('opencode-execute:'));
 assert.ok(activities.some(e=>e.data.text.includes('native-edit')));assert.ok(activities.some(e=>e.data.text.includes('LOCAL MOCK check')));
 for(const activity of activities){const receipt=JSON.parse(activity.data.text);assert.equal(receipt.sessionId,done.executionSession!.sessionId);assert.equal(receipt.role,'execution');assert.equal(receipt.taskId,'core');}
 for(const secret of ['PRIVATE_THINKING','WRONG_SESSION','WRONG_DIRECTORY'])assert.ok(!fs.readFileSync(f.store.file('audit.jsonl'),'utf8').includes(secret));
 const usage=runUsage(f.store).calls.find(c=>c.phase==='execute');assert.equal(usage?.agent,'opencode');assert.equal(usage?.mode,'mock');assert.equal(usage?.controllerCall,1);
 const delivery=await previewDelivery(f.store,f.source,'direct'),status=await deliveryStatus(f.store,delivery.id);assert.equal(status.phase,'preview');assert.equal(status.approval,null);
});
test('all single/dual decision combinations retain P2A order and isolated execution Session',async()=>{
 for(const participants of [undefined,[choice,choice]])for(const rounds of [0,1] as const){
  const f=await fixture(participants?{decisionDiscussion:{participants:[{id:'a',agent:participants[0]!},{id:'b',agent:participants[1]!}],primary:'b',rounds},decisionAgent:choice}:{}),server=fake();
  const adapter=new RealAgents(f.config,undefined,new OpenCodeDecisionAgent(f.config,server.launcher),config=>new OpenCodeDecisionAgent(config,server.launcher),new OpenCodeExecutionAgent(f.config,server.launcher));
  const done=await drive(f.store,adapter);assert.equal(done.phase,'completed');assert.ok(!done.discussion||done.discussion.closed);
  const ids=done.discussion?.participants.map(p=>p.session?.sessionId)??[done.decisionSession?.sessionId];assert.ok(!ids.includes(done.executionSession?.sessionId));
  const events=records(f.store),dispatch=events.findIndex(e=>e.event==='opencode-execute-dispatch'),validated=events.findIndex(e=>e.event==='plan');assert.ok(validated>=0&&dispatch>validated);
  if(participants)assert.equal(done.discussion?.steps.filter(s=>s.status==='success').length,rounds?5:3);
 }
});
test('native Claude decision and mixed double decision switch to OpenCode executor without Codex worker',async()=>{
 for(const dual of [false,true]){
  const claude={backend:'claude-code'} as const,f=await fixture({decisionAgent:claude,...(dual?{decisionDiscussion:{participants:[{id:'a' as const,agent:claude},{id:'b' as const,agent:choice}],primary:'a' as const,rounds:1 as const}}:{})}),server=fake();
  const adapter=new RealAgents(f.config,async(_exe,args,options)=>{
   assert.notEqual(_exe,process.execPath);const prompt=JSON.parse(options.input!);
   const output=prompt.decisionStage==='discussion'?{summary:'LOCAL MOCK Claude opinion',disagreements:[],amendments:[]}:args.includes('--resume')&&prompt.task?{verdict:'pass',reason:'LOCAL MOCK Claude Review'}:plan;
   const state=f.store.load(),sessionId=dual?state.discussion!.participants[0]!.claudeSessionId:state.claudeSessionId;
   options.onLine!(JSON.stringify({type:'result',session_id:sessionId,structured_output:output}));return {exitCode:0,stdout:'',stderr:''};
  },undefined,config=>new OpenCodeDecisionAgent(config,server.launcher),new OpenCodeExecutionAgent(f.config,server.launcher));
  const done=await drive(f.store,adapter);assert.equal(done.phase,'completed',done.reason);assert.equal(done.codexThreadId,null);assert.ok(done.executionSession);assert.equal(server.prompts,dual?3:1);
 }
});
test('discovery disables unsupported protocol/tools before prompt',async()=>{
 for(const options of [{missingCreation:true},{missingTools:true},{missingProtocol:true}]){const server=fake(options),f=await fixture();const discovery=await discoverOpencodeExecutionModels(undefined,f.source,server.launcher);assert.equal(discovery.available,false);const state=pending(f);await assert.rejects(()=>new OpenCodeExecutionAgent(f.config,server.launcher).execute(state,f.store,new AbortController().signal,'{}'));assert.equal(server.prompts,0);}
});
test('failed tools/response/ownership/nonterminal result never masquerade as completed execution',async()=>{
 for(const options of [{badStatus:true},{badFinish:'error'},{badFinish:'unknown'},{badFinish:'length'},{error:true},{textOnly:true},{unfinished:true},{wrongSession:true},{wrongPart:true},{badModel:true},{busy:true},{closeFailure:true}]){
  const f=await fixture(),server=fake(options),state=pending(f);
  await assert.rejects(()=>new OpenCodeExecutionAgent(f.config,server.launcher).execute(state,f.store,new AbortController().signal,'{}'));
  assert.notEqual(f.store.load().executionAttempt?.status,'success');assert.equal(f.store.load().executorExitCode,-1);assert.equal(server.closes,1);
  if(options.closeFailure){assert.ok(records(f.store).some(e=>e.event==='opencode-execute-exit-unconfirmed'));assert.ok(!records(f.store).some(e=>e.event==='opencode-execute-exit'));}
 }
});
test('timeout/cancel preserves writes, aborts native Session and requires human recovery',async()=>{
 for(const cancel of [false,true]){
  const f=await fixture({timeoutMs:cancel?3000:200}),server=fake({hang:true}),state=pending(f),abort=new AbortController();if(cancel)setTimeout(()=>abort.abort(),150);
  await assert.rejects(()=>new OpenCodeExecutionAgent(f.config,server.launcher).execute(state,f.store,abort.signal,'{}'),cancel?/Stopped/:/Timeout/);
  assert.equal(fs.readFileSync(path.join(f.source,'core.js'),'utf8'),'fixed\n');assert.equal(server.aborts,1);assert.equal(server.closes,1);
  assert.equal(f.store.load().executionAttempt?.status,'interrupted');const again=f.store.load();again.loops++;f.store.save(again);
  await assert.rejects(()=>new OpenCodeExecutionAgent(f.config,server.launcher).execute(again,f.store,new AbortController().signal,'{}'),/human recovery/);assert.equal(server.prompts,1);
 }
});
test('Controller durable result recovery does not replay confirmed task',async()=>{
 const f=await fixture(),server=fake(),done=await drive(f.store,real(f,server));assert.equal(done.phase,'completed');const calls=server.prompts;
 const saved=f.store.load();saved.phase='executing';saved.taskIndex=0;saved.completedTaskIds=[];f.store.save(saved);
 const recovered=await drive(f.store,real(f,server));assert.equal(recovered.phase,'completed');assert.equal(server.prompts,calls+1); // only Review repeated
 assert.ok(records(f.store).some(e=>e.event==='native-result-recovered'));
});
test('Controller Review Guard rejects permissive review and failed independent tests',async()=>{
 const f=await fixture({maxReworks:0}),server=fake({failTest:true}),done=await drive(f.store,real(f,server));assert.equal(done.phase,'paused');assert.equal(done.evidence?.passed,false);assert.ok(records(f.store).some(e=>e.event==='review-vetoed'));
 await assert.rejects(()=>previewDelivery(f.store,f.source,''));
});
test('persisted execution model immutable; sessions cannot alias decision roles or other Run',async()=>{
 const f=await fixture(),server=fake(),done=await drive(f.store,real(f,server));
 const changed=f.store.load();changed.config.executionAgent={backend:'codex'};assert.throws(()=>f.store.save(changed),/Immutable Execution/);
 for(const field of ['runId','workspace','directory','providerID','modelID'] as const){const state=structuredClone(done);state.executionSession![field]='wrong';assert.throws(()=>assertExecutionState(state),/ownership/);}
 const alias=structuredClone(done);alias.executionSession!.sessionId=alias.decisionSession!.sessionId;assert.throws(()=>assertExecutionState(alias),/role isolation/);
});
test('policy hook rejects dispatch before launcher; pending/complete/Plan mutations rejected',async()=>{
 const f=await fixture(),server=fake(),state=pending(f);
 await assert.rejects(()=>new OpenCodeExecutionAgent(f.config,server.launcher,async()=>{throw Error('future policy refusal');}).execute(state,f.store,new AbortController().signal,'{}'),/policy refusal/);assert.equal(server.requests.length,0);
 for(const change of [(s:typeof state)=>{s.completedTaskIds=['core'];},(s:typeof state)=>{s.tasks[0]!.instruction='altered';},(s:typeof state)=>{s.phase='execute';}]){const wrong=structuredClone(state);change(wrong);await assert.rejects(()=>new OpenCodeExecutionAgent(f.config,server.launcher).execute(wrong,f.store,new AbortController().signal,'{}'));}assert.equal(server.prompts,0);
});
test('history defaults to Codex, single executor config enforced; mock OpenCode remains explicit mock',async()=>{
 const f=await fixture({executionAgent:undefined});assert.doesNotThrow(()=>assertExecutionState(f.store.load()));
 for(const executionAgent of [{backend:'claude-code'},[{backend:'codex'},choice]])assert.throws(()=>validate(configSchema,{...f.config,executionAgent}));
 assert.throws(()=>validate(configSchema,{...f.config,executionAgent:choice,executionMode:'proposal'}),/native/);
 const g=await fixture({decisionAgent:undefined,tests:[{executable:process.execPath,args:['-e','process.exit(0)']}]});const done=await drive(g.store,new MockAgents(g.config));assert.equal(done.phase,'completed');assert.match(done.executionSession!.sessionId,/^mock-/);assert.equal(done.codexThreadId,null);assert.equal(done.config.mode,'mock');
});
test('same execution Session resumes; wrong remote owner prevents fallback',async()=>{
 const options:Options={},f=await fixture(),server=fake(options),adapter=new OpenCodeExecutionAgent(f.config,server.launcher),first=pending(f);
 await adapter.execute(first,f.store,new AbortController().signal,'{}');const id=first.executionSession!.sessionId;
 const second=f.store.load();second.loops++;f.store.save(second);await adapter.execute(second,f.store,new AbortController().signal,'{}');assert.equal(second.executionSession!.sessionId,id);
 assert.equal(server.requests.filter(r=>r.route==='/session'&&r.body.title?.includes(':execution:')).length,1);
 options.badOwner=true;const third=f.store.load();third.loops++;f.store.save(third);await assert.rejects(()=>adapter.execute(third,f.store,new AbortController().signal,'{}'),/ownership/);assert.equal(server.prompts,2);
});
test('Controller explicit human recovery resumes interrupted execution without replacing Session',async()=>{
 const options:Options={hang:true},f=await fixture(),abort=new AbortController();options.afterWrite=()=>abort.abort();const server=fake(options);
 const stopped=await drive(f.store,real(f,server),undefined,abort.signal);assert.equal(stopped.phase,'stopped');assert.equal(stopped.executionAttempt?.status,'interrupted');const id=stopped.executionSession!.sessionId;
 const paused=await drive(f.store,real(f,server));assert.equal(paused.phase,'paused');const before=server.prompts;
 options.hang=false;options.afterWrite=undefined;
 const recovered=await drive(f.store,real(f,server),'已检查保留的修改；在已有执行 Session 中继续当前任务，先检查已有成功结果，避免重复执行。');
 assert.equal(recovered.phase,'completed',recovered.reason);assert.equal(recovered.executionSession?.sessionId,id);assert.equal(server.prompts,before+2); // Execute plus Review
 assert.equal(server.requests.filter(r=>r.route==='/session'&&r.body.title?.includes(':execution:')).length,1);
});
test('isolated workspace binding keeps source unchanged; missing authorization and live discussion reject',async()=>{
 const f=await fixture({projectMode:'isolated',directAuthorization:undefined}),server=fake(),done=await drive(f.store,real(f,server));assert.equal(done.phase,'completed');assert.equal(fs.readFileSync(path.join(f.source,'core.js'),'utf8'),'initial\n');assert.equal(fs.readFileSync(path.join(done.workspace,'core.js'),'utf8'),'fixed\n');assert.equal(done.executionSession?.workspace,fs.realpathSync(done.workspace));
 const g=await fixture({decisionDiscussion:{participants:[{id:'a',agent:choice},{id:'b',agent:choice}],primary:'a',rounds:0}}),pendingState=pending(g);
 await assert.rejects(()=>new OpenCodeExecutionAgent(g.config,server.launcher).execute(pendingState,g.store,new AbortController().signal,'{}'),/Controller-validated/);
});
