import {completeFixtureRun} from './acceptance-fixture.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {DesktopService,validateRequest} from './test-service.js';
import {createRun} from '../../dist/src/controller.js';
import {git} from '../../dist/src/workspace.js';
import {GitError} from '../../dist/src/git-process.js';
import {classifyFailure} from '../../dist/src/failure.js';
import {Store} from '../../dist/src/store.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),data=path.join(root,'.v3c3','u-'+randomUUID().slice(0,8));
const service=new DesktopService(root,data,process.execPath);
test('Git preparation failure is visible in GUI detail and audited chat; no child Agent launched',async()=>{
 const folder=path.join(data,'corrupt-source');fs.mkdirSync(folder,{recursive:true});await git(folder,['init']);fs.writeFileSync(path.join(folder,'seed.txt'),'seed\n');await git(folder,['add','.']);await git(folder,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','seed']);
 const head=await git(folder,['rev-parse','HEAD']);fs.unlinkSync(path.join(folder,'.git/objects',head.slice(0,2),head.slice(2)));
 const local=new DesktopService(root,path.join(data,'git-failure'),process.execPath);local.launch=()=>{assert.fail('No Agent may launch after preparation failure');};
 const run=await local.dispatch({operation:'startProject',projectPath:folder,goal:'local corrupt Git fixture',projectMode:'isolated',mode:'mock',maxClaudeCalls:5,maxLoops:4,maxReworks:1}) as any;
 assert.equal(run.phase,'failed');assert.equal(run.failure.kind,'git');assert.equal(run.failure.recoverable,false);assert.equal(run.active,false);assert.equal(run.loops,0);assert.equal(run.reworks,0);assert.equal(run.claudeCalls,0);assert.equal(local.children.size,0);assert.match(run.reason,/status/);assert.match(run.reason,/fatal:/);assert.doesNotMatch(run.reason,/Rework limit reached/);
 const detail=local.detail(run.profileId,run.id);assert.equal(detail.auditVerified,true);assert.equal(detail.run.reason,run.reason);assert.ok(local.thread(run.profileId,run.id).messages.some(m=>m.kind==='error'&&m.text===run.reason));
 const before=fs.readFileSync(path.join(folder,'seed.txt'),'utf8');await assert.rejects(local.dispatch({operation:'resume',profileId:run.profileId,runId:run.id,decision:'must reject'}));assert.equal(fs.readFileSync(path.join(folder,'seed.txt'),'utf8'),before);
});
test('GUI and audit preserve complete long Git stdout/stderr diagnostics',async()=>{
 const local=new DesktopService(root,path.join(data,'full-git-evidence'),process.execPath),folder=path.join(data,'full-git-source');fs.mkdirSync(folder,{recursive:true});
 const config={allowedRepositories:[folder],runtimeDir:path.join(data,'full-git-runtime'),projectMode:'direct' as const,directAuthorization:{projectPath:folder,acknowledgedAt:new Date().toISOString()},mode:'mock' as const,mockScenario:'pass' as const,claudeExecutable:'NEVER-PAID',timeoutMs:10000,maxLoops:4,maxReworks:1,tests:[]};const file=path.join(data,'full-git.json');fs.writeFileSync(file,JSON.stringify(config));local.register(file);const profile=local.overview().profiles[0]!;
 const store=await createRun(config,folder,'full diagnostics'),state=store.load();const error=new GitError(state.workspace,['diff','--check'],{exitCode:128,stdout:'full stdout\n'+'x'.repeat(1300),stderr:'fatal: full stderr\n'+'z'.repeat(100300)});state.failure=classifyFailure(error,'verify');state.reason=error.message;state.phase='failed';store.save(state);store.audit('error',state.failure);
 const detail=local.detail(profile.id,store.id);assert.equal(detail.auditVerified,true);assert.equal(detail.run.failure?.message,error.message);assert.equal(detail.run.reason,error.message);assert.equal(detail.activity.at(-1)?.message,error.message);assert.equal(local.thread(profile.id,store.id).messages.find(m=>m.kind==='error')?.text,error.message);
});
async function terminal(profileId:string,id:string){for(let n=0;n<300;n++){const r=service.detail(profileId,id).run;if(!r.active&&['completed','paused','failed'].includes(r.phase))return r;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('local fixture timed out');}
test('canonical and legacy project IPC agree; conflicting modes and proposal tool escape are rejected',()=>{
 const r={operation:'startProject',projectPath:data,goal:'fixture',mode:'mock',maxClaudeCalls:5,maxLoops:4,maxReworks:1};
 const old=validateRequest({...r,workspaceMode:'isolated'});assert.equal(old.projectMode,'isolated');assert.equal(old.workspaceMode,undefined);
 assert.equal(validateRequest({...r,projectMode:'direct'}).projectMode,'direct');
 for(const extra of [{projectMode:'direct',workspaceMode:'isolated'},{projectMode:'bad'},{projectMode:'direct',executionMode:'proposal'},{projectMode:'direct',command:'whoami'}])assert.throws(()=>validateRequest({...r,...extra}));
});
test('recent settings migrate from workspaceMode and conflicting persisted choices fail',()=>{
 const folder=path.join(data,'recent');fs.mkdirSync(folder,{recursive:true});const registry=service.registry();const project=service.inspectProject(folder);
 registry.recentProjects=[{...project,settings:{...project.settings,projectMode:undefined,workspaceMode:'isolated'}} as any];fs.writeFileSync(service.registryFile,JSON.stringify(registry));
 const migrated=service.inspectProject(folder);assert.equal(migrated.settings.projectMode,'isolated');assert.equal('workspaceMode' in migrated.settings,false);
 (registry.recentProjects[0]!.settings as any).projectMode='direct';fs.writeFileSync(service.registryFile,JSON.stringify(registry));assert.throws(()=>service.inspectProject(folder),/Conflicting/);
 registry.recentProjects=[];fs.writeFileSync(service.registryFile,JSON.stringify(registry));
});
test('paid no-test project remains configurable without launching any paid service',async()=>{
 const folder=path.join(data,'no-tests-real');fs.mkdirSync(folder,{recursive:true});
 const local=new DesktopService(root,path.join(data,'no-launch'),process.execPath);
 local.start=async request=>{const config=local.config(request.profileId!).config;assert.equal(config.tests.length,0);assert.equal(config.projectMode,'isolated');assert.equal(config.executionMode,'native');throw Error('LOCAL INTERCEPT: no Agent launched');};
 await assert.rejects(local.startProject({operation:'startProject',projectPath:folder,goal:'no paid call',projectMode:'isolated',mode:'real',realAcknowledged:true,selectedTests:[],maxClaudeCalls:5,maxLoops:4,maxReworks:1}),/LOCAL INTERCEPT/);
 assert.equal(local.children.size,0);assert.deepEqual(fs.readdirSync(folder),[]);
});
test('ordinary folder direct GUI service confirms exact approved result without duplicate writes',async()=>{
 const folder=path.join(data,'direct');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'user.txt'),'保留用户成果\n');
 const run=await service.dispatch({operation:'startProject',projectPath:folder,goal:'local Mock only',projectMode:'direct',mode:'mock',directAcknowledged:true,maxClaudeCalls:5,maxLoops:4,maxReworks:1}) as any;
 const done=await completeFixtureRun(service,run.profileId,run.id);assert.equal(done.phase,'completed');assert.equal(done.claudeCalls,0);assert.equal(done.projectMode,'direct');
 const base={profileId:run.profileId,runId:run.id},mtime=fs.statSync(path.join(folder,'hello.txt')).mtimeMs;
 const preview=await service.dispatch({...base,operation:'preview',target:folder,branch:'direct'}) as any;
 await service.dispatch({...base,operation:'approve',deliveryId:preview.id,digest:preview.digest,decision:'仅确认本次新建 Mock 夹具成果'});
 await service.dispatch({...base,operation:'apply',deliveryId:preview.id});const delivery=(await service.deliveries(run.profileId,run.id))[0]!;
 assert.equal(delivery.kind,'direct');assert.deepEqual(delivery.written,[]);assert.equal(delivery.phase,'applied');assert.equal(fs.statSync(path.join(folder,'hello.txt')).mtimeMs,mtime);assert.equal(fs.readFileSync(path.join(folder,'user.txt'),'utf8'),'保留用户成果\n');
 const {config}=service.config(run.profileId),store=await createRun(config,folder,'lookup fixture');const state=store.load();state.workspace=data;store.save(state);assert.throws(()=>service.store(run.profileId,state.id),/workspace mismatch/);
});
test('manual service acceptance records critical approval, then decision passes advance without approving delivery',async()=>{
 const folder=path.join(data,'manual');fs.mkdirSync(folder,{recursive:true});const configFile=path.join(data,'manual-config.json');
 const config={allowedRepositories:[folder],runtimeDir:path.join(data,'manual-runtime'),projectMode:'direct',directAuthorization:{projectPath:folder,acknowledgedAt:new Date().toISOString()},executionMode:'native',mode:'mock',claudeExecutable:'NEVER-PAID',timeoutMs:10000,maxClaudeCalls:5,maxLoops:4,maxReworks:1,tests:[],mockScenario:'human'};
 fs.writeFileSync(configFile,JSON.stringify(config));service.register(configFile);const profile=service.overview().profiles.find(p=>p.runtimeDir===config.runtimeDir)!;
 const run=await service.dispatch({operation:'start',profileId:profile.id,repository:folder,goal:'manual local fixture',scenario:'human',maxClaudeCalls:5,maxLoops:4,maxReworks:1}) as any;const base={profileId:profile.id,runId:run.id};
 for(let index=0;index<1;index++){
  const paused=await terminal(profile.id,run.id);assert.equal(paused.phase,'paused');assert.ok(paused.manualAcceptanceDigest);assert.equal(paused.evidence?.passed,false);
  await assert.rejects(service.dispatch({...base,operation:'manualAccept',digest:'0'.repeat(64),decision:'检查'}),/exact/);
  await service.dispatch({...base,operation:'manualAccept',digest:paused.manualAcceptanceDigest!,decision:'已检查任务 '+index+' 的实际文件与 Diff，符合本地夹具标准'});
  if(index===0)await service.dispatch({...base,operation:'resume',decision:'继续下一本地夹具任务，不调用真实 Agent'});
 }
 const done=await terminal(profile.id,run.id);assert.equal(done.phase,'completed');assert.equal(done.manualAccepted,false);assert.equal(done.evidence?.decisionAccepted,true);assert.equal(done.evidence?.passed,false);assert.deepEqual(done.evidence?.tests,[]);assert.equal(done.claudeCalls,0);
 const audit=service.audit(service.store(profile.id,run.id));assert.equal(audit.filter(e=>e.event==='manual-acceptance').length,1);assert.equal(audit.filter(e=>e.event==='decision-acceptance').length,1);
 assert.equal((await service.deliveries(profile.id,run.id)).length,0);const preview=await service.dispatch({...base,operation:'preview',target:folder,branch:'direct'}) as any;await assert.rejects(service.dispatch({...base,operation:'apply',deliveryId:preview.id}),/approval/);
 service.register(configFile,true);await assert.rejects(service.dispatch({...base,operation:'manualAccept',digest:'0'.repeat(64),decision:'replay'}),/只读/);
});
