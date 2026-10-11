import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import { createRun } from '../src/controller.js';
import { driveWithUserAcceptance as drive } from './helpers/accepted-flow.js';
import {MockAgents} from '../src/adapters.js';
import {switchDecisionAgent} from '../src/decision-switch.js';
import {assertDecisionState,bindDecisionSession} from '../src/decision-agent.js';
import type {Config} from '../src/schema.js';
import {Store} from '../src/store.js';

async function fixture(extra:Partial<Config>={}){
 const root=path.resolve('.validation','decision-switch',randomUUID()),source=path.join(root,'source');fs.mkdirSync(source,{recursive:true});fs.writeFileSync(path.join(source,'keep.txt'),'已有修改\n');
 const config:Config={mode:'mock',projectMode:'direct',executionMode:'native',allowedRepositories:[source],runtimeDir:path.join(root,'runtime'),claudeExecutable:'NEVER-PAID',timeoutMs:30000,tests:[],directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},decisionAgent:{backend:'claude-code'},mockScenario:'pass',...extra};
 return {store:await createRun(config,source,'本地单决策切换夹具'),source};
}
test('single decision switch archives handoff and preserves Run, files, execution identity, progress and counters',async()=>{
 const {store,source}=await fixture(),state=store.load();state.phase='stopped';state.nextPhase='verify';state.claudeCalls=2;state.loops=1;state.tasks=[{id:'done',instruction:'保留已完成项',acceptance:['已完成']}];state.completedTaskIds=['done'];state.claudeSessionId='old-claude';state.codexThreadId='execution-thread';store.save(state);bindDecisionSession(state,store,'old-claude');
 const updated=switchDecisionAgent(store,{backend:'codex'});
 assert.equal(updated.id,state.id);assert.equal(updated.workspace,state.workspace);assert.deepEqual(updated.tasks,state.tasks);assert.deepEqual(updated.completedTaskIds,['done']);assert.equal(updated.nextPhase,'verify');assert.equal(updated.codexThreadId,'execution-thread');assert.equal(updated.claudeCalls,2);assert.equal(updated.loops,1);assert.equal(updated.decisionSession,undefined);assert.equal(updated.claudeSessionId,null);assert.equal(fs.readFileSync(path.join(source,'keep.txt'),'utf8'),'已有修改\n');
 assert.doesNotThrow(()=>assertDecisionState(updated));
 const audit=fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line)),entry=audit.find(item=>item.event==='decision-agent-switched');assert.ok(entry);
 const handoff=JSON.parse(fs.readFileSync(store.file(entry.data.handoff),'utf8'));assert.equal(handoff.from.session.sessionId,'old-claude');assert.equal(handoff.to.backend,'codex');assert.deepEqual(handoff.completedTaskIds,['done']);assert.match(updated.feedback,/交接记录/);
 assert.equal(new Store(updated.config.runtimeDir,updated.id).load().decisionAgent?.backend,'codex');
});
test('decision identity stays locked outside explicit halted single-agent switch; no-op keeps its Session',async()=>{
 const {store}=await fixture();assert.throws(()=>switchDecisionAgent(store,{backend:'codex'}),/仅暂停/);
 const state=store.load();state.phase='paused';state.claudeSessionId='old';store.save(state);bindDecisionSession(state,store,'old');
 const changed=structuredClone(state);changed.config.decisionAgent={backend:'codex'};changed.decisionAgent={backend:'codex'};assert.throws(()=>store.save(changed),/Immutable Decision/);
 assert.equal(switchDecisionAgent(store,{backend:'claude-code'}).decisionSession?.sessionId,'old');
 assert.throws(()=>switchDecisionAgent(store,{backend:'codex',model:'invalid model'}),/Schema/);
 assert.equal(store.load().decisionAgent?.backend,'claude-code');
});
test('multidecision and unrecoverable Runs reject decision switching without modifying persisted state',async()=>{
 const {store}=await fixture({decisionDiscussion:{participants:[{id:'a',agent:{backend:'claude-code'}},{id:'b',agent:{backend:'codex'}}],primary:'a',rounds:0}}),state=store.load();state.phase='paused';store.save(state);const before=fs.readFileSync(store.file('state.json'),'utf8');assert.throws(()=>switchDecisionAgent(store,{backend:'codex'}),/多决策者/);assert.equal(fs.readFileSync(store.file('state.json'),'utf8'),before);
 const single=await fixture();const failed=single.store.load();failed.phase='failed';failed.failure={kind:'safety',message:'No recovery',recoverable:false,stage:'planning'};single.store.save(failed);assert.throws(()=>switchDecisionAgent(single.store,{backend:'codex'}),/不可自动恢复/);
});
test('halted model change can continue the same Controller Run using a new decision Session',async()=>{
 const {store}=await fixture({tests:[{executable:process.execPath,args:['-e',"const fs=require('fs');if(fs.readFileSync('hello.txt','utf8')!=='hello\\n')process.exit(1);"]}]}),state=store.load();state.phase='paused';state.nextPhase='planning';state.claudeSessionId='old';store.save(state);bindDecisionSession(state,store,'old');
 const updated=switchDecisionAgent(store,{backend:'codex'}),result=await drive(store,new MockAgents(updated.config),'按交接继续');
 assert.equal(result.phase,'completed');assert.equal(result.id,state.id);assert.equal(result.decisionSession?.backend,'codex');assert.notEqual(result.decisionSession?.sessionId,'old');assert.notEqual(result.decisionSession?.sessionId,result.codexThreadId);assert.deepEqual(result.completedTaskIds,['hello','done']);
});
