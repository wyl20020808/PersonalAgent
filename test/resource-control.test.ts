import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRun,drive} from '../src/controller.js';
import {resourceTokens,loadResources,saveResources,resourceBlock,refreshResources,resourceBrief} from '../src/resource-control.js';
import {publishGuidance,claimGuidance} from '../src/steering.js';
import {supervisionBlock} from '../src/automatic-supervision.js';
import {git} from '../src/workspace.js';
import type {CallUsage} from '../src/call-observation.js';
import type {Agents} from '../src/adapters.js';
import type {Config} from '../src/schema.js';
import type {Store} from '../src/store.js';
const root='D:/PersonalAgent-tmp/autonomous-resource-control-20261015';
const task={id:'a',instruction:'Write result',acceptance:['result exists']};
const usage=(id:string,input=80,output=20)=>({callId:id,agent:'codex',inputTokens:input,outputTokens:output,cacheReadTokens:60,cacheCreationTokens:null,completeness:'complete',status:'success',source:'codex-app-server-turn',resumed:true} as CallUsage);
async function fixture(limits:Config['resourceLimits']={activeMs:null,tokens:null},withGit=false){
 const dir=path.join(root,randomUUID()),source=path.join(dir,'source');fs.mkdirSync(source,{recursive:true});fs.writeFileSync(path.join(source,'base.txt'),'base');
 if(withGit){await git(source,['init']);await git(source,['add','.']);await git(source,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']);}
 const config:Config={autonomousDevelopment:true,resourceLimits:limits,mode:'mock',mockScenario:'pass',executionMode:'native',projectMode:'direct',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},allowedRepositories:[source],runtimeDir:path.join(dir,'runtime'),claudeExecutable:'NEVER-PAID',timeoutMs:5000,tests:[]};
 return createRun(config,source,'Write result');
}
function receipt(store:Store,row:CallUsage){fs.mkdirSync(store.file('context'),{recursive:true});fs.writeFileSync(store.file('context/'+row.callId+'.usage.json'),JSON.stringify({...row,runId:store.id}));}
function update(store:Store,tokens:number|null,activeMs:number|null=null){const message={id:randomUUID(),sessionId:randomUUID(),runId:store.id,time:new Date().toISOString(),text:'Adjust remaining work, keep accepted results.',attachments:[],resourceLimits:{tokens,activeMs}};publishGuidance(store,message);return message;}
test('token normalization deduplicates calls, includes Claude caches, rejects ambiguous totals',()=>{
 assert.deepEqual(resourceTokens([usage('a'),usage('a')]),{knownTokens:100,unknownCalls:0});
 assert.deepEqual(resourceTokens([{...usage('b'),agent:'claude',cacheCreationTokens:10}]),{knownTokens:170,unknownCalls:0});
 assert.deepEqual(resourceTokens([{...usage('c'),source:'legacy-cumulative'}]),{knownTokens:0,unknownCalls:1});
 assert.equal(resourceTokens([{...usage('d'),outputTokens:null}]).unknownCalls,1);
});
test('applied changes survive reload without resetting elapsed or Token consumption',async()=>{
 const store=await fixture(),state=store.load(),r=loadResources(store,state);r.activeMs=1200;r.operations=1;receipt(store,usage('a'));saveResources(store,r);
 const message=update(store,50,1000);claimGuidance(store);refreshResources(store,state,r);
 assert.equal(r.activeMs,1200);assert.equal(r.knownTokens,100);assert.ok(resourceBlock(r));assert.deepEqual(r.applied,[message.id]);
 refreshResources(store,state,r);assert.equal(r.applied.length,1);
 const bigger=update(store,200,5000);claimGuidance(store); // first processing message remains; claim all pending explicitly below
 const {claimPendingGuidance}=await import('../src/steering.js');claimPendingGuidance(store);
 refreshResources(store,state,r);assert.ok(r.applied.includes(bigger.id));assert.equal(resourceBlock(loadResources(store,state)),undefined);assert.equal(r.knownTokens,100);assert.equal(resourceBrief(store,state)?.remainingKnownTokens,100);
});
test('Token threshold pauses before next call; increase resumes the same Run and original task',async()=>{
 const store=await fixture({activeMs:null,tokens:50});let executes=0;
 const agents:Agents={executionMode:'native',async plan(state){if(!state.guidancePending)receipt(store,usage('plan'));return state.guidancePending?{tasks:[],humanDecision:null,planUpdate:{}}:{tasks:[task],humanDecision:null};},async execute(state){executes++;fs.writeFileSync(path.join(state.workspace,'result.txt'),'ok');return {mode:'native',summary:'done'};},async review(){return {verdict:'pass',reason:'file checked',goalAssessment:{complete:true,reason:'result exists'}};}};
 const paused=await drive(store,agents);assert.equal(paused.phase,'paused');assert.equal(paused.failure?.kind,'budget');assert.ok(supervisionBlock(paused));assert.equal(executes,0);
 update(store,200);const done=await drive(store,agents,'Use the adjusted limit');assert.equal(done.phase,'completed');assert.equal(executes,1);assert.equal(loadResources(store,done).knownTokens,100);assert.equal(loadResources(store,done).accepted,1);
});
test('unknown token coverage pauses without pretending zero cost',async()=>{
 const store=await fixture({activeMs:null,tokens:10000});receipt(store,{...usage('partial'),completeness:'partial'});let calls=0;
 const done=await drive(store,{executionMode:'native',async plan(){calls++;return {tasks:[task],humanDecision:null};},async execute(){throw Error('no');},async review(){throw Error('no');}});
 assert.equal(done.phase,'paused');assert.match(done.reason,/不完整/);assert.equal(calls,0);
});
test('active time interrupts a model call, releases locks, and preserves cumulative time on resume',async()=>{
 const store=await fixture({activeMs:1000,tokens:null});
 const paused=await drive(store,{executionMode:'native',async plan(_s,_store,signal){await new Promise<void>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));return {tasks:[task],humanDecision:null};},async execute(){throw Error('no');},async review(){throw Error('no');}});
 assert.equal(paused.phase,'paused');assert.equal(paused.failure?.kind,'budget');const r=loadResources(store,paused);assert.ok(r.activeMs>=1000);assert.equal(r.activeSince,null);const release=store.lock();release();
 update(store,null,10000);const done=await drive(store,{executionMode:'native',async plan(){return {tasks:[task],humanDecision:null,planUpdate:{}};},async execute(state){fs.writeFileSync(path.join(state.workspace,'result.txt'),'ok');return {mode:'native',summary:'done'};},async review(){return {verdict:'pass',reason:'checked',goalAssessment:{complete:true,reason:'done'}};}},'Continue with new limit');
 assert.equal(done.phase,'completed');assert.ok(loadResources(store,done).activeMs>=r.activeMs);
});
test('three unchanged executions replan once, then pause without endless calls',async()=>{
 const store=await fixture(undefined,true);let plans=0,executions=0;
 const state=await drive(store,{executionMode:'native',async plan(){plans++;return {tasks:[task],humanDecision:null};},async execute(){executions++;return {mode:'native',summary:'[需要用户答复]\nStill blocked'};},async review(){throw Error('no');}});
 // Question planning retains the task; after six unchanged attempts the guard prevents a seventh execution.
 assert.equal(state.phase,'paused');assert.match(state.reason,/三轮/);assert.equal(executions,6);assert.ok(plans>=2);assert.ok(supervisionBlock(state));
});
test('historical timing is reconstructed and damaged ledgers do not reset silently',async()=>{
 const store=await fixture();store.audit('agent-finish',{durationMs:1234});assert.equal(loadResources(store,store.load()).activeMs,1234);
 fs.writeFileSync(store.file('resource-control.json'),JSON.stringify({limits:{activeMs:null,tokens:null},activeMs:-1}));assert.throws(()=>loadResources(store,store.load()),/Invalid resource/);
});
test('explicit limits can attach to a historical Run without changing its config or losing usage',async()=>{
 const store=await fixture(),state=store.load();delete state.config.resourceLimits;delete state.config.autonomousDevelopment;store.save(state);
 receipt(store,usage('old'));update(store,50);
 const done=await drive(store,{executionMode:'native',async plan(){throw Error('must not call model');},async execute(){throw Error('no');},async review(){throw Error('no');}});
 assert.equal(done.phase,'paused');assert.equal(done.failure?.kind,'budget');assert.equal(loadResources(store,done).knownTokens,100);assert.equal(done.config.resourceLimits,undefined);assert.equal(resourceBrief(store,done)?.remainingKnownTokens,0);
});
