import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {git,prepare} from '../src/workspace.js';
import {GitError,gitProcess,gitDiffCheck,gitHead,validateGitObjects} from '../src/git-process.js';
import {FlowError,classifyFailure} from '../src/failure.js';
import { createRun } from '../src/controller.js';
import { driveWithUserAcceptance as drive } from './helpers/accepted-flow.js';
import {MockAgents} from '../src/adapters.js';
import {Store} from '../src/store.js';
import type {Config} from '../src/schema.js';

const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pa-git-')));
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
async function fixture(){
 const dir=path.join(root,randomUUID().slice(0,8)),source=path.join(dir,'source');fs.mkdirSync(source,{recursive:true});
 await git(source,['init']);fs.writeFileSync(path.join(source,'seed.txt'),'seed\n');await git(source,['add','.']);await git(source,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','seed']);
 const config:Config={allowedRepositories:[source],runtimeDir:path.join(dir,'runtime'),mode:'mock',claudeExecutable:'NEVER-PAID',timeoutMs:10000,maxLoops:4,maxReworks:2,tests:[{executable:process.execPath,args:['-e','process.exit(0)']}],mockScenario:'pass'};
 return {dir,source,config,head:await gitHead(source)};
}
function removeLoose(source:string,sha:string){fs.unlinkSync(path.join(source,'.git/objects',sha.slice(0,2),sha.slice(2)));}
function audit(store:Store){let previous='';const records=fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s));for(const {hash,...record} of records){assert.equal(record.previousHash,previous);assert.equal(createHash('sha256').update(JSON.stringify(record)).digest('hex'),hash);previous=hash;}return records;}

