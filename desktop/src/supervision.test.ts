import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DesktopService,validateRequest} from './test-service.js';
import {createRun,drive} from '../../dist/src/controller.js';
import {MockAgents} from '../../dist/src/adapters.js';
import {atomicJson} from '../../dist/src/store.js';
import {SUPERVISION_INTERVAL_MS} from '../../dist/src/automatic-supervision.js';
import {projectMessages} from './thread.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),data=path.join(root,'.v3c3','as-'+randomUUID().slice(0,8));
async function fixture(){
 const local=new DesktopService(root,path.join(data,randomUUID().slice(0,8)),process.execPath);
 const overview=await local.prepareMock(),profile=overview.profiles[0]!,config={...local.config(profile.id).config,mockScenario:'human' as const};
 const store=await createRun(config,profile.repositories[0]!,'Local supervision integration');await drive(store,new MockAgents(config));
 const session=local.sessions.create({operation:'createSession',projectPath:profile.repositories[0]!,mode:'mock',projectMode:'isolated'}),saved=local.sessions.get(session.id);
 saved.runs=[{id:store.id,profileId:profile.id}];saved.messages=[{id:randomUUID(),time:new Date().toISOString(),text:'fixture user goal',status:'executed',runId:store.id}];local.sessions.update(saved);
 const launches:any[]=[];local.launch=(run,file,decision,_max,_intent,automatic)=>{launches.push({id:run.id,file,decision,automatic});};
 return {local,profile,store,session,launches};
}

test('setting defaults off, persists by instance, and IPC rejects extra authority',async()=>{
 const {local}=await fixture();assert.equal(local.overview().automaticDevelopment?.enabled,false);
 await local.dispatch({operation:'automaticDevelopment',automaticDevelopment:true});assert.equal(new DesktopService(root,local.data,process.execPath).overview().automaticDevelopment?.enabled,true);
 await local.dispatch({operation:'automaticDevelopment',automaticDevelopment:false});assert.equal(local.overview().automaticDevelopment?.enabled,false);
 assert.throws(()=>validateRequest({operation:'automaticDevelopment',automaticDevelopment:true,userAccepted:true}));await local.stopOwned();
});

test('ten minute scan delegates once, remains controller-owned, and retains a durable retry receipt',async()=>{
 const {local,store,launches}=await fixture();await local.dispatch({operation:'automaticDevelopment',automaticDevelopment:true});
 const initial=Date.parse(local.registry().automaticDevelopment!.enabledAt);await local.supervise(initial+SUPERVISION_INTERVAL_MS-1);assert.equal(launches.length,0);
 await local.supervise(initial+SUPERVISION_INTERVAL_MS+100);assert.equal(launches.length,1);assert.equal(launches[0].id,store.id);assert.equal(launches[0].automatic.expectedUpdatedAt,store.load().updatedAt);
 await local.supervise(initial+SUPERVISION_INTERVAL_MS+100);assert.equal(launches.length,1);
 await local.supervise(initial+2*SUPERVISION_INTERVAL_MS+101);await local.supervise(initial+3*SUPERVISION_INTERVAL_MS+102);await local.supervise(initial+4*SUPERVISION_INTERVAL_MS+103);assert.equal(launches.length,3);
 const events=local.audit(store),message=projectMessages(store.load(),events,[]).find(message=>message.title==='后台巡检 · 超时委托');assert.equal(message?.role,'controller');
 assert.equal(events.some(event=>event.event==='human-decision'),false);await local.stopOwned();
});

test('late user reply, disabled mode, live external lock, manual hold and unknown agent result prevent takeover',async()=>{
 const {local,store,session,launches}=await fixture();await local.dispatch({operation:'automaticDevelopment',automaticDevelopment:true});
 const due=Date.now()+SUPERVISION_INTERVAL_MS+100;
 atomicJson(store.file('lock.json'),{pid:process.pid});await local.supervise(due);assert.equal(launches.length,0);fs.unlinkSync(store.file('lock.json'));
 let saved=local.sessions.get(session.id);saved.messages.push({id:randomUUID(),time:new Date(due-1).toISOString(),text:'new input',status:'recorded'});local.sessions.update(saved);await local.supervise(due);assert.equal(launches.length,0);
 saved=local.sessions.get(session.id);saved.messages.at(-1)!.action='hold';local.sessions.update(saved);await local.supervise(due+SUPERVISION_INTERVAL_MS);assert.equal(launches.length,0);
 saved=local.sessions.get(session.id);delete saved.messages.at(-1)!.action;local.sessions.update(saved);store.audit('agent-start',{role:'review'});await local.supervise(due+SUPERVISION_INTERVAL_MS);assert.equal(launches.length,0);
 store.audit('agent-finish',{role:'review'});
 local.validateControllerRuntime=async()=>{await local.dispatch({operation:'automaticDevelopment',automaticDevelopment:false});};await local.supervise(due+SUPERVISION_INTERVAL_MS);assert.equal(launches.length,0);await local.stopOwned();
});

test('state or user activity changing during runtime preflight wins the takeover race',async()=>{
 const {local,store,session,launches}=await fixture();await local.dispatch({operation:'automaticDevelopment',automaticDevelopment:true});
 local.validateControllerRuntime=async()=>{const saved=local.sessions.get(session.id);saved.messages.push({id:randomUUID(),time:new Date().toISOString(),text:'user arrived',status:'recorded'});local.sessions.update(saved);};
 await local.supervise(Date.now()+SUPERVISION_INTERVAL_MS+100);assert.equal(launches.length,0);assert.equal(fs.existsSync(store.file('automatic-supervision.json')),false);await local.stopOwned();
});
