import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DesktopService} from '../../desktop/out/service.js';
const root=path.resolve(import.meta.dirname,'../..'),folder=path.join(root,'.validation','real-decision-switch',Date.now().toString()),project=path.join(folder,'project');
fs.mkdirSync(project,{recursive:true});const token=randomUUID();fs.writeFileSync(path.join(project,'marker.txt'),token);
const service=new DesktopService(root,path.join(folder,'data'),process.execPath);
let ref,store;
const wait=async()=>{const until=Date.now()+240000;while(Date.now()<until){if(!service.children.has(ref.id)){const state=store.load();console.log(JSON.stringify({phase:state.phase,reason:state.reason,backend:state.decisionAgent?.backend}));return state;}await new Promise(r=>setTimeout(r,1000));}await service.dispatch({operation:'stop',profileId:ref.profileId,runId:ref.id});throw Error('Real call timed out; official stop requested');};
try{
 const session=await service.dispatch({operation:'createSession',projectPath:project,mode:'real',projectMode:'direct',decisionAgent:{backend:'claude-code'}});
 const started=await service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),directAcknowledged:true,realAcknowledged:true,text:'This is a decision handoff capability test. Only read marker.txt with a native tool. Do not edit files or schedule execution. Return a Plan with tasks: [] and humanDecision: CLAUDE_READY:<exact marker contents>. Human approval is required before any further work. Keep output brief.'});
 ref=started.runs[0];store=service.store(ref.profileId,ref.id);console.log(JSON.stringify({folder,runId:ref.id}));const before=await wait();
 assert.equal(before.phase,'paused');assert.ok(before.reason.includes('CLAUDE_READY:'+token));assert.ok(before.claudeSessionId);
 await service.dispatch({operation:'resume',profileId:ref.profileId,runId:ref.id,intent:'resume',decisionAgent:{backend:'codex'},decision:'Approved only the decision identity switch test. Read the decision-handoff JSON referenced in feedback and marker.txt with native tools. Do not edit files or schedule execution. Return a Plan with tasks: [] and humanDecision: CODEX_HANDOFF_OK:<exact marker contents>. Human approval is required before any further work. Keep output brief.'});
 const after=await wait();assert.equal(after.phase,'paused');assert.ok(after.reason.includes('CODEX_HANDOFF_OK:'+token));assert.equal(after.decisionAgent.backend,'codex');assert.ok(after.decisionSession?.sessionId);assert.equal(after.id,before.id);assert.equal(after.workspace,before.workspace);assert.equal(after.claudeSessionId,null);assert.equal(fs.readFileSync(path.join(project,'marker.txt'),'utf8'),token);
 const audit=service.audit(store),sw=audit.find(e=>e.event==='decision-agent-switched');assert.ok(sw);assert.equal(sw.data.from.claudeSessionId,before.claudeSessionId);assert.ok(audit.filter(e=>e.event==='planning-human-decision').length===2);
 const result={passed:true,folder,runId:ref.id,oldSession:before.claudeSessionId,newSession:after.decisionSession,claudeCalls:after.claudeCalls,usage:service.detail(ref.profileId,ref.id).run.usage,events:audit.map(e=>({event:e.event,data:e.data}))};fs.writeFileSync(path.join(import.meta.dirname,'real-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,events:undefined}));
}catch(error){fs.writeFileSync(path.join(import.meta.dirname,'real-result.json'),JSON.stringify({passed:false,folder,runId:ref?.id,error:String(error)},null,2));console.error(String(error));process.exitCode=1;}
