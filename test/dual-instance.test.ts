import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { instanceData, claimInstanceData, sharedRuntime } from '../src/instance-runtime.js';
import { lockProject } from '../src/project-files.js';
import type { State, Store } from '../src/store.js';
import { createRun } from '../src/controller.js';
import { driveWithUserAcceptance as drive } from './helpers/accepted-flow.js';
import { MockAgents } from '../src/adapters.js';

const fixture=()=>{const dir=path.resolve('.validation/dual-instance',randomUUID());fs.mkdirSync(dir,{recursive:true});return dir;};
for(const id of ['main','dev','test']) test(`${id} real-mode Run reaches injected adapter without policy; authentication still reported`,async()=>{
 const dir=fixture(),source=path.join(dir,'project');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'user.txt'),'unchanged');
 const store=await createRun({mode:'real',projectMode:'direct',executionMode:'native',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},allowedRepositories:[source],runtimeDir:path.join(dir,id),claudeExecutable:'NEVER-PAID',timeoutMs:30000,maxLoops:2,maxReworks:1,tests:[],mockScenario:'pass'},source,'local adapter injection');
 let calls=0;const rejected=async()=>{calls++;throw Error('401 OAuth token expired');};
 const state=await drive(store,{executionMode:'native',plan:rejected,execute:rejected,review:rejected});
 assert.equal(calls,1);assert.equal(state.phase,'paused');assert.equal(state.failure?.kind,'authentication');assert.equal(state.loops,0);assert.equal(fs.readFileSync(path.join(source,'user.txt'),'utf8'),'unchanged');
 assert.equal(fs.existsSync(path.join(dir,'global-budget-policy.json')),false);
});
function worker(code:string,instanceId:string){
  const child=spawn(process.execPath,['--input-type=module','-e',code],{env:{...process.env,PERSONALAGENT_INSTANCE:instanceId},windowsHide:true,stdio:['pipe','pipe','pipe']});
  let out='',err='';const ready=new Promise<void>((resolve,reject)=>{child.stdout!.on('data',c=>{out+=c;if(out.includes('READY'))resolve();});child.once('error',reject);});
  const done=new Promise<string>((resolve,reject)=>{child.stderr!.on('data',c=>err+=c);child.once('error',reject);child.once('close',code=>code===0?resolve(out):reject(Error(err||out)));});
  return {child,ready,done};
}
test('independent MAIN/DEV claims preserve legacy data and reject shared data',()=>{
  const dir=fixture(),old=process.env.PERSONALAGENT_INSTANCE,override=process.env.PERSONAL_AGENT_DESKTOP_DATA;
  try{delete process.env.PERSONAL_AGENT_DESKTOP_DATA;process.env.PERSONALAGENT_INSTANCE='main';assert.equal(instanceData('D:/PersonalAgent'),path.resolve(process.platform==='win32'?'D:/PersonalAgent/.desktop-data':path.join(sharedRuntime,'instances/main')));
    fs.writeFileSync(path.join(dir,'sessions.json'),'historical');claimInstanceData(dir);assert.equal(fs.readFileSync(path.join(dir,'sessions.json'),'utf8'),'historical');
    process.env.PERSONALAGENT_INSTANCE='dev';assert.equal(instanceData('D:/PersonalAgent'),path.resolve(sharedRuntime,'instances/dev'));assert.throws(()=>claimInstanceData(dir),/another instance/);
    process.env.PERSONAL_AGENT_DESKTOP_DATA='D:/PersonalAgent/.desktop-data';assert.throws(()=>instanceData('D:/PersonalAgent'),/historical MAIN/);
  }finally{if(old===undefined)delete process.env.PERSONALAGENT_INSTANCE;else process.env.PERSONALAGENT_INSTANCE=old;if(override===undefined)delete process.env.PERSONAL_AGENT_DESKTOP_DATA;else process.env.PERSONAL_AGENT_DESKTOP_DATA=override;}
});
test('barrier synchronized MAIN/DEV/TEST Mock processes execute different projects without shared policy',{timeout:30000},async()=>{
 const dir=fixture(),start=path.join(dir,'start');
 const controller=new URL('../src/controller.js',import.meta.url).href,adapters=new URL('../src/adapters.js',import.meta.url).href;
 const code=`import fs from 'node:fs';import path from 'node:path';import {createRun} from ${JSON.stringify(controller)};import {driveWithUserAcceptance as drive} from ${JSON.stringify(new URL('./helpers/accepted-flow.js',import.meta.url).href)};import {MockAgents} from ${JSON.stringify(adapters)};const id=process.env.PERSONALAGENT_INSTANCE,source=path.join(${JSON.stringify(dir)},id);fs.mkdirSync(source);const config={mode:'mock',projectMode:'direct',executionMode:'native',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},allowedRepositories:[source],runtimeDir:path.join(${JSON.stringify(dir)},id+'-runtime'),claudeExecutable:'NEVER-PAID',timeoutMs:10000,maxLoops:4,maxReworks:1,tests:[{executable:process.execPath,args:['-e',"require('node:assert/strict').equal(require('fs').readFileSync(process.env.PERSONAL_AGENT_TASK_ID+'.txt','utf8'),process.env.PERSONAL_AGENT_TASK_ID+String.fromCharCode(10))"]}],mockScenario:'pass'};const store=await createRun(config,source,'local Mock');console.log('READY');while(!fs.existsSync(${JSON.stringify(start)}))await new Promise(r=>setTimeout(r,10));const state=await drive(store,new MockAgents(config));console.log(JSON.stringify({phase:state.phase,loops:state.loops,source:state.source}));`;
 const workers=['main','dev','test'].map(id=>worker(code,id));
 try{await Promise.all(workers.map(w=>w.ready));fs.writeFileSync(start,'go');const outputs=await Promise.all(workers.map(w=>w.done));for(const out of outputs){const state=JSON.parse(out.trim().split('\n').at(-1)!);assert.equal(state.phase,'completed',JSON.stringify(state));assert.equal(state.loops,2);assert.equal(fs.readFileSync(path.join(state.source,'done.txt'),'utf8'),'done\n');}assert.equal(fs.existsSync(path.join(dir,'global-budget-policy.json')),false);}
 finally{for(const w of workers)if(w.child.exitCode===null)w.child.kill();}
});
test('cross process same canonical project writes rejected, different projects and reads coexist',{timeout:15000},async()=>{
  const dir=fixture(),a=path.join(dir,'a'),b=path.join(dir,'b');fs.mkdirSync(a);fs.mkdirSync(b);fs.writeFileSync(path.join(a,'old.txt'),'old');
  const module=new URL('../src/project-files.js',import.meta.url).href;
  const holding=worker(`import {lockProject} from ${JSON.stringify(module)};const release=lockProject({id:'main',source:${JSON.stringify(a)},config:{projectMode:'direct'}});console.log('READY');await new Promise(r=>process.stdin.once('data',r));release();process.stdin.destroy();`,'main');
  try{await holding.ready;assert.equal(fs.readFileSync(path.join(a,'old.txt'),'utf8'),'old');assert.throws(()=>lockProject({id:'dev',source:a.toUpperCase(),config:{projectMode:'direct'}} as State),/already running/);const release=lockProject({id:'dev',source:b,config:{projectMode:'direct'}} as State);release();holding.child.stdin!.write('release');await holding.done;const recovered=lockProject({id:'dev',source:a,config:{projectMode:'direct'}} as State);recovered();}
  finally{if(holding.child.exitCode===null)holding.child.kill();}
});