test('short clone validates commit, tree and full object database; Mock completes',async()=>{
 const f=await fixture(),store=await createRun(f.config,f.source,'short clone');await validateGitObjects(store.load().workspace,f.head);
 assert.equal((await drive(store,new MockAgents(f.config))).phase,'completed');assert.equal(await git(f.source,['status','--porcelain']),'');
});
for(const length of [195,205,220])test(`deep clone at ${length} characters either verifies and completes or safely rejects before any Agent`,async()=>{
 const f=await fixture();const prefix=path.join(f.dir,'deep');const padding=length-prefix.length-1-52;assert.ok(padding>0);
 const config={...f.config,runtimeDir:path.join(prefix,'x'.repeat(padding))};
 try{
  const store=await createRun(config,f.source,'deep clone');assert.equal(store.load().workspace.length,length);await validateGitObjects(store.load().workspace,f.head);
  const state=await drive(store,new MockAgents(config));assert.equal(state.phase,'completed',state.reason);assert.equal(state.reworks,0);
 }catch(error){
  assert.ok(error instanceof FlowError);assert.ok(['git','git-integrity'].includes(error.kind));assert.ok(error.runId);
  const store=new Store(config.runtimeDir,error.runId!),state=store.load();assert.equal(state.phase,'failed');assert.equal(state.failure?.stage,'prepare');assert.equal(state.reason,error.message);
  assert.equal(state.loops,0);assert.equal(state.reworks,0);assert.equal(state.claudeCalls,0);assert.equal(audit(store).filter(e=>e.event==='agent-start').length,0);
  const agents=new MockAgents(config);agents.plan=async()=>{assert.fail('Agent must never run');};assert.equal((await drive(store,agents)).phase,'failed');
 }
});
for(const object of ['commit','tree','blob'] as const)test(`HEAD exists but ${object} object is missing: reject preparation and preserve typed evidence`,async()=>{
 const f=await fixture();const sha=object==='commit'?f.head:await git(f.source,['rev-parse',object==='tree'?'HEAD^{tree}':'HEAD:seed.txt']);removeLoose(f.source,sha);
 assert.equal(await gitHead(f.source),f.head);
 await assert.rejects(createRun(f.config,f.source,'missing object'),error=>{
  assert.ok(error instanceof GitError);assert.ok(['git','git-integrity'].includes(error.kind));assert.ok(error.runId);assert.ok(error.message.includes(error.result.stderr));
  const store=new Store(f.config.runtimeDir,error.runId!),state=store.load();assert.equal(state.reason,error.message);assert.ok(['git','git-integrity'].includes(state.failure!.kind));assert.equal(state.loops,0);assert.equal(state.reworkPending,false);
  assert.equal(audit(store).find(e=>e.event==='error').data.message,error.message);return true;
 });
});
test('legacy clone loses objects: no planner, executor, review or rework budget consumed',async()=>{
 const f=await fixture(),store=await createRun(f.config,f.source,'corrupt existing clone');const state=store.load();delete state.snapshotPolicy;for(const file of fs.readdirSync(path.join(state.workspace,'.git/objects/pack')))fs.unlinkSync(path.join(state.workspace,'.git/objects/pack',file));
 assert.equal(await gitHead(state.workspace),f.head);state.phase='execute';state.nextPhase='execute';state.tasks=[{id:'one',instruction:'local',acceptance:['local']}];state.reworkPending=true;store.save(state);
 const agents=new MockAgents(f.config);for(const name of ['plan','execute','review'] as const)agents[name]=async()=>{assert.fail('Agent must not run');};
 const result=await drive(store,agents);assert.equal(result.phase,'failed');assert.ok(['git','git-integrity'].includes(result.failure!.kind));assert.equal(result.reworks,0);assert.equal(result.totalReworks,0);assert.equal(result.loops,0);assert.equal(result.reworkPending,false);assert.doesNotMatch(result.reason,/Rework limit reached/);
 assert.equal(audit(store).filter(e=>e.event==='agent-start').length,0);
});
test('diff --check exit 128 preserves both streams and never becomes an empty issue',async()=>{
 const f=await fixture();await assert.rejects(gitDiffCheck(f.source,'missing-revision'),error=>{assert.ok(error instanceof GitError);assert.equal(error.result.exitCode,128);assert.match(error.message,/missing-revision/);assert.ok(error.message.includes(error.result.stderr));assert.equal(classifyFailure(error,'verify').kind,'git');return true;});
});
test('real whitespace findings remain issues (exit 2), not infrastructure errors',async()=>{
 const f=await fixture();fs.writeFileSync(path.join(f.source,'seed.txt'),'seed   \n');const result=await gitDiffCheck(f.source,f.head);assert.equal(result.exitCode,2);assert.match(result.stdout,/trailing whitespace/);
});
test('Git infrastructure failure during execution stops all further Agent calls without rework',async()=>{
 const f=await fixture(),store=await createRun(f.config,f.source,'Git failure'),agents=new MockAgents(f.config);let executes=0,reviews=0;
 agents.execute=async state=>{executes++;await gitDiffCheck(state.workspace,'missing-revision');assert.fail('unreachable');};agents.review=async()=>{reviews++;assert.fail('review must not run');};
 const result=await drive(store,agents);assert.equal(result.phase,'failed');assert.equal(result.failure?.kind,'git');assert.equal(result.reworks,0);assert.equal(result.totalReworks,0);assert.equal(result.reworkPending,false);assert.equal(executes,1);assert.equal(reviews,0);
 await drive(store,agents,'retry must remain blocked');assert.equal(executes,1);assert.equal(audit(store).find(e=>e.event==='error').data.message,result.reason);
});
test('all unexpected Git status/ignore/diff/fsck/clone exits are typed with full diagnostics',async()=>{
 for(const args of [['status','--porcelain'],['check-ignore','file'],['diff','--no-index','left','right'],['fsck'],['clone','source','destination']]){
  const stderr='fatal: injected infrastructure error\n'+'e'.repeat(2200),stdout='diagnostic stdout\n';
  await assert.rejects(gitProcess(root,args,{},async()=>({exitCode:128,stdout,stderr})),error=>{assert.ok(error instanceof GitError);assert.ok(error.message.includes(stderr));assert.ok(error.message.includes(stdout));return true;});
 }
 await assert.rejects(gitProcess(root,['status'],{},async()=>{throw Error('spawn ENOENT');}),error=>{assert.ok(error instanceof FlowError);assert.equal(error.kind,'git');assert.match(error.message,/spawn ENOENT/);return true;});
});
test('unborn Git and ordinary folders remain supported; fatal HEAD errors are not unborn',async()=>{
 const f=await fixture(),empty=path.join(f.dir,'empty');fs.mkdirSync(empty);await git(empty,['init']);assert.equal(await gitHead(empty),'unborn');await validateGitObjects(empty,'unborn');
 const config={...f.config,allowedRepositories:[empty],runtimeDir:path.join(f.dir,'empty-runtime'),projectMode:'isolated' as const};await assert.rejects(createRun(config,empty,'unborn clone'),/requires a commit/);assert.ok(await createRun({...config,projectMode:'direct',directAuthorization:{projectPath:empty,acknowledgedAt:new Date().toISOString()}},empty,'authorized unborn'));
 const folder=path.join(f.dir,'plain');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'user.txt'),'preserve');const ordinary=await createRun({...f.config,projectMode:'direct',executionMode:'native',directAuthorization:{projectPath:folder,acknowledgedAt:new Date().toISOString()},allowedRepositories:[folder],runtimeDir:path.join(f.dir,'plain-runtime')},folder,'plain folder');assert.equal((await drive(ordinary,new MockAgents(ordinary.load().config))).phase,'completed');assert.equal(fs.readFileSync(path.join(folder,'user.txt'),'utf8'),'preserve');
 await assert.rejects(gitHead(folder),error=>error instanceof GitError && error.result.exitCode===128);
});
