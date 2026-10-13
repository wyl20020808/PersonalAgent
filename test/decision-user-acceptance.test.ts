import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun, drive } from '../src/controller.js';
import { manualAcceptanceDigest, acceptManual } from '../src/manual-acceptance.js';
import { previewDelivery, approveDelivery, applyDelivery } from '../src/delivery.js';
import { git } from '../src/workspace.js';
import type { Agents } from '../src/adapters.js';
import type { Config, Review } from '../src/schema.js';
import { publishGuidance, guidanceStatus } from '../src/steering.js';
import { GuidanceHandoff } from '../src/guidance-handoff.js';

const root = path.resolve('.validation', 'decision-user-' + randomUUID().slice(0,8));
async function fixture(verdict: Review['verdict'] = 'pass', noTests = false) {
  const dir = path.join(root,randomUUID().slice(0,8)), source = path.join(dir,'source'); fs.mkdirSync(source,{recursive:true});
  fs.writeFileSync(path.join(source,'result.txt'),'before\n');
  await git(source,['init']); await git(source,['add','result.txt']);
  await git(source,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']);
  const marker=path.join(dir,'controller-must-not-run-tests');
  const config:Config={mode:'mock',mockScenario:'pass',executionMode:'native',projectMode:'direct',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},allowedRepositories:[source],runtimeDir:path.join(dir,'runtime'),claudeExecutable:'NEVER-PAID',timeoutMs:5000,maxLoops:2,maxReworks:1,tests:noTests?[]:[{executable:process.execPath,args:['-e',`require('fs').writeFileSync(${JSON.stringify(marker)},'unexpected');process.exit(19)`]}]};
  const store=await createRun(config,source,'Edit result; decision maker reviews; user decides');
  let executions=0,reviews=0;
  const agents:Agents={executionMode:'native',async plan(){return{humanDecision:null,tasks:[{id:'edit',instruction:'Edit result.txt',acceptance:['result is after']}]};},async execute(state){executions++;fs.writeFileSync(path.join(state.workspace,'result.txt'),'after\n');return{mode:'native',summary:'Local executor fixture; tests not claimed'};},async review(state){reviews++;assert.equal(state.evidence?.passed,false);assert.deepEqual(state.evidence?.tests,[]);assert.equal(fs.existsSync(marker),false);assert.equal(fs.readFileSync(path.join(state.workspace,'result.txt'),'utf8'),'after\n');return{verdict,reason:'Local decision fixture: '+verdict};}};
  return{source,store,agents,marker,count:()=>({executions,reviews})};
}
const events=(f:Awaited<ReturnType<typeof fixture>>)=>fs.readFileSync(f.store.file('audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));

for(const noTests of [false,true])test(`decision pass completes automatically; configured checks ${noTests?'absent':'failing'} never run`,async()=>{
  const f=await fixture('pass',noTests),state=await drive(f.store,f.agents);
  assert.equal(state.phase,'completed',state.reason);assert.deepEqual(state.completedTaskIds,['edit']);
  assert.equal(state.evidence?.decisionReview?.verdict,'pass');assert.equal(state.evidence?.passed,false);
  assert.equal(events(f).some(e=>e.event==='independent-check'||e.event==='review-vetoed'),false);
  assert.equal(manualAcceptanceDigest(state),null);assert.equal(state.evidence?.decisionAccepted,true);assert.notEqual(state.evidence?.userAccepted,true);
  assert.equal(events(f).filter(e=>e.event==='decision-acceptance').length,1);
  assert.equal(fs.existsSync(f.marker),false);assert.deepEqual(f.count(),{executions:1,reviews:1});
});

test('Controller conveys warnings to decision maker and user without overriding verdict',async()=>{
  const f=await fixture();fs.writeFileSync(path.join(f.source,'result.txt'),'preexisting trailing space \n');
  const execute=f.agents.execute;
  f.agents.execute=async(...args)=>{const result=await execute(...args);fs.writeFileSync(path.join(f.source,'warning.txt'),'trailing whitespace \n');await git(f.source,['add','warning.txt']);return result;};
  const done=await drive(f.store,f.agents);
  assert.ok(done.evidence?.issues.some(issue=>issue.includes('whitespace')));
  assert.equal(done.phase,'completed');assert.equal(events(f).some(e=>e.event==='review-vetoed'),false);
});

for(const verdict of ['human','fail','rework'] as const)test(`Controller transports decision ${verdict} without executing tests`,async()=>{
  const f=await fixture(verdict),state=await drive(f.store,f.agents);
  assert.notEqual(state.phase,'completed');assert.equal(fs.existsSync(f.marker),false);
  if(verdict==='fail'){assert.equal(state.phase,'failed');assert.equal(state.reason,'Local decision fixture: fail');}
  if(verdict==='human'){assert.equal(state.reason,'Local decision fixture: human');assert.ok(manualAcceptanceDigest(state));}
  if(verdict==='rework'){assert.equal(f.count().executions,2);assert.equal(manualAcceptanceDigest(state),null);}
});

test('historical missing-tests checkpoint goes to decision maker without replaying executor',async()=>{
  const f=await fixture('human');const paused=await drive(f.store,f.agents);
  delete paused.evidence!.acceptanceMode;delete paused.evidence!.decisionReview;
  paused.reason='No independent acceptance tests configured; human verification required';f.store.save(paused);
  assert.equal(manualAcceptanceDigest(paused),null);
  f.agents.execute=async()=>{throw Error('Executor must not replay');};
  const review=f.agents.review;f.agents.review=async(...args)=>({...await review(...args),verdict:'pass'});
  const resumed=await drive(f.store,f.agents,'先交决策者验收');
  assert.equal(resumed.phase,'completed');assert.deepEqual(f.count(),{executions:1,reviews:2});assert.equal(resumed.loops,1);
});

test('user acceptance binds exact reviewed files and review reason; changed files require fresh review',async()=>{
  const f=await fixture('human'),paused=await drive(f.store,f.agents),digest=manualAcceptanceDigest(paused)!;
  fs.writeFileSync(path.join(f.source,'result.txt'),'external change\n');
  await assert.rejects(acceptManual(f.store,digest,'Approve old result'),/changed/);
  assert.equal(f.store.load().phase,'paused');assert.deepEqual(f.store.load().completedTaskIds,[]);
  assert.equal(fs.readFileSync(path.join(f.source,'result.txt'),'utf8'),'external change\n');
});

test('decision-accepted result supports preview while delivery still requires explicit approval',async()=>{
  const f=await fixture();await drive(f.store,f.agents);
  const preview=await previewDelivery(f.store,f.source,'direct');
  await assert.rejects(applyDelivery(f.store,preview.id),/explicit approval/);
  await approveDelivery(f.store,preview.id,preview.digest,'Local user fixture approves exact delivery');
  const delivered=await applyDelivery(f.store,preview.id);assert.equal(delivered.phase,'applied');
  assert.deepEqual(delivered.written,[]);assert.equal(fs.existsSync(f.marker),false);
});

test('forged acceptance flags do not replace decision audit receipts',async()=>{
  const f=await fixture('human'),state=await drive(f.store,f.agents);
  state.phase='completed';state.taskIndex=state.tasks.length;state.evidence!.userAccepted=true;f.store.save(state);
  await assert.rejects(previewDelivery(f.store,f.source,'direct'),/approvals/);
  state.evidence!.userAccepted=false;state.evidence!.decisionAccepted=true;f.store.save(state);
  await assert.rejects(previewDelivery(f.store,f.source,'direct'),/approvals/);
});

test('multiple dependent tasks advance with one execute and one review each',async()=>{
  const f=await fixture();
  f.agents.plan=async()=>({humanDecision:null,tasks:[{id:'edit',instruction:'Edit result',acceptance:['after']},{id:'second',dependsOn:['edit'],instruction:'Check prerequisite',acceptance:['checked']}]});
  const execute=f.agents.execute;f.agents.execute=async(...args)=>{if(args[0].taskIndex===1)assert.deepEqual(args[0].completedTaskIds,['edit']);return execute(...args);};
  const done=await drive(f.store,f.agents);
  assert.equal(done.phase,'completed');assert.deepEqual(done.completedTaskIds,['edit','second']);assert.deepEqual(f.count(),{executions:2,reviews:2});
  assert.equal(events(f).some(e=>e.event==='transition'&&e.data.phase==='paused'),false);
  await previewDelivery(f.store,f.source,'direct');
});

async function legacyPass(){
  const f=await fixture();const state=await drive(f.store,f.agents);
  state.phase='paused';state.nextPhase='verify';state.taskIndex=0;state.completedTaskIds=[];delete state.evidence!.decisionAccepted;
  state.reason='决策者验收通过，等待用户确认；Controller 不判定成果成败';f.store.save(state);
  f.store.audit('transition',{phase:state.phase,taskIndex:0,loops:state.loops});
  return f;
}

test('continue old unchanged pass reuses recorded verdict without another model call',async()=>{
  const f=await legacyPass();f.agents.execute=async()=>{throw Error('Executor must not replay');};f.agents.review=async()=>{throw Error('Reviewer must not replay');};
  const done=await drive(f.store,f.agents,'继续');assert.equal(done.phase,'completed');assert.deepEqual(done.completedTaskIds,['edit']);assert.ok(events(f).some(e=>e.event==='review-reused'));
  assert.deepEqual(f.count(),{executions:1,reviews:1});
});

test('legacy second-task pass without completedTaskIds never replays previous task',async()=>{
  const f=await fixture();
  f.agents.plan=async()=>({humanDecision:null,tasks:[{id:'edit',instruction:'Edit result',acceptance:['after']},{id:'second',instruction:'Check result',acceptance:['checked']}]});
  const state=await drive(f.store,f.agents);
  state.phase='paused';state.nextPhase='verify';state.taskIndex=1;delete state.completedTaskIds;delete state.evidence!.decisionAccepted;
  f.store.save(state);f.store.audit('transition',{phase:state.phase,taskIndex:1,loops:state.loops});
  f.agents.execute=async()=>{throw Error('Previously executed task must not replay');};f.agents.review=async()=>{throw Error('Recorded pass must not replay');};
  const done=await drive(f.store,f.agents,'继续');assert.equal(done.phase,'completed');assert.deepEqual(done.completedTaskIds,['edit','second']);assert.deepEqual(f.count(),{executions:2,reviews:2});
});

test('continue old pass with changed result reviews again without replaying executor',async()=>{
  const f=await legacyPass();fs.writeFileSync(path.join(f.source,'result.txt'),'changed\n');let reviews=0;
  f.agents.execute=async()=>{throw Error('Executor must not replay');};f.agents.review=async state=>{reviews++;assert.equal(fs.readFileSync(path.join(state.workspace,'result.txt'),'utf8'),'changed\n');return{verdict:'human',reason:'Major unresolved change'};};
  const state=await drive(f.store,f.agents,'继续');assert.equal(state.phase,'paused');assert.equal(reviews,1);assert.deepEqual(state.completedTaskIds,[]);assert.equal(events(f).some(e=>e.event==='review-reused'),false);
});

test('explicit rework on old pass executes and reviews again',async()=>{
  const f=await legacyPass();const state=await drive(f.store,f.agents,'修改成果',undefined,undefined,'rework');
  assert.equal(state.phase,'completed');assert.deepEqual(f.count(),{executions:2,reviews:2});
});

for(const historicalFailure of [false,true])test(`old pass with queued guidance preserves acceptance before replan; historical failure ${historicalFailure}`,async()=>{
  const f=await legacyPass(),state=f.store.load();
  if(historicalFailure){state.phase='failed';state.failure={kind:'unknown',stage:'paused',message:new GuidanceHandoff(false).message,recoverable:false};f.store.save(state);f.store.audit('transition',{phase:'failed',taskIndex:0,loops:state.loops});f.store.audit('error',state.failure);}
  const message={id:randomUUID(),sessionId:randomUUID(),runId:f.store.id,text:'Routine stages continue automatically',time:new Date().toISOString(),attachments:[]};publishGuidance(f.store,message);
  let replans=0;f.agents.plan=async current=>{replans++;assert.deepEqual(current.completedTaskIds,['edit']);assert.equal(current.guidancePending?.id,message.id);return{humanDecision:null,tasks:[],planUpdate:{}};};
  f.agents.execute=async()=>{throw Error('Completed work must never replay');};f.agents.review=async()=>{throw Error('Unchanged accepted work must never review again');};
  const done=await drive(f.store,f.agents,'继续原 Run 并处理新授权');assert.equal(done.phase,'completed',done.reason);assert.equal(replans,1);assert.deepEqual(f.count(),{executions:1,reviews:1});assert.equal(guidanceStatus(f.store,message.id),'applied');
  assert.equal(events(f).filter(e=>e.event==='guidance-failure-reclassified').length,historicalFailure?1:0);
});

test('ordinary nonrecoverable failure remains blocked despite queued guidance',async()=>{
  const f=await legacyPass(),state=f.store.load();state.phase='failed';state.failure={kind:'unknown',stage:'paused',message:'Unrelated real failure',recoverable:false};f.store.save(state);
  publishGuidance(f.store,{id:randomUUID(),sessionId:randomUUID(),runId:f.store.id,text:'Continue',time:new Date().toISOString(),attachments:[]});
  const done=await drive(f.store,f.agents,'继续');assert.equal(done.phase,'failed');assert.equal(done.failure?.message,'Unrelated real failure');assert.deepEqual(f.count(),{executions:1,reviews:1});
});