test('TEST has independent default data and rejects MAIN/DEV claims without changing history',()=>{
 const dir=fixture(),old=process.env.PERSONALAGENT_INSTANCE,override=process.env.PERSONAL_AGENT_DESKTOP_DATA;
 try{
  process.env.PERSONALAGENT_INSTANCE='test';delete process.env.PERSONAL_AGENT_DESKTOP_DATA;
  assert.equal(instanceData('D:/PersonalAgent-worktrees/test'),path.resolve(sharedRuntime,'instances/test'));
  for(const data of ['D:/PersonalAgent/.desktop-data',path.join(sharedRuntime,'instances/dev')]){process.env.PERSONAL_AGENT_DESKTOP_DATA=data;assert.throws(()=>instanceData('D:/PersonalAgent-worktrees/test'),/TEST cannot use (?:historical MAIN|MAIN or DEV) data/);}
  for(const owner of ['main','dev']){
   const shared=path.join(dir,owner);fs.mkdirSync(shared);fs.writeFileSync(path.join(shared,'sessions.json'),'history');
   process.env.PERSONALAGENT_INSTANCE=owner;claimInstanceData(shared);const marker=fs.readFileSync(path.join(shared,'instance.json'));
   process.env.PERSONALAGENT_INSTANCE='test';assert.throws(()=>claimInstanceData(shared),/another instance/);
   assert.equal(fs.readFileSync(path.join(shared,'sessions.json'),'utf8'),'history');assert.deepEqual(fs.readFileSync(path.join(shared,'instance.json')),marker);
  }
  claimInstanceData(path.join(dir,'test'));assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'test','instance.json'),'utf8')).instanceId,'test');
 }finally{if(old===undefined)delete process.env.PERSONALAGENT_INSTANCE;else process.env.PERSONALAGENT_INSTANCE=old;if(override===undefined)delete process.env.PERSONAL_AGENT_DESKTOP_DATA;else process.env.PERSONAL_AGENT_DESKTOP_DATA=override;}
});
