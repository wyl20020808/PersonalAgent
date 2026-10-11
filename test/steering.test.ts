import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRun,drive} from '../src/controller.js';
import type {Agents} from '../src/adapters.js';
import type {Config,Task} from '../src/schema.js';
import {claimGuidance,publishGuidance,cancelGuidance,guidanceStatus,type Guidance} from '../src/steering.js';
import {stageRunAttachments,runAttachments,codexInput,claudeInput,opencodeParts} from '../src/multimodal.js';
import type {Store} from '../src/store.js';

const root=path.resolve('.validation/steering-'+randomUUID());fs.mkdirSync(root,{recursive:true});
const task=(id:string,dependsOn?:string[]):Task=>({id,instruction:id,acceptance:['independent file check'],...(dependsOn?{dependsOn}:{})});
async function fixture(){
 const dir=path.join(root,randomUUID()),repo=path.join(dir,'repo');fs.mkdirSync(repo,{recursive:true});
 const check=path.join(dir,'verify.cjs');fs.writeFileSync(check,"const fs=require('node:fs');if(fs.readFileSync('first.txt','utf8')!=='once')process.exit(1);if(fs.existsSync('new.txt')&&fs.readFileSync('new.txt','utf8')!=='adjusted')process.exit(2);");
 const config:Config={allowedRepositories:[repo],runtimeDir:path.join(dir,'runtime'),mode:'mock',mockScenario:'pass',projectMode:'direct',directAuthorization:{projectPath:repo,acknowledgedAt:new Date().toISOString()},executionMode:'native',claudeExecutable:'claude',timeoutMs:5000,tests:[{executable:process.execPath,args:[check]}]};
 return {store:await createRun(config,repo,'first then original'),repo,config};
}
function message(store:Store,text='change remaining task'):Guidance{return {id:randomUUID(),sessionId:randomUUID(),runId:store.id,time:new Date().toISOString(),text,attachments:[]};}
function gate(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}

test('running native call is not aborted; acceptance precedes replan and completed task never repeats',async()=>{
 const {store,repo}=await fixture(),entered=gate(),release=gate(),order:string[]=[];let firstCalls=0;
 const agents:Agents={executionMode:'native',
  async plan(state){order.push(state.guidancePending?'replan':'plan');if(state.guidancePending){assert.deepEqual(state.completedTaskIds,['first']);assert.equal(state.evidence?.passed,true);assert.match(state.goal,/change remaining/);return {tasks:[task('new',['first'])],humanDecision:null};}return {tasks:[task('first'),task('original',['first'])],humanDecision:null};},
  async execute(state,_store,signal){const id=state.tasks[state.taskIndex]!.id;order.push('execute-'+id);if(id==='first'){firstCalls++;entered.resolve();await release.promise;assert.equal(signal.aborted,false);fs.writeFileSync(path.join(repo,'first.txt'),'once');}else{assert.equal(id,'new');fs.writeFileSync(path.join(repo,'new.txt'),'adjusted');}return {mode:'native',summary:id};},
  async review(state){order.push('review-'+state.tasks[state.taskIndex]!.id);return {verdict:'pass',reason:'files checked'};}
 };
 const running=drive(store,agents);await entered.promise;
 const before=fs.readFileSync(store.file('state.json')),audit=fs.readFileSync(store.file('audit.jsonl')),input=message(store);
 input.attachments=stageRunAttachments(store,[{name:'requirements.md',mimeType:'text/plain',bytes:Buffer.from('keep first result')}]);
 publishGuidance(store,input);assert.deepEqual(fs.readFileSync(store.file('state.json')),before);assert.deepEqual(fs.readFileSync(store.file('audit.jsonl')),audit);assert.equal(guidanceStatus(store,input.id),'pending');
 release.resolve();const state=await running;
 assert.equal(state.phase,'completed',state.reason);assert.equal(firstCalls,1);assert.deepEqual(state.completedTaskIds,['first','new']);assert.deepEqual(order,['plan','execute-first','review-first','replan','execute-new','review-new']);assert.equal(guidanceStatus(store,input.id),'applied');assert.equal(state.guidancePending,undefined);assert.equal(runAttachments(state,store)[0]!.name,'requirements.md');
});

test('guidance on final task can add work to the same Run, preserving the completed ID',async()=>{
 const {store,repo}=await fixture();let plans=0;
 const agents:Agents={executionMode:'native',async plan(state){plans++;return {tasks:state.guidancePending?[task('new',['first'])]:[task('first')],humanDecision:null};},async execute(state){if(state.tasks[state.taskIndex]!.id==='first'){fs.writeFileSync(path.join(repo,'first.txt'),'once');publishGuidance(store,message(store));}else fs.writeFileSync(path.join(repo,'new.txt'),'adjusted');return {mode:'native',summary:'done'};},async review(){return {verdict:'pass',reason:'checked'};}};
 const state=await drive(store,agents);assert.equal(state.phase,'completed',state.reason);assert.equal(plans,2);assert.equal(state.loops,2);assert.equal(state.guidanceHistory?.length,1);
});

test('claimed input survives a crash before state save; cancel and claim have exactly one winner',async()=>{
 const {store}=await fixture(),first=message(store);publishGuidance(store,first);cancelGuidance(store,first.id);assert.equal(claimGuidance(store),undefined);
 const second=message(store);publishGuidance(store,second);assert.equal(claimGuidance(store)?.id,second.id);assert.throws(()=>cancelGuidance(store,second.id),/已接收/);assert.equal(claimGuidance(store)?.id,second.id);
});

