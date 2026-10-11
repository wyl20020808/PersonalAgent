import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {conversationDiscussion} from '../src/conversation-discussion.js';
import {assertDecisionRequest, type DecisionAgent, type DecisionRequest} from '../src/decision-agent.js';
import {Store} from '../src/store.js';
import {drive} from '../src/controller.js';
import {MockAgents} from '../src/adapters.js';
import type {Config} from '../src/schema.js';

test('discussion owns persistent Decision state, requires read-only tools and cannot enter drive',async()=>{
 const folder=path.resolve('test-projects','discussion-'+randomUUID()),project=path.join(folder,'project'),runtimeDir=path.join(folder,'runtime');fs.mkdirSync(project,{recursive:true});fs.writeFileSync(path.join(project,'user.txt'),'protected');
 const config:Config={allowedRepositories:[project],runtimeDir,mode:'real',projectMode:'direct',claudeExecutable:'unused',timeoutMs:0,mockScenario:'pass',tests:[],decisionAgent:{backend:'claude-code'}};
 let stateId='',calls=0;
 const adapter:DecisionAgent={async structured<T>(request:DecisionRequest){
  calls++;assert.equal(request.readOnly,true);assert.equal(request.state.purpose,'conversation-discussion');assert.deepEqual(request.state.tasks,[]);assert.equal(request.state.loops,0);assertDecisionRequest(request);assert.throws(()=>assertDecisionRequest({...request,readOnly:false}),/read-only/);
  const prompt=JSON.parse(request.prompt);assert.equal(prompt.previousPlan,calls===1?'':'First plan');assert.equal(prompt.history.length,calls===1?0:2);
  return {output:{reply:'Discussed',plan:'First plan'} as T,sessionId:'fixture',usage:{} as any};
 }};
 const first=await conversationDiscussion({runtimeDir,projectPath:project,sessionId:'fixture',config,text:'First question',history:[],plan:''},id=>stateId=id,new AbortController().signal,adapter);
 assert.equal(first.plan,'First plan');
 await conversationDiscussion({runtimeDir,projectPath:project,sessionId:'fixture',config,stateId,text:'Next question',history:[{role:'user',text:'First question'},{role:'assistant',text:first.reply}],plan:first.plan},()=>assert.fail('state recreated'),new AbortController().signal,adapter);
 assert.equal(calls,2);assert.equal(fs.readFileSync(path.join(project,'user.txt'),'utf8'),'protected');
 const store=new Store(runtimeDir,stateId);await assert.rejects(drive(store,new MockAgents(config)),/讨论 Session/);assert.equal(store.load().loops,0);
});
