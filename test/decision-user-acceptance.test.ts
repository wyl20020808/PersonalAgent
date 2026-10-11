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

for(const noTests of [false,true])test(`decision pass waits for user; configured checks ${noTests?'absent':'failing'} never run`,async()=>{
  const f=await fixture('pass',noTests),state=await drive(f.store,f.agents);
  assert.equal(state.phase,'paused',state.reason);assert.match(state.reason,/等待用户确认/);assert.deepEqual(state.completedTaskIds,[]);
  assert.equal(state.evidence?.decisionReview?.verdict,'pass');assert.equal(state.evidence?.passed,false);
  assert.equal(events(f).some(e=>e.event==='independent-check'||e.event==='review-vetoed'),false);
  const digest=manualAcceptanceDigest(state);assert.ok(digest);
  await assert.rejects(acceptManual(f.store,digest!,''),/observations/);
  const done=await acceptManual(f.store,digest!,'Local human fixture inspected result; approve this task');
  assert.equal(done.phase,'completed');assert.equal(done.evidence?.userAccepted,true);assert.equal(done.evidence?.passed,false);
  assert.equal(fs.existsSync(f.marker),false);assert.deepEqual(f.count(),{executions:1,reviews:1});
});

test('Controller conveys warnings to decision maker and user without overriding verdict',async()=>{
  const f=await fixture();fs.writeFileSync(path.join(f.source,'result.txt'),'preexisting trailing space \n');
  const execute=f.agents.execute;
  f.agents.execute=async(...args)=>{const result=await execute(...args);fs.writeFileSync(path.join(f.source,'warning.txt'),'trailing whitespace \n');await git(f.source,['add','warning.txt']);return result;};
  const paused=await drive(f.store,f.agents);assert.equal(paused.phase,'paused');assert.match(paused.reason,/决策者验收通过/);
  assert.ok(paused.evidence?.issues.some(issue=>issue.includes('whitespace')));
  const done=await acceptManual(f.store,manualAcceptanceDigest(paused)!,'Local human fixture accepts disclosed whitespace warning');
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
  const f=await fixture();const paused=await drive(f.store,f.agents);
  delete paused.evidence!.acceptanceMode;delete paused.evidence!.decisionReview;
  paused.reason='No independent acceptance tests configured; human verification required';f.store.save(paused);
  assert.equal(manualAcceptanceDigest(paused),null);
  f.agents.execute=async()=>{throw Error('Executor must not replay');};
  const resumed=await drive(f.store,f.agents,'先交决策者验收');
  assert.match(resumed.reason,/等待用户确认/);assert.deepEqual(f.count(),{executions:1,reviews:2});assert.equal(resumed.loops,1);
});

test('user acceptance binds exact reviewed files and review reason; changed files require fresh review',async()=>{
  const f=await fixture(),paused=await drive(f.store,f.agents),digest=manualAcceptanceDigest(paused)!;
  fs.writeFileSync(path.join(f.source,'result.txt'),'external change\n');
  await assert.rejects(acceptManual(f.store,digest,'Approve old result'),/changed/);
  assert.equal(f.store.load().phase,'paused');assert.deepEqual(f.store.load().completedTaskIds,[]);
  assert.equal(fs.readFileSync(path.join(f.source,'result.txt'),'utf8'),'external change\n');
});

test('user-confirmed result supports explicit delivery without Controller retesting',async()=>{
  const f=await fixture(),paused=await drive(f.store,f.agents);
  await acceptManual(f.store,manualAcceptanceDigest(paused)!,'Local human fixture accepts exact task');
  const preview=await previewDelivery(f.store,f.source,'direct');
  await assert.rejects(applyDelivery(f.store,preview.id),/explicit approval/);
  await approveDelivery(f.store,preview.id,preview.digest,'Local user fixture approves exact delivery');
  const delivered=await applyDelivery(f.store,preview.id);assert.equal(delivered.phase,'applied');
  assert.deepEqual(delivered.written,[]);assert.equal(fs.existsSync(f.marker),false);
});

test('forged userAccepted flag does not replace decision and user audit receipts',async()=>{
  const f=await fixture(),state=await drive(f.store,f.agents);
  state.phase='completed';state.taskIndex=state.tasks.length;state.evidence!.userAccepted=true;f.store.save(state);
  await assert.rejects(previewDelivery(f.store,f.source,'direct'),/approvals/);
});
