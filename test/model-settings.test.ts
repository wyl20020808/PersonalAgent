import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRun} from '../src/controller.js';
import {discussPlan,assertDiscussionPlan} from '../src/decision-discussion.js';
import {normalizeConfig,configSchema,validate,type Config} from '../src/schema.js';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

test('three distinct decision participants receive all fixed peer drafts, synthesize once and persist seven steps',async()=>{
 const dir=path.resolve('.validation','three-decisions-'+randomUUID()),source=path.join(dir,'source');fs.mkdirSync(source,{recursive:true});
 const config=normalizeConfig(validate<Config>(configSchema,{mode:'mock',allowedRepositories:[source],runtimeDir:path.join(dir,'runtime'),projectMode:'direct',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},claudeExecutable:'never',timeoutMs:1000,tests:[],mockScenario:'pass',decisionDiscussion:{participants:[{id:'a',agent:{backend:'claude-code',reasoningEffort:'high'}},{id:'b',agent:{backend:'codex',model:'local',reasoningEffort:'max'}},{id:'c',agent:{backend:'opencode',opencode:{providerID:'local',modelID:'fixture',variant:'high'}}}],primary:'c',rounds:1}}));
 const store=await createRun(config,source,'Local three-participant protocol fixture'),state=store.load(),calls:string[]=[];
 const plan={humanDecision:null,tasks:[]};
 const result=await discussPlan(state,store,new AbortController().signal,async(id,stage,_schema,exchange:any)=>{
  calls.push(`${stage}:${id}`);if(stage==='draft')assert.equal(exchange,undefined);
  if(stage==='discussion'){assert.equal(Object.keys(exchange.peerDrafts).length,2);assert.ok(!Object.hasOwn(exchange.peerDrafts,id));assert.equal(exchange.opinions,undefined);return{summary:'fixed peer proposals',disagreements:[],amendments:[]};}
  return plan;
 });
 assert.deepEqual(calls,['draft:a','draft:b','draft:c','discussion:a','discussion:b','discussion:c','synthesis:c']);assertDiscussionPlan(state,result);
 assert.equal(store.load().discussion?.steps.length,7);assert.equal(store.load().decisionAgent?.backend,'opencode');
 assert.throws(()=>normalizeConfig({...config,decisionDiscussion:{...config.decisionDiscussion!,primary:'b',participants:[{id:'a',agent:{backend:'codex'}},{id:'c',agent:{backend:'codex'}}]}}),/selected primary/);
});