test('multiple promoted messages keep click order; a deleted one never reaches the planner',async()=>{
 const {store}=await fixture(),a=message(store),b=message(store),c=message(store);a.time=b.time=c.time='2026-10-11T00:00:01Z';
 publishGuidance(store,a);publishGuidance(store,b);publishGuidance(store,c);cancelGuidance(store,b.id);
 const first=claimGuidance(store)!;assert.equal(first.id,a.id);assert.equal(claimGuidance(store,[a.id])?.id,c.id);
});

test('a failed review must finish rework before guidance; execution feedback is cleared',async()=>{
 const {store,repo}=await fixture();let attempts=0;const order:string[]=[];
 const input=message(store);
 const agents:Agents={executionMode:'native',async plan(state){order.push(state.guidancePending?'replan':'plan');if(state.guidancePending){assert.equal(attempts,2);assert.deepEqual(state.completedTaskIds,['first']);return {tasks:[task('new',['first'])],humanDecision:null};}return {tasks:[task('first')],humanDecision:null};},async execute(state){const id=state.tasks[state.taskIndex]!.id;order.push('execute-'+id);if(id==='first'){attempts++;fs.writeFileSync(path.join(repo,'first.txt'),'once');if(attempts===1)publishGuidance(store,input);}else{assert.equal(state.feedback,'');fs.writeFileSync(path.join(repo,'new.txt'),'adjusted');}return {mode:'native',summary:id};},async review(state){order.push('review-'+state.tasks[state.taskIndex]!.id);return {verdict:attempts===1?'rework':'pass',reason:'independent review'};}};
 const state=await drive(store,agents);assert.equal(state.phase,'completed',state.reason);assert.equal(state.totalReworks,1);assert.deepEqual(order,['plan','execute-first','review-first','execute-first','review-first','replan','execute-new','review-new']);
});

test('pending guidance cannot bypass an explicit rework limit',async()=>{
 const {store,repo}=await fixture(),state=store.load();state.config.maxReworks=0;store.save(state);const input=message(store);
 const agents:Agents={executionMode:'native',async plan(){return {tasks:[task('first')],humanDecision:null};},async execute(){fs.writeFileSync(path.join(repo,'first.txt'),'once');publishGuidance(store,input);return {mode:'native',summary:'first'};},async review(){return {verdict:'rework',reason:'needs correction'};}};
 const paused=await drive(store,agents);assert.equal(paused.phase,'paused');assert.equal(paused.guidancePending,undefined);assert.equal(guidanceStatus(store,input.id),'pending');assert.equal(paused.guidanceHistory?.length??0,0);
});

test('damaged pending attachments remain unclaimed and removable',async()=>{
 const {store}=await fixture(),input=message(store);input.attachments=stageRunAttachments(store,[{name:'note.txt',mimeType:'text/plain',bytes:Buffer.from('original')}]);publishGuidance(store,input);fs.appendFileSync(store.file(input.attachments[0]!.file),'tamper');assert.throws(()=>claimGuidance(store),/附件文件已改变/);assert.equal(guidanceStatus(store,input.id),'pending');cancelGuidance(store,input.id);assert.equal(guidanceStatus(store,input.id),'cancelled');
});

test('replan requesting a human keeps the original Run and input; no replay without explicit resume',async()=>{
 const {store,repo}=await fixture();let guidancePlans=0;
 const agents:Agents={executionMode:'native',async plan(state){if(state.guidancePending){guidancePlans++;return guidancePlans===1?{tasks:[],humanDecision:'which change?'}:{tasks:[],humanDecision:null};}return {tasks:[task('first')],humanDecision:null};},async execute(){fs.writeFileSync(path.join(repo,'first.txt'),'once');publishGuidance(store,message(store));return {mode:'native',summary:'first'};},async review(){return {verdict:'pass',reason:'checked'};}};
 const paused=await drive(store,agents);assert.equal(paused.phase,'paused');assert.equal(guidancePlans,1);assert.ok(paused.guidancePending);
 await drive(store,agents);assert.equal(guidancePlans,1);
 const resumed=await drive(store,agents,'No more work; preserve first');assert.equal(resumed.phase,'completed',resumed.reason);assert.equal(resumed.loops,1);assert.deepEqual(resumed.completedTaskIds,['first']);assert.equal(resumed.guidanceHistory?.length,1);
});

test('planner cannot reuse completed IDs; the claimed message is retained for recovery',async()=>{
 const {store,repo}=await fixture();
 const agents:Agents={executionMode:'native',async plan(){return {tasks:[task('first')],humanDecision:null};},async execute(){fs.writeFileSync(path.join(repo,'first.txt'),'once');publishGuidance(store,message(store));return {mode:'native',summary:'first'};},async review(){return {verdict:'pass',reason:'checked'};}};
 const state=await drive(store,agents);assert.notEqual(state.phase,'completed');assert.match(state.reason,/重复已验收/);assert.deepEqual(state.completedTaskIds,['first']);assert.ok(state.guidancePending);
});

test('guidance image pixels and files reach all native inputs; tampering prevents dispatch',async()=>{
 const {store}=await fixture(),input=message(store),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=','base64');
 input.attachments=stageRunAttachments(store,[{name:'picture.png',mimeType:'image/png',bytes:png},{name:'note.md',mimeType:'text/plain',bytes:Buffer.from('guidance file')}]);
 const state=store.load();state.guidancePending=input;store.save(state);const items=runAttachments(state,store);
 assert.equal((codexInput('prompt',items) as any[]).filter(part=>part.type==='local_image').length,1);assert.match(claudeInput('prompt',items),/"type":"image"/);assert.ok(opencodeParts('prompt',items,true).some(part=>part.type==='file'));assert.match(JSON.stringify(codexInput('prompt',items)),/guidance file/);
 fs.appendFileSync(items[0]!.path,'tamper');assert.throws(()=>runAttachments(state,store),/附件文件已改变/);
});
