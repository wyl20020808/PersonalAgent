import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { captureProject, readProject, loadProject, projectBytes, projectFiles, inspectProject, fileStatus, restoreProject } from '../src/project-files.js';
import { drive as controllerDrive } from '../src/controller.js';
import { createHistoricalRun as createRun } from './helpers/historical-run.js';
import { driveWithUserAcceptance as drive } from './helpers/accepted-flow.js';
import { git, snapshot, repositoryContext } from '../src/workspace.js';
import { captureBaseline, baselineDiff } from '../src/incremental.js';
import { previewDelivery, applyDelivery } from '../src/delivery.js';
import type { Config } from '../src/schema.js';
import type { Agents } from '../src/adapters.js';

const root = path.resolve('.validation', `ls-${randomUUID().slice(0,8)}`);
function fixture() { const dir=path.join(root,randomUUID().slice(0,8)), source=path.join(dir,'source');fs.mkdirSync(source,{recursive:true});return {dir,source}; }
function largeFile(source: string) {
  fs.mkdirSync(path.join(source,'Content'),{recursive:true});
  const file=path.join(source,'Content','World.umap'); fs.writeFileSync(file,Buffer.from([0,1,2,3]));fs.truncateSync(file,101*1024*1024);return file;
}

test('20001 files use a bounded manifest; diagnostic limits distinguish count and capacity',()=>{
  const {dir,source}=fixture();for(let i=0;i<20001;i++)fs.writeFileSync(path.join(source,`${i}.txt`),'same');
  assert.equal(projectFiles(source).length,20001);
  assert.throws(()=>projectFiles(source,{maxFiles:20000}),/file count limit exceeded: 20001/);
  assert.throws(()=>projectFiles(source,{maxManifestBytes:80}),/manifest capacity limit exceeded/);
  assert.throws(()=>projectFiles(source,{maxFiles:NaN}),/positive safe integers/);
  const inventory=inspectProject(source);assert.equal(inventory.fileCount,20001);assert.match(inventory.coverage,/no content hashes/);
  assert.deepEqual(fs.readdirSync(dir),['source']); // Diagnosis creates no Run or backup.
  const manifest=readProject(source);assert.equal(Object.keys(manifest.files).length,20001);assert.ok(JSON.stringify(manifest).length<3*1024*1024);
});

test('large binary backups deduplicate; same-size same-mtime changes cannot evade hashes; corrupt and legacy backups are checked',()=>{
  const {dir,source}=fixture(), file=largeFile(source), objects=path.join(dir,'snapshot-objects');
  const first=captureProject(source,objects);assert.ok(JSON.stringify(first).length<1000);assert.equal(fs.readdirSync(objects).length,1);
  captureProject(source,objects);assert.equal(fs.readdirSync(objects).length,1);
  const stat=fs.statSync(file),fd=fs.openSync(file,'r+');fs.writeSync(fd,Buffer.from([8]),0,1,50*1024*1024);fs.closeSync(fd);fs.utimesSync(file,stat.atime,stat.mtime);
  const second=captureProject(source,objects);assert.notEqual(first.digest,second.digest);assert.match(fileStatus(first,second),/M Content\/World.umap/);assert.equal(fs.readdirSync(objects).length,2);
  fs.writeFileSync(path.join(objects,first.files['Content/World.umap']!),'corrupt');assert.throws(()=>projectBytes(first,'Content/World.umap'),/fingerprint mismatch/);
  const files={'legacy.txt':Buffer.from('legacy').toString('base64')}, legacy=path.join(dir,'legacy.json');fs.writeFileSync(legacy,JSON.stringify({files,digest:createHash('sha256').update(JSON.stringify(files)).digest('hex')}));assert.equal(projectBytes(loadProject(legacy),'legacy.txt').toString(),'legacy');
});

