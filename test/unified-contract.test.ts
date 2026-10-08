import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { configSchema, validate, type Config } from '../src/schema.js';
import { createRun, drive } from '../src/controller.js';
import { acceptManual, manualAcceptanceDigest } from '../src/manual-acceptance.js';
import { previewDelivery } from '../src/delivery.js';
import type { Agents } from '../src/adapters.js';

function fixture():Config {
  const root=path.resolve('.validation','unified-'+randomUUID()),source=path.join(root,'empty');fs.mkdirSync(source,{recursive:true});
  return {allowedRepositories:[source],runtimeDir:path.join(root,'runtime'),mode:'mock',executionMode:'native',claudeExecutable:'NEVER-PAID',timeoutMs:10000,maxLoops:4,maxReworks:1,tests:[],mockScenario:'pass'};
}
test('projectMode is canonical; old alias migrates and contradictory fields are rejected',()=>{
  const config=fixture();
  for(const mode of ['direct','isolated'] as const){const value=validate<Config>(configSchema,{...config,workspaceMode:mode});assert.equal(value.projectMode,mode);assert.equal('workspaceMode' in value,false);}
  assert.throws(()=>validate(configSchema,{...config,projectMode:'direct',workspaceMode:'isolated'}),/Conflicting/);
  assert.equal(validate<Config>(configSchema,{...config,projectMode:'isolated',workspaceMode:'isolated'}).projectMode,'isolated');
});
test('absent Git does not block task creation; human acceptance cannot forge tests or reuse stale evidence',async()=>{
  const config=fixture(),store=await createRun(config,config.allowedRepositories[0]!,'local manual fixture');
  const agents:Agents={executionMode:'native',async plan(){return {humanDecision:null,tasks:[{id:'work',instruction:'local write',acceptance:['inspect result']}]};},async execute(state){fs.writeFileSync(path.join(state.workspace,'result.txt'),'result\n');return {mode:'native',summary:'local fixture'};},async review(){throw Error('no review call before human node');}};
  const state=await drive(store,agents);assert.equal(state.phase,'paused');assert.equal(state.evidence?.passed,false);assert.equal(state.evidence?.tests.length,0);assert.ok(fs.existsSync(path.join(state.workspace,'result.txt')));
  const digest=manualAcceptanceDigest(state)!;assert.ok(digest);
  await assert.rejects(acceptManual(store,'0'.repeat(64),'inspected'),/exact/);await assert.rejects(acceptManual(store,digest,''),/observations/);
  fs.writeFileSync(path.join(state.workspace,'result.txt'),'later edit\n');await assert.rejects(acceptManual(store,digest,'inspected'),/changed/);
  fs.writeFileSync(path.join(state.workspace,'result.txt'),'result\n');const done=await acceptManual(store,digest,'已打开 result.txt，确认本地夹具内容符合验收标准');
  assert.equal(done.phase,'completed');assert.equal(done.evidence?.passed,false);assert.equal(done.evidence?.tests.length,0);assert.match(done.reason,/人工验收/);
  await assert.rejects(previewDelivery(store,state.source,''),/lacks completed verification/);await assert.rejects(acceptManual(store,digest,'replay'),/exact/);
  assert.match(fs.readFileSync(store.file('audit.jsonl'),'utf8'),/"testsExecuted":0/);
});
test('persisted legacy Run config migrates on load; conflicting config fails before execution',async()=>{
  const config={...fixture(),projectMode:'isolated' as const},store=await createRun(config,config.allowedRepositories[0]!,'migration');
  const raw=JSON.parse(fs.readFileSync(store.file('state.json'),'utf8'));raw.config.workspaceMode='isolated';delete raw.config.projectMode;fs.writeFileSync(store.file('state.json'),JSON.stringify(raw));
  assert.equal(store.load().config.projectMode,'isolated');assert.equal(store.load().config.workspaceMode,undefined);
  raw.config.projectMode='direct';fs.writeFileSync(store.file('state.json'),JSON.stringify(raw));assert.throws(()=>store.load(),/Conflicting/);
});
test('final native acceptance reruns all stages and vetoes a reviewer regression in an earlier task',async()=>{
  const config=fixture(),dir=path.dirname(config.allowedRepositories[0]!);config.projectMode='isolated';config.maxReworks=0;
  const first=path.join(dir,'first.cjs'),last=path.join(dir,'last.cjs');
  fs.writeFileSync(first,"require('assert/strict').equal(require('fs').readFileSync('first.txt','utf8'),'good')");
  fs.writeFileSync(last,"require('assert/strict').equal(require('fs').readFileSync('last.txt','utf8'),'good')");
  config.tests=[{executable:process.execPath,args:[first]},{executable:process.execPath,args:[last]}];config.acceptanceStages={one:[0],two:[1]};
  const agents:Agents={executionMode:'native',async plan(){return {humanDecision:null,tasks:[{id:'first',instruction:'first',acceptance:['first'],acceptanceStage:'one'},{id:'last',instruction:'last',acceptance:['last'],dependsOn:['first'],acceptanceStage:'two'}]};},async execute(state){fs.writeFileSync(path.join(state.workspace,state.tasks[state.taskIndex]!.id+'.txt'),'good');return {mode:'native',summary:'local fixture'};},async review(state){if(state.taskIndex===1)fs.writeFileSync(path.join(state.workspace,'first.txt'),'broken');return {verdict:'pass',reason:'local reviewer regression injection'};}};
  const store=await createRun(config,config.allowedRepositories[0]!,'final checks'),state=await drive(store,agents);
  assert.equal(state.phase,'paused');assert.equal(state.evidence?.passed,false);assert.equal(state.evidence?.tests.length,2);assert.notEqual(state.evidence!.tests[0]!.exitCode,0);assert.equal(state.completedTaskIds?.includes('last'),false);
});
