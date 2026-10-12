import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRun,drive} from '../src/controller.js';
import {MockAgents,type Agents} from '../src/adapters.js';
import type {Config} from '../src/schema.js';
import {atomicJson} from '../src/store.js';
import {supervisionBlock,supervisionDue,supervisionSignature,SUPERVISION_INTERVAL_MS} from '../src/automatic-supervision.js';
import {crashRestartReason,processAlive,recordCrashRestart} from '../src/crash-watchdog.js';

const root=path.resolve('.validation','automatic-supervision-'+randomUUID());fs.mkdirSync(root,{recursive:true});
async function fixture(){
 const folder=path.join(root,randomUUID()),repo=path.join(folder,'repo');fs.mkdirSync(repo,{recursive:true});
 const config:Config={allowedRepositories:[repo],runtimeDir:path.join(folder,'runtime'),projectMode:'direct',directAuthorization:{projectPath:repo,acknowledgedAt:new Date().toISOString()},executionMode:'native',mode:'mock',mockScenario:'human',claudeExecutable:'claude',timeoutMs:10000,tests:[]};
 const store=await createRun(config,repo,'Local deterministic supervision fixture');
 await drive(store,new MockAgents(config));
 return {store,config,folder,repo};
}

test('ten minute grace, user activity, invalid timestamps and persistent three-attempt bound',async()=>{
 const {store}=await fixture(),state=store.load(),base=Date.parse(state.updatedAt),lastUserAt=base;
 assert.equal(supervisionDue(state,base+SUPERVISION_INTERVAL_MS-1,base,lastUserAt),false);
 assert.equal(supervisionDue(state,base+SUPERVISION_INTERVAL_MS,base,lastUserAt),true);
 assert.equal(supervisionDue(state,base+SUPERVISION_INTERVAL_MS,base,base+1),false);
 const receipt={signature:supervisionSignature(state,lastUserAt),attempts:3,lastAttemptAt:base};
 assert.equal(supervisionDue(state,base+2*SUPERVISION_INTERVAL_MS,base,lastUserAt,receipt),false);
 assert.equal(supervisionDue({...state,reason:'The decision maker rephrased the same question'},base+2*SUPERVISION_INTERVAL_MS,base,lastUserAt,receipt),false);
 assert.equal(supervisionDue(state,base+2*SUPERVISION_INTERVAL_MS,base,lastUserAt+1,receipt),true);
 assert.equal(supervisionDue({...state,updatedAt:'bad'},base+2*SUPERVISION_INTERVAL_MS,base,lastUserAt),false);
});

test('automatic review uses original Run and Sessions; decision acceptance never becomes user approval',async()=>{
 const {store,config}=await fixture(),paused=store.load();assert.equal(paused.phase,'paused');
 const first=await drive(store,new MockAgents(config),undefined,undefined,undefined,'resume',{expectedUpdatedAt:paused.updatedAt});
 assert.equal(first.taskIndex,1);assert.equal(first.phase,'paused');
 const result=await drive(store,new MockAgents(config),undefined,undefined,undefined,'resume',{expectedUpdatedAt:first.updatedAt});
 assert.equal(result.phase,'completed');assert.equal(result.id,paused.id);assert.equal(result.claudeSessionId,paused.claudeSessionId);assert.equal(result.codexThreadId,paused.codexThreadId);
 assert.equal(result.evidence?.decisionAccepted,true);assert.notEqual(result.evidence?.userAccepted,true);
 const events=fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
 assert.ok(events.some(event=>event.event==='automatic-decision'));assert.equal(events.some(event=>event.event==='human-decision'),false);
});

test('automatic crash recovery consumes durable native result without another execution or bypassing loop limit',async()=>{
 const {store,config}=await fixture(),state=store.load();state.tasks=state.tasks.slice(0,1);state.phase='executing';state.nextPhase='execute';state.evidence=null;state.executorExitCode=-1;state.config.maxLoops=state.loops;store.save(state);
 const mock=new MockAgents({...config,maxLoops:state.loops});
 const agents:Agents={executionMode:'native',plan:async()=>{throw Error('Must not replan a durable result');},execute:async()=>{throw Error('Must not replay execution');},review:(current,local)=>mock.review(current,local)};
 const result=await drive(store,agents,undefined,undefined,undefined,'resume',{expectedUpdatedAt:state.updatedAt});
 assert.equal(result.phase,'completed');assert.equal(result.loops,state.loops);assert.equal(result.evidence?.decisionAccepted,true);assert.notEqual(result.evidence?.userAccepted,true);
});

test('automatic recovery replans remaining work with the decision maker and retains accepted IDs',async()=>{
 const {store,config}=await fixture();
 await drive(store,new MockAgents(config),'Fixture continuation');
 const state=store.load();state.phase='paused';state.nextPhase='execute';state.taskIndex=1;state.completedTaskIds=['hello'];state.reason='Recoverable executor interruption';state.failure={kind:'transport',recoverable:true,message:state.reason,stage:'execute'};store.save(state);
 const mock=new MockAgents(config),executed:string[]=[];
 const agents:Agents={executionMode:'native',plan:async(current)=>{
  assert.equal(current.automaticPlanning?.reason,state.reason);assert.deepEqual(current.completedTaskIds,['hello']);return {tasks:current.tasks.slice(1),humanDecision:null};
 },execute:async(current,local,signal)=>{executed.push(current.tasks[current.taskIndex]!.id);return mock.execute(current,local,signal);},review:(current,local)=>mock.review(current,local)};
 const result=await drive(store,agents,undefined,undefined,undefined,'resume',{expectedUpdatedAt:state.updatedAt});
 assert.equal(result.phase,'completed');assert.deepEqual(result.completedTaskIds,['hello','done']);assert.deepEqual(executed,['done']);assert.equal(result.automaticPlanning,undefined);
});