for (const mode of ['direct','isolated'] as const) for (const useGit of [false,true]) test(`large project lifecycle ${mode} Git=${useGit}, unchanged resources remain checked`,async()=>{
  const {dir,source}=fixture();largeFile(source);fs.writeFileSync(path.join(source,'main.cpp'),'old');
  if(useGit){await git(source,['init']);await git(source,['add','.']);await git(source,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']);}
  const config:Config={mode:'mock',projectMode:mode,executionMode:'native',runtimeDir:path.join(dir,'runtime'),allowedRepositories:[source],directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},claudeExecutable:'NEVER-PAID',timeoutMs:10000,maxLoops:2,maxReworks:0,mockScenario:'pass',tests:[{executable:process.execPath,args:['-e',"require('assert/strict').equal(require('fs').readFileSync('main.cpp','utf8'),'new')"]}]};
  const store=await createRun(config,source,'local large fixture'), state=store.load();
  const original=await snapshot(state.workspace,undefined,true);assert.doesNotMatch(JSON.stringify(await repositoryContext(state.workspace,new AbortController().signal)), /[+].*World.umap/);
  await captureBaseline(store,state,'round-1-baseline.json',new AbortController().signal);const count=fs.readdirSync(store.file('snapshot-objects')).length;
  await captureBaseline(store,state,'round-2-baseline.json',new AbortController().signal);assert.equal(fs.readdirSync(store.file('snapshot-objects')).length,count);
  const agents:Agents={executionMode:'native',async plan(){return {humanDecision:null,tasks:[{id:'change',instruction:'change source',acceptance:['external test passes']}]};},async execute(s){fs.writeFileSync(path.join(s.workspace,'main.cpp'),'new');return {mode:'native',summary:'local fixture only'};},async review(){return {verdict:'pass',reason:'local fixture only'};}};
  const result=await drive(store,agents);assert.equal(result.phase,'completed',result.reason);assert.equal(result.evidence?.decisionAccepted, true);assert.equal(result.evidence?.userAccepted, undefined);assert.notEqual(await snapshot(state.workspace,undefined,true),original);
  const preview=await previewDelivery(store,source,mode==='direct'?'direct':'project-files');assert.ok(preview.digest);
  const asset=path.join(state.workspace,'Content','World.umap'), fd=fs.openSync(asset,'r+');fs.writeSync(fd,Buffer.from([9]),0,1,0);fs.closeSync(fd);
  assert.notEqual(await snapshot(state.workspace,undefined,true),result.evidence!.snapshotDigest);
  assert.match((await baselineDiff(store,result,'project-baseline.json',new AbortController().signal))!,/Content requires asset\/large-file review; SHA-256 before/);
  assert.ok(loadProject(store.file('project-baseline.json')).files['Content/World.umap']);
});

for(const resource of ['asset.uasset','blob.dat']) test(`${resource} edits reach decision reviewer without inventing test or delivery approval`,async()=>{
  const {dir,source}=fixture();fs.writeFileSync(path.join(source,resource),Buffer.from([0,1]));
  const config:Config={mode:'mock',projectMode:'direct',executionMode:'native',runtimeDir:path.join(dir,'runtime'),allowedRepositories:[source],directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},claudeExecutable:'NEVER-PAID',timeoutMs:5000,maxLoops:2,maxReworks:0,mockScenario:'pass',tests:[{executable:process.execPath,args:['-e','process.exit(0)']}]};
  const store=await createRun(config,source,'local resource change');let reviews=0;
  const agents:Agents={executionMode:'native',async plan(){return {humanDecision:null,tasks:[{id:'asset',instruction:'change asset',acceptance:['resource review']}]};},async execute(s){fs.writeFileSync(path.join(s.workspace,resource),Buffer.from([0,2]));return {mode:'native',summary:'local fixture'};},async review(){reviews++;return {verdict:'pass',reason:'must never run'};}};
  const result=await controllerDrive(store,agents);assert.equal(result.phase,'completed');assert.equal(result.evidence!.decisionAccepted,true);assert.equal(result.evidence!.passed,false);assert.equal(reviews,1);assert.equal(result.evidence!.decisionReview!.verdict,'pass');assert.equal(result.evidence!.userAccepted,undefined);const preview=await previewDelivery(store,source,'direct');await assert.rejects(applyDelivery(store,preview.id),/approval|approved/i);
  const audit=fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line)), checkpoint=audit.filter(row=>row.event==='direct-checkpoint').at(-1).data.checkpoint;
  restoreProject(store,checkpoint,'explicit local fixture restore');assert.deepEqual(fs.readFileSync(path.join(source,resource)),Buffer.from([0,1]));
});
