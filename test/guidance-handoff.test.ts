import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createRun,drive} from '../src/controller.js';
import {publishGuidance,processingGuidance,guidanceStatus,cancelGuidance} from '../src/steering.js';
import {withGuidanceHandoff,guidanceTool,GuidanceHandoff,blockGuidanceHandoff} from '../src/guidance-handoff.js';
import type {Config} from '../src/schema.js';
import type {Agents} from '../src/adapters.js';

const root=path.resolve('.validation/handoff-'+randomUUID());fs.mkdirSync(root,{recursive:true});
async function fixture(decision:'claude-code'|'codex'|'opencode'='claude-code',execution:'claude-code'|'codex'|'opencode'='codex'){
 const directory=path.join(root,randomUUID()),repo=path.join(directory,'repo');fs.mkdirSync(repo,{recursive:true});
 const verifier=path.join(directory,'verify.cjs');fs.writeFileSync(verifier,"const fs=require('fs');if(fs.readFileSync('partial.txt','utf8')!=='preserved'||fs.readFileSync('result.txt','utf8')!=='adjusted')process.exit(1);");
 const config:Config={allowedRepositories:[repo],runtimeDir:path.join(directory,'runtime'),mode:'mock',mockScenario:'pass',projectMode:'direct',directAuthorization:{projectPath:repo,acknowledgedAt:new Date().toISOString()},executionMode:'native',claudeExecutable:'never-launch-model',timeoutMs:5000,tests:[{executable:process.execPath,args:[verifier]}],decisionAgent:decision==='opencode'?{backend:'opencode',opencode:{providerID:'fixture',modelID:'fixture'}}:{backend:decision},executionAgent:execution==='opencode'?{backend:'opencode',opencode:{providerID:'fixture',modelID:'fixture'}}:{backend:execution}};
 const store=await createRun(config,repo,'keep existing work and follow direction');
 const message={id:randomUUID(),sessionId:randomUUID(),runId:store.id,text:'prioritize adjusted direction',time:new Date().toISOString(),attachments:[]};
 return{store,repo,message};
}
const task=(id:string)=>({id,instruction:id,acceptance:['preserve partial and write adjusted result']});
for(const decision of ['claude-code','codex','opencode'] as const)for(const execution of ['claude-code','codex','opencode'] as const)test(`${decision} decision / ${execution} execution: guidance stops at tool boundary, then decision, then execution (local Controller fixture)`,async()=>{
 const {store,repo,message}=await fixture(decision,execution),order:string[]=[];
 let exited=false,publishedAt=0,receivedAt=0;
 const agents:Agents={executionMode:'native',
  async plan(state){
   if(state.guidancePending){receivedAt=Date.now();order.push('decision-guidance');assert.equal(exited,true);assert.deepEqual(state.completedTaskIds,[]);assert.equal(state.evidence,null);assert.equal(fs.readFileSync(path.join(repo,'partial.txt'),'utf8'),'preserved');assert.equal(processingGuidance(store)[0]?.id,message.id);return{tasks:[task('adjusted')],humanDecision:null};}
   order.push('initial-plan');return{tasks:[task('original')],humanDecision:null};
  },async execute(state,_store,signal){
   if(state.tasks[state.taskIndex]!.id==='original'){
    order.push('original-execution');fs.writeFileSync(path.join(repo,'partial.txt'),'preserved');guidanceTool('active-command',true);
    publishedAt=Date.now();publishGuidance(store,message);
    await delay(300);assert.equal(signal.aborted,false);order.push('command-completed');guidanceTool('active-command',false);
    try{await delay(2000,undefined,{signal});}finally{exited=true;order.push('executor-exited');}
    throw Error('obsolete execution must not complete');
   }
   order.push('adjusted-execution');assert.equal(exited,true);fs.writeFileSync(path.join(repo,'result.txt'),'adjusted');return{mode:'native',summary:'adjusted'};
  },async review(){order.push('review');return{verdict:'pass',reason:'independent files checked'};}
 };
 const state=await drive(store,agents);assert.equal(state.phase,'completed',state.reason);
 assert.ok(receivedAt-publishedAt<2000);assert.deepEqual(order,['initial-plan','original-execution','command-completed','executor-exited','decision-guidance','adjusted-execution','review']);
 assert.deepEqual(state.completedTaskIds,['adjusted']);assert.equal(state.loops,2);assert.equal(guidanceStatus(store,message.id),'applied');
});

