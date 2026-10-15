import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun, drive } from '../src/controller.js';
import { git } from '../src/workspace.js';
import { supervisionBlock } from '../src/automatic-supervision.js';
import type { Agents } from '../src/adapters.js';
import {MockAgents} from '../src/adapters.js';
import type { Config, Review } from '../src/schema.js';
import {publishGuidance} from '../src/steering.js';

const root=path.resolve('D:/PersonalAgent-tmp/autonomous-goal-loop-20261015','regression-'+randomUUID().slice(0,8));
const task=(id:string)=>({id,instruction:'Write '+id,acceptance:[id+' exists']});
async function fixture(){
 const dir=path.join(root,randomUUID().slice(0,8)),source=path.join(dir,'source');fs.mkdirSync(source,{recursive:true});
 fs.writeFileSync(path.join(source,'result.txt'),'before\n');await git(source,['init']);await git(source,['add','.']);await git(source,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']);
 const config:Config={autonomousDevelopment:true,mode:'mock',mockScenario:'pass',executionMode:'native',projectMode:'direct',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},allowedRepositories:[source],runtimeDir:path.join(dir,'runtime'),claudeExecutable:'NEVER-PAID',timeoutMs:5000,tests:[]};
 return createRun(config,source,'Write a and b');
}
test('autonomous question returns to same task and Session; final review grows and closes goal',async()=>{
 const store=await fixture();let plans=0,executions=0;const seen:string[]=[];
 const agents:Agents={executionMode:'native',async plan(state){plans++;return plans===1?{tasks:[task('a')],humanDecision:null}:{tasks:[],humanDecision:null,executorReply:'Use the existing format'};},async execute(state){
  executions++;seen.push(state.tasks[state.taskIndex]!.id);
  if(executions===1){state.codexThreadId='fixture-session';return {mode:'native',summary:'[需要用户答复]\nWhich format?'};}
  if(executions===2){assert.equal(state.codexThreadId,'fixture-session');assert.equal(state.executorQuestion?.source,'decision');assert.equal(state.executorQuestion?.reply,'Use the existing format');}
  fs.appendFileSync(path.join(state.workspace,'result.txt'),seen.at(-1)+'\n');return {mode:'native',summary:'Written'};
 },async review(state){return {verdict:'pass',reason:'Checked actual file',goalAssessment:{complete:state.tasks[state.taskIndex]!.id==='b',reason:'Goal requires a and b'},...(state.tasks[state.taskIndex]!.id==='a'?{followUpTasks:[task('b')]}:{})};}};
 const done=await drive(store,agents);assert.equal(done.phase,'completed');assert.deepEqual(seen,['a','a','b']);assert.deepEqual(done.completedTaskIds,['a','b']);assert.equal(plans,2);assert.equal(done.userRequired,undefined);
 const events=fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(events.some(e=>e.event==='transition'&&e.data.phase==='paused'),false);assert.equal(events.filter(e=>e.event==='goal-assessment').length,2);
});
test('reserved authorization remains user-required and cannot be taken over',async()=>{
 const store=await fixture();let plans=0;
 const done=await drive(store,{executionMode:'native',async plan(){return ++plans===1?{tasks:[task('a')],humanDecision:null}:{tasks:[],humanDecision:'Publishing requires explicit authorization'};},async execute(){return {mode:'native',summary:'[需要用户答复]\nMay I publish?'};},async review(){throw Error('must not review a question');}});
 assert.equal(done.phase,'paused');assert.equal(done.userRequired,true);assert.ok(supervisionBlock(done));
});
for(const [name,review] of Object.entries<Record<string,unknown>>({missing:{},incomplete:{goalAssessment:{complete:false,reason:'b missing'}},contradiction:{goalAssessment:{complete:true,reason:'done'},followUpTasks:[task('b')]},duplicate:{goalAssessment:{complete:false,reason:'more'},followUpTasks:[task('a')]},invalidDependency:{goalAssessment:{complete:false,reason:'more'},followUpTasks:[{...task('b'),dependsOn:['missing']}]}})){
 test('autonomous final pass cannot silently finish: '+name,async()=>{
  const store=await fixture();const state=await drive(store,{executionMode:'native',async plan(){return {tasks:[task('a')],humanDecision:null};},async execute(state){fs.appendFileSync(path.join(state.workspace,'result.txt'),'a\n');return {mode:'native',summary:'written'};},async review(){return {verdict:'pass',reason:'a checked',...review} as Review;}});
  assert.notEqual(state.phase,'completed');assert.notEqual(state.evidence?.decisionAccepted,true);assert.deepEqual(state.completedTaskIds??[],[]);
 });
}
test('explicit stop wins before question delegation',async()=>{
 const store=await fixture();let plans=0;const abort=new AbortController();
 const state=await drive(store,{executionMode:'native',async plan(){plans++;return {tasks:[task('a')],humanDecision:null};},async execute(){abort.abort();return {mode:'native',summary:'[需要用户答复]\nWhich format?'};},async review(){throw Error('must not review');}},undefined,abort.signal);
 assert.equal(state.phase,'stopped');assert.equal(plans,1);
});
for(const assessed of [false,true])test('removing all remaining work requires a goal assessment: '+assessed,async()=>{
 const store=await fixture();
 const state=await drive(store,{executionMode:'native',async plan(state){return state.guidancePending?{tasks:[],humanDecision:null,planUpdate:{remove:['a']},...(assessed?{goalAssessment:{complete:true,reason:'User withdrew the file requirement; current workspace meets revised goal'}}:{})}:{tasks:[task('a')],humanDecision:null};},async execute(){publishGuidance(store,{id:randomUUID(),sessionId:randomUUID(),runId:store.id,time:new Date().toISOString(),text:'Withdraw the file requirement; keep the existing workspace.',attachments:[]});return {mode:'native',summary:'No writes'};},async review(){throw Error('guidance must go to planning');}});
 assert.equal(state.phase,assessed?'completed':'paused');
});
test('automatic local mock still completes with explicitly mock goal evidence',async()=>{
 const store=await fixture();const state=await drive(store,new MockAgents(store.load().config));
 assert.equal(state.phase,'completed');assert.match(state.evidence?.decisionReview?.goalAssessment?.reason??'',/mock fixture/);
});
