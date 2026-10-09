import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { initializeGlobalBudget, reserveGlobalBudget } from '../src/global-budget.js';
import { readSharedBudget, reserveSharedCall } from '../src/shared-budget.js';
import { instanceData, claimInstanceData } from '../src/instance-runtime.js';
import { lockProject } from '../src/project-files.js';
import type { State, Store } from '../src/store.js';
import { createRun, drive } from '../src/controller.js';

const fixture=()=>{const dir=path.resolve('.validation/dual-instance',randomUUID());fs.mkdirSync(dir,{recursive:true});return dir;};
test('formal Controller refuses a paid operation before invoking any injected Agent when shared authorization is missing',async()=>{
 const dir=fixture(),source=path.join(dir,'project');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'user.txt'),'unchanged');
 const store=await createRun({mode:'real',projectMode:'direct',executionMode:'native',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},allowedRepositories:[source],runtimeDir:path.join(dir,'runtime'),claudeExecutable:'NEVER-PAID',timeoutMs:30000,maxLoops:2,maxReworks:1,maxClaudeCalls:5,tests:[],mockScenario:'pass'},source,'shared gate only');
 let calls=0;const rejected=async()=>{calls++;throw Error('Agent must not be called');};
 const state=await drive(store,{executionMode:'native',plan:rejected,execute:rejected,review:rejected},undefined,undefined,undefined,path.join(dir,'missing-policy.json'));
 assert.equal(calls,0);assert.equal(state.phase,'paused');assert.equal(state.failure?.kind,'budget');assert.equal(state.claudeCalls,0);assert.equal(state.loops,0);assert.equal(fs.readFileSync(path.join(source,'user.txt'),'utf8'),'unchanged');
});
const ledger=(dir:string,name:string,limit:number)=>{const file=path.join(dir,name+'.json');initializeGlobalBudget(file,limit);return {file,limit};};
function worker(code:string,instanceId:string){
  const child=spawn(process.execPath,['--input-type=module','-e',code],{env:{...process.env,PERSONALAGENT_INSTANCE:instanceId},windowsHide:true,stdio:['pipe','pipe','pipe']});
  let out='',err='';const ready=new Promise<void>((resolve,reject)=>{child.stdout!.on('data',c=>{out+=c;if(out.includes('READY'))resolve();});child.once('error',reject);});
  const done=new Promise<string>((resolve,reject)=>{child.stderr!.on('data',c=>err+=c);child.once('error',reject);child.once('close',code=>code===0?resolve(out):reject(Error(err||out)));});
  return {child,ready,done};
}
test('independent MAIN/DEV claims preserve legacy data and reject shared data',()=>{
  const dir=fixture(),old=process.env.PERSONALAGENT_INSTANCE,override=process.env.PERSONAL_AGENT_DESKTOP_DATA;
  try{delete process.env.PERSONAL_AGENT_DESKTOP_DATA;process.env.PERSONALAGENT_INSTANCE='main';assert.equal(instanceData('D:/PersonalAgent'),path.resolve('D:/PersonalAgent/.desktop-data'));
    fs.writeFileSync(path.join(dir,'sessions.json'),'historical');claimInstanceData(dir);assert.equal(fs.readFileSync(path.join(dir,'sessions.json'),'utf8'),'historical');
    process.env.PERSONALAGENT_INSTANCE='dev';assert.equal(instanceData('D:/PersonalAgent'),path.resolve('D:/PersonalAgent-data/instances/dev'));assert.throws(()=>claimInstanceData(dir),/another instance/);
    process.env.PERSONAL_AGENT_DESKTOP_DATA='D:/PersonalAgent/.desktop-data';assert.throws(()=>instanceData('D:/PersonalAgent'),/historical MAIN/);
  }finally{if(old===undefined)delete process.env.PERSONALAGENT_INSTANCE;else process.env.PERSONALAGENT_INSTANCE=old;if(override===undefined)delete process.env.PERSONAL_AGENT_DESKTOP_DATA;else process.env.PERSONAL_AGENT_DESKTOP_DATA=override;}
});
test('shared paid authorization fails closed for missing, corrupt, exhausted and stranded ledgers',()=>{
  const dir=fixture(),file=path.join(dir,'policy.json'),claude=ledger(dir,'claude',1),codex=ledger(dir,'codex',1);
  assert.throws(()=>readSharedBudget(file),/refused/);fs.writeFileSync(file,JSON.stringify({version:1,claude,codex}));
  const state={id:randomUUID(),loops:1,claudeCalls:0,config:{mode:'real'}} as State,store={audit:()=>{}} as unknown as Store;
  reserveSharedCall(state,store,'claude','plan',file);assert.throws(()=>reserveSharedCall(state,store,'claude','review',file),/limit reached/);
  fs.writeFileSync(codex.file,'broken');assert.throws(()=>reserveSharedCall(state,store,'codex','execute',file),/invalid JSON/);assert.equal(fs.readFileSync(codex.file,'utf8'),'broken');
  const busy=ledger(dir,'busy',1);fs.writeFileSync(busy.file+'.lock','stranded');assert.throws(()=>reserveGlobalBudget(busy.file,1,state.id,1,'execute'),/safely paused/);assert.equal(JSON.parse(fs.readFileSync(busy.file,'utf8')).used,0);
});
test('an existing authorized CC global ledger is linked without double charging or clearing prior reservations',()=>{
 const dir=fixture(),file=path.join(dir,'policy.json'),claude=ledger(dir,'claude',3),codex=ledger(dir,'codex',2);
 reserveGlobalBudget(claude.file,3,'old',1,'plan');fs.writeFileSync(file,JSON.stringify({version:1,claude,codex}));
 const state={id:'new',loops:0,claudeCalls:0,config:{mode:'real',globalBudget:claude}} as State;let event='';
 reserveSharedCall(state,{audit:(name:string)=>{event=name;}} as unknown as Store,'claude','plan',file);
 assert.equal(event,'shared-agent-budget-linked');assert.equal(JSON.parse(fs.readFileSync(claude.file,'utf8')).used,1);
 reserveGlobalBudget(claude.file,3,state.id,1,'plan');assert.equal(JSON.parse(fs.readFileSync(claude.file,'utf8')).used,2);
});
test('barrier synchronized MAIN/DEV processes share both CC and Codex caps and preserve history',{timeout:30000},async()=>{
  const dir=fixture(),file=path.join(dir,'policy.json'),claude=ledger(dir,'claude',7),codex=ledger(dir,'codex',5),start=path.join(dir,'start');
  reserveGlobalBudget(claude.file,7,'historical-run',1,'plan');fs.writeFileSync(file,JSON.stringify({version:1,claude,codex}));
  const module=new URL('../src/shared-budget.js',import.meta.url).href;
  const code=`import fs from 'node:fs';import {reserveSharedCall} from ${JSON.stringify(module)};console.log('READY');while(!fs.existsSync(${JSON.stringify(start)}))await new Promise(r=>setTimeout(r,10));let accepted={claude:0,codex:0};for(let i=1;i<=6;i++)for(const agent of ['claude','codex'])try{reserveSharedCall({id:process.env.PERSONALAGENT_INSTANCE+'-'+process.pid,loops:i,claudeCalls:i-1,config:{mode:'real'}},{audit:()=>{}},agent,agent==='claude'?'review':'execute',${JSON.stringify(file)});accepted[agent]++;}catch(error){if(!error.message.includes('limit reached'))throw error;}console.log(JSON.stringify(accepted));`;
  const workers=Array.from({length:6},(_,i)=>worker(code,i%2?'dev':'main'));
  try{await Promise.all(workers.map(w=>w.ready));fs.writeFileSync(start,'go');const outputs=await Promise.all(workers.map(w=>w.done));let cc=0,cx=0;for(const out of outputs){const n=JSON.parse(out.trim().split('\n').at(-1)!);cc+=n.claude;cx+=n.codex;}assert.equal(cc,6);assert.equal(cx,5);
    const history=JSON.parse(fs.readFileSync(claude.file,'utf8'));assert.equal(history.used,7);assert.equal(history.reservations[0].runId,'historical-run');assert.equal(JSON.parse(fs.readFileSync(codex.file,'utf8')).used,5);
  }finally{for(const w of workers)if(w.child.exitCode===null)w.child.kill();}
});
test('cross process same canonical project writes rejected, different projects and reads coexist',{timeout:15000},async()=>{
  const dir=fixture(),a=path.join(dir,'a'),b=path.join(dir,'b');fs.mkdirSync(a);fs.mkdirSync(b);fs.writeFileSync(path.join(a,'old.txt'),'old');
  const module=new URL('../src/project-files.js',import.meta.url).href;
  const holding=worker(`import {lockProject} from ${JSON.stringify(module)};const release=lockProject({id:'main',source:${JSON.stringify(a)},config:{projectMode:'direct'}});console.log('READY');await new Promise(r=>process.stdin.once('data',r));release();process.stdin.destroy();`,'main');
  try{await holding.ready;assert.equal(fs.readFileSync(path.join(a,'old.txt'),'utf8'),'old');assert.throws(()=>lockProject({id:'dev',source:a.toUpperCase(),config:{projectMode:'direct'}} as State),/already running/);const release=lockProject({id:'dev',source:b,config:{projectMode:'direct'}} as State);release();holding.child.stdin!.write('release');await holding.done;const recovered=lockProject({id:'dev',source:a,config:{projectMode:'direct'}} as State);recovered();}
  finally{if(holding.child.exitCode===null)holding.child.kill();}
});
