import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRun,drive} from '../src/controller.js';
import {git} from '../src/workspace.js';
import {lockProject,readProject,restoreProject} from '../src/project-files.js';
import {previewDelivery,approveDelivery,applyDelivery} from '../src/delivery.js';
import {baselineDiff} from '../src/incremental.js';
import type {Config} from '../src/schema.js';
import type {Agents} from '../src/adapters.js';
import {MockAgents} from '../src/adapters.js';

const root=path.resolve('.validation',`project-modes-${randomUUID()}`);fs.mkdirSync(root,{recursive:true});
async function fixture(mode:'direct'|'isolated',kind:'empty'|'existing'|'dirty'='empty') {
  const directory=path.join(root,randomUUID()),source=path.join(directory,'project');fs.mkdirSync(source,{recursive:true});
  if(kind!=='empty')fs.writeFileSync(path.join(source,'existing.txt'),'user content\n');
  if(kind==='dirty') {fs.writeFileSync(path.join(source,'delete-me.txt'),'tracked before user deletion\n');await git(source,['init']);await git(source,['add','.']);await git(source,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']);fs.unlinkSync(path.join(source,'delete-me.txt'));fs.writeFileSync(path.join(source,'existing.txt'),'uncommitted user content\n');fs.writeFileSync(path.join(source,'untracked.txt'),'user untracked\n');}
  const verifier=path.join(directory,'verify.cjs');fs.writeFileSync(verifier,"require('node:assert/strict').equal(require('fs').readFileSync('result.txt','utf8'),'native result\\n');console.log('independent local fixture passed')");
  const config:Config={allowedRepositories:[source],runtimeDir:path.join(directory,'runtime'),projectMode:mode,directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},executionMode:'native',mode:'mock',claudeExecutable:'NEVER-PAID',timeoutMs:5000,maxLoops:4,maxReworks:2,mockScenario:'pass',tests:[{executable:process.execPath,args:[verifier]}]};
  return {source,config,store:await createRun(config,source,'local fixture only')};
}
function native():Agents{return {executionMode:'native',async plan(state){fs.writeFileSync(path.join(state.workspace,'plan-note.txt'),'local CC fixture repair\n');return {humanDecision:null,tasks:[{id:'develop',instruction:'write result',acceptance:['local independent verifier passes']}]};},async execute(state){fs.writeFileSync(path.join(state.workspace,'result.txt'),'native result\n');fs.writeFileSync(path.join(state.workspace,'empty.txt'),'');return {mode:'native',summary:'local fixture wrote files, no paid Agent'};},async review(state){fs.writeFileSync(path.join(state.workspace,'review-note.txt'),'local CC fixture review repair\n');return {verdict:'pass',reason:'local fixture review; Controller revalidates'};}};}
for(const mode of ['direct','isolated'] as const)for(const kind of ['empty','existing','dirty'] as const)test(`${mode} native local fixture supports ${kind} project without fake Git`,async()=>{
  const f=await fixture(mode,kind),before=readProject(f.source),state=await drive(f.store,native());
  assert.equal(state.phase,'completed');assert.equal(state.workspace,mode==='direct'?fs.realpathSync(f.source):f.store.file('workspace'));
  assert.match(state.evidence!.diff,/plan-note.txt/);assert.match(state.evidence!.diff,/review-note.txt/);assert.match(state.evidence!.diff,/empty.txt \(added\)/);
  if(kind!=='empty')assert.equal(fs.readFileSync(path.join(state.workspace,'existing.txt'),'utf8'),kind==='dirty'?'uncommitted user content\n':'user content\n');
  if(kind==='dirty') {assert.equal(fs.existsSync(path.join(state.workspace,'delete-me.txt')),false);assert.equal(await git(state.workspace,['rev-parse','HEAD']),await git(f.source,['rev-parse','HEAD']));assert.match(await git(state.workspace,['status','--porcelain']),/delete-me.txt/);assert.equal(fs.readFileSync(path.join(state.workspace,'untracked.txt'),'utf8'),'user untracked\n');}
  if(mode==='direct') {assert.equal(fs.readFileSync(path.join(f.source,'result.txt'),'utf8'),'native result\n');const preview=await previewDelivery(f.store,f.source,'direct');assert.ok(preview.digest);}
  else {assert.equal(readProject(f.source).digest,before.digest);assert.equal(fs.existsSync(path.join(state.workspace,'.git')),kind==='dirty');const preview=await previewDelivery(f.store,f.source,'');await approveDelivery(f.store,preview.id,preview.digest,'explicit local fixture approval');await applyDelivery(f.store,preview.id);assert.equal(fs.readFileSync(path.join(f.source,'result.txt'),'utf8'),'native result\n');await applyDelivery(f.store,preview.id);}
  if(kind!=='dirty')assert.equal(fs.existsSync(path.join(f.source,'.git')),false);
});
test('direct authorization exact project and timestamp are required',async()=>{
  const f=await fixture('direct');await assert.rejects(createRun({...f.config,directAuthorization:undefined},f.source,'x'),/explicit authorization/);await assert.rejects(createRun({...f.config,directAuthorization:{projectPath:f.source,acknowledgedAt:'invalid'}},f.source,'x'),/explicit authorization/);
});
test('direct recovery refuses external changes and active different-run writer; explicit checkpoint restores original files',async()=>{
  const f=await fixture('direct','existing');await drive(f.store,native());
  const audit=fs.readFileSync(f.store.file('audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line)),checkpoint=audit.filter(row=>row.event==='direct-checkpoint').at(-1).data.checkpoint;
  const release=lockProject({...f.store.load(),id:randomUUID(),config:{...f.config,runtimeDir:path.join(root,'another-profile')}});
  try{assert.throws(()=>restoreProject(f.store,checkpoint,'restore'),/already running/);}finally{release();}
  fs.writeFileSync(path.join(f.source,'result.txt'),'external edit\n');assert.throws(()=>restoreProject(f.store,checkpoint,'restore'),/recovery conflict/);
  fs.writeFileSync(path.join(f.source,'result.txt'),'native result\n');restoreProject(f.store,checkpoint,'explicit local fixture restore');assert.equal(fs.existsSync(path.join(f.source,'result.txt')),false);assert.equal(fs.readFileSync(path.join(f.source,'existing.txt'),'utf8'),'user content\n');assert.equal(f.store.load().phase,'stopped');
});
test('isolated delivery refuses source changes after creation',async()=>{
  const f=await fixture('isolated','existing');await drive(f.store,native());fs.writeFileSync(path.join(f.source,'existing.txt'),'new user work\n');await assert.rejects(previewDelivery(f.store,f.source,''),/source changed/);
});
test('no tests does not produce completed or verified result',async()=>{
  const f=await fixture('direct');f.config.tests=[];const store=await createRun(f.config,f.source,'unverified fixture');const state=await drive(store,native());assert.equal(state.phase,'paused');assert.equal(state.evidence!.passed,false);assert.match(state.reason,/human verification required/);
});
test('empty file deletion remains visible in incremental evidence',async()=>{
  const f=await fixture('isolated');fs.writeFileSync(path.join(f.source,'empty-before.txt'),'');const store=await createRun(f.config,f.source,'empty deletion fixture');fs.unlinkSync(path.join(store.load().workspace,'empty-before.txt'));assert.match((await baselineDiff(store,store.load(),'project-baseline.json',new AbortController().signal))!,/empty-before.txt \(deleted\)/);
});
test('native Mock repeated run on same project has explicit unique local fixture evidence',async()=>{
  const f=await fixture('direct');
  const verifier=path.join(path.dirname(f.source),'mock-verify.cjs');
  fs.writeFileSync(verifier,"const fs=require('fs'),a=require('assert/strict');a.equal(fs.readFileSync('hello.txt','utf8'),'hello\\n');if(process.env.PERSONAL_AGENT_FINAL_TASK==='true'){a.equal(fs.readFileSync('done.txt','utf8'),'done\\n');a.ok(fs.existsSync('mock-result-'+process.env.PERSONAL_AGENT_RUN_ID+'.txt'));}");
  f.config.tests=[{executable:process.execPath,args:[verifier]}];
  const first=await createRun(f.config,f.source,'first native Mock run');assert.equal((await drive(first,new MockAgents(f.config))).phase,'completed');
  const second=await createRun(f.config,f.source,'reopen recent project native Mock run');assert.equal((await drive(second,new MockAgents(f.config))).phase,'completed');
  assert.equal(fs.existsSync(path.join(f.source,`mock-result-${second.id}.txt`)),true);
});
test('native reviewer cannot commit without triggering independent HEAD revalidation',async()=>{
  const f=await fixture('isolated','dirty'),a=native();const state=f.store.load();state.config.maxReworks=0;f.store.save(state);
  a.review=async current=>{await git(current.workspace,['add','result.txt']);await git(current.workspace,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','unauthorized local fixture commit']);return {verdict:'pass',reason:'local fault injection; not real Agent'};};
  const result=await drive(f.store,a);assert.notEqual(result.phase,'completed');assert.equal(result.evidence?.passed,false);assert.ok(result.evidence?.issues.includes('Git HEAD changed; commits and merges are forbidden'));assert.equal(fs.existsSync(path.join(f.source,'result.txt')),false);
});