test('stale state, stops, nonrecoverable and unknown tool work cannot auto-resume',async()=>{
 const {store,config}=await fixture(),state=store.load();
 await assert.rejects(drive(store,new MockAgents(config),undefined,undefined,undefined,'resume',{expectedUpdatedAt:'stale'}),/state changed/);
 for(const kind of ['interrupted','authentication','budget','safety','unknown'] as const)assert.ok(supervisionBlock({...state,failure:{kind,recoverable:true,message:'fixture',stage:'execute'}}));
 assert.ok(supervisionBlock({...state,phase:'stopped'}));assert.ok(supervisionBlock({...state,phase:'executing',nativeExecution:true}));
 assert.equal(supervisionBlock({...state,phase:'executing',nativeExecution:true},true),undefined);
 fs.writeFileSync(store.file('stop.request'),'stop');
 await assert.rejects(drive(store,new MockAgents(config),undefined,undefined,undefined,'resume',{expectedUpdatedAt:state.updatedAt}),/human action/);
});

function crashFixture(){
 const data=path.join(root,randomUUID()),runtime=path.join(data,'runtime'),id=randomUUID();fs.mkdirSync(path.join(runtime,'runs',id),{recursive:true});
 const configFile=path.join(data,'config.json'),bytes=Buffer.from(JSON.stringify({runtimeDir:runtime}));fs.writeFileSync(configFile,bytes);
 atomicJson(path.join(data,'profiles.json'),{automaticDevelopment:{enabled:true},profiles:[{file:configFile,hash:createHash('sha256').update(bytes).digest('hex'),readOnly:false}]});
 atomicJson(path.join(data,'instance.json'),{version:1,instanceId:process.env.PERSONALAGENT_INSTANCE??'main'});
 atomicJson(path.join(runtime,'runs',id,'state.json'),{id,phase:'executing',config:{runtimeDir:runtime}});
 return {data,runtime,id,owner:{pid:1,quitRequested:false,time:new Date().toISOString()}};
}

test('crash watchdog requires enabled mode and active trusted local work; normal exits and crash loops stop',()=>{
 const {data,runtime,id,owner}=crashFixture(),now=Date.now();
 assert.equal(crashRestartReason(data,owner,[],now),undefined);
 assert.match(crashRestartReason(data,{...owner,quitRequested:true},[],now)!,/正常退出/);
 assert.match(crashRestartReason(data,owner,[now,now,now],now)!,/三次/);
 fs.writeFileSync(path.join(runtime,'runs',id,'stop.request'),'stop');assert.match(crashRestartReason(data,owner,[],now)!,/没有运行/);
 const registry=JSON.parse(fs.readFileSync(path.join(data,'profiles.json'),'utf8'));registry.automaticDevelopment.enabled=false;atomicJson(path.join(data,'profiles.json'),registry);assert.match(crashRestartReason(data,owner,[],now)!,/关闭/);
 recordCrashRestart(data,now);recordCrashRestart(data,now+1);recordCrashRestart(data,now+2);assert.throws(()=>recordCrashRestart(data,now+3),/limit/);
});

test('external watchdog survives its owner exiting and launches one fake application in the same data directory',async()=>{
 const {data,owner}=crashFixture(),application=path.join(data,'application');fs.mkdirSync(path.join(application,'desktop','out'),{recursive:true});
 fs.writeFileSync(path.join(application,'desktop','out','main.js'),'// Fixture only');
 atomicJson(path.join(application,'desktop','package.json'),{type:'commonjs',main:'index.js'});
 const marker=path.join(data,'fake-restart.txt');
 fs.writeFileSync(path.join(application,'desktop','index.js'),`require('node:fs').writeFileSync(${JSON.stringify(marker)},process.env.PERSONAL_AGENT_DESKTOP_DATA);`);
 const parent=spawn(process.execPath,['-e','process.exit(0)'],{windowsHide:true});await new Promise<void>((resolve,reject)=>{parent.once('error',reject);parent.once('close',()=>resolve());});
 assert.equal(processAlive(parent.pid!),false);
 const file=path.join(data,'supervision-owner-'+randomUUID()+'.json');atomicJson(file,{...owner,pid:parent.pid});
 const script=fileURLToPath(new URL('../scripts/supervision-watchdog.js',import.meta.url));
 const child=spawn(process.execPath,[script,'--root',application,'--data',data,'--electron',process.execPath,'--owner',file],{env:{...process.env,PERSONAL_AGENT_DESKTOP_DATA:data},windowsHide:true});let stderr='';child.stderr.on('data',bytes=>stderr+=bytes);
 const exit=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(exit,0,stderr);
 for(let attempt=0;attempt<100&&!fs.existsSync(marker);attempt++)await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(fs.readFileSync(marker,'utf8'),data);assert.equal(JSON.parse(fs.readFileSync(path.join(data,'supervision-restarts.json'),'utf8')).length,1);
});