test('long active tool falls back to controlled cancellation; blocked remote cleanup prevents handoff (local fixtures)',async()=>{
 for(const blocked of [false,true]){
  const {store,message}=await fixture();
  const result=withGuidanceHandoff(store,new AbortController().signal,async signal=>{
   guidanceTool('long-tool',true);publishGuidance(store,message);
   try{await delay(2000,undefined,{signal});}finally{if(blocked)blockGuidanceHandoff('remote exit unconfirmed');}
  },50);
  await assert.rejects(result,blocked?/remote exit unconfirmed/:(error:unknown)=>error instanceof GuidanceHandoff&&error.forced);
  assert.equal(guidanceStatus(store,message.id),'pending');
 }
});

test('explicit stop wins over guidance; cancellation before boundary leaves original call running (local fixtures)',async()=>{
 const {store,message}=await fixture(),stop=new AbortController();
 await assert.rejects(withGuidanceHandoff(store,stop.signal,async signal=>{
  guidanceTool('active-tool',true);publishGuidance(store,message);stop.abort();await delay(2000,undefined,{signal});
 }),error=>!(error instanceof GuidanceHandoff));
 const next=await fixture();
 const value=await withGuidanceHandoff(next.store,new AbortController().signal,async signal=>{
  guidanceTool('active-tool',true);publishGuidance(next.store,next.message);await delay(300);cancelGuidance(next.store,next.message.id);guidanceTool('active-tool',false);assert.equal(signal.aborted,false);return 'original';
 });assert.equal(value,'original');
});

test('a second guidance during decision interrupts the old adjustment; both inputs apply together in order',async()=>{
 const {store,repo,message}=await fixture(),second={...message,id:randomUUID(),text:'second direction wins'};let adjustments=0;
 const agents:Agents={executionMode:'native',async plan(state,_store,signal){
  if(!state.guidancePending)return{tasks:[task('original')],humanDecision:null};
  adjustments++;
  if(adjustments===1){publishGuidance(store,second);await delay(2000,undefined,{signal});throw Error('obsolete plan must not apply');}
  assert.deepEqual(processingGuidance(store).map(input=>input.id),[message.id,second.id]);assert.match(state.goal,/second direction wins/);return{tasks:[task('adjusted')],humanDecision:null};
 },async execute(state){fs.writeFileSync(path.join(repo,'partial.txt'),'preserved');if(state.tasks[state.taskIndex]!.id==='original')publishGuidance(store,message);else fs.writeFileSync(path.join(repo,'result.txt'),'adjusted');return{mode:'native',summary:'local fixture'};},async review(){return{verdict:'pass',reason:'verified'};}};
 const state=await drive(store,agents);assert.equal(state.phase,'completed',state.reason);assert.equal(adjustments,2);assert.deepEqual(state.guidanceHistory?.map(input=>input.id),[message.id,second.id]);assert.equal(guidanceStatus(store,second.id),'applied');
});

test('guidance during independent verification hands off at command exit before Review, without accepting old work',async()=>{
 const {store,repo,message}=await fixture(),state=store.load(),verifier=state.config.tests[0]!.args![0]!;
 fs.writeFileSync(verifier,"const fs=require('fs');if(fs.readFileSync('result.txt','utf8')==='original'){fs.writeFileSync('verifying.txt','started');setTimeout(()=>process.exit(1),1000);}else{if(fs.readFileSync('result.txt','utf8')!=='adjusted')process.exit(1);}");
 const order:string[]=[];let published=false;
 const poll=setInterval(()=>{if(!published&&fs.existsSync(path.join(repo,'verifying.txt'))){published=true;publishGuidance(store,message);}},25);
 const agents:Agents={executionMode:'native',async plan(state){if(state.guidancePending){assert.deepEqual(state.completedTaskIds,[]);assert.equal(state.evidence,null);order.push('decision');return{tasks:[task('adjusted')],humanDecision:null};}return{tasks:[task('original')],humanDecision:null};},async execute(state){const id=state.tasks[state.taskIndex]!.id;order.push('execute-'+id);fs.writeFileSync(path.join(repo,'partial.txt'),'preserved');fs.writeFileSync(path.join(repo,'result.txt'),id);return{mode:'native',summary:id};},async review(){order.push('review');return{verdict:'pass',reason:'adjusted verification passed'};}};
 let done;try{done=await drive(store,agents);}finally{clearInterval(poll);}
 assert.equal(done.phase,'completed',done.reason);assert.equal(published,true);assert.deepEqual(order,['execute-original','decision','execute-adjusted','review']);assert.deepEqual(done.completedTaskIds,['adjusted']);
});
