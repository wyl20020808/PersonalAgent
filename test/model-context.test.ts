import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ContextObservation, contextLimits, modelContexts ,compactLimit} from '../src/model-context.js';
import { Store, type State } from '../src/store.js';
import { CodexLiveProjection } from '../src/codex-live.js';
import { codexObservation } from '../src/call-observation.js';
import { classifyFailure } from '../src/failure.js';

function fixture() {
  const id=randomUUID(),store=new Store(path.resolve('.validation','model-context'),id);
  const state={id,config:{executionAgent:{backend:'codex',model:'fixture'},decisionAgent:{backend:'claude-code',model:'fixture'}},decisionAgent:{backend:'claude-code',model:'fixture'},claudeSessionId:'decision',codexThreadId:'execution'} as State;
  return {store,state};
}
test('native current-window usage uses last, never cumulative totals or cached input twice',()=>{
  const f=fixture(),c=new ContextObservation(f.state,f.store,'execute','{}'),p=new CodexLiveProjection('thread','turn');
  const [e]=p.accept('thread/tokenUsage/updated',{threadId:'thread',turnId:'turn',tokenUsage:{last:{totalTokens:50,inputTokens:40,cachedInputTokens:30,outputTokens:10},total:{totalTokens:99999},modelContextWindow:1000}});
  c.observe(codexObservation(e));assert.equal(c.snapshot.usedTokens,50);assert.equal(c.snapshot.windowTokens,1000);assert.equal(c.snapshot.compactAtTokens,850);assert.equal(c.snapshot.measurement,'native');
  assert.deepEqual(p.accept('thread/tokenUsage/updated',{threadId:'other',turnId:'turn',tokenUsage:{last:{totalTokens:999}}}),[]);
});
test('resume preserves occupancy, model/session switch clears it; decision and execution stay separate',()=>{
  const f=fixture(),c=new ContextObservation(f.state,f.store,'execute','{}');c.observe({type:'context.usage',usedTokens:860,windowTokens:1000});
  assert.equal(new ContextObservation(f.state,f.store,'execute','{}').shouldCompact,true);
  assert.equal(new ContextObservation(f.state,f.store,'review','{}').snapshot.usedTokens,null);
  f.state.codexThreadId='new';assert.equal(new ContextObservation(f.state,f.store,'execute','{}').snapshot.usedTokens,null);
  f.state.config.executionAgent={backend:'codex',model:'other'};assert.equal(contextLimits(f.state,f.store,'execution').window,null);
});
test('Claude only main request estimates occupancy; resumed modelUsage supplies window, not cumulative tokens',()=>{
  const f=fixture(),c=new ContextObservation(f.state,f.store,'review','{}');
  c.observe({type:'assistant',message:{model:'fixture',usage:{input_tokens:10,cache_read_input_tokens:50,cache_creation_input_tokens:20}}});
  c.observe({type:'assistant',parent_tool_use_id:'child',message:{usage:{input_tokens:999}}});
  c.observe({type:'result',modelUsage:{fixture:{contextWindow:200000,inputTokens:999999,cacheReadInputTokens:888888}}});
  assert.equal(c.snapshot.usedTokens,80);assert.equal(c.snapshot.windowTokens,200000);assert.equal(c.snapshot.measurement,'estimated');
  c.observe({type:'system',subtype:'compact_boundary',uuid:'compact'});c.observe({type:'system',subtype:'compact_boundary',uuid:'compact'});
  assert.equal(c.snapshot.compactions,1);assert.equal(c.snapshot.usedTokens,null);assert.equal(c.snapshot.status,'compacted');
});
test('OpenCode counts last completed assistant with reasoning/cache, never partial stream placeholders',()=>{
  const f=fixture(),c=new ContextObservation(f.state,f.store,'execute','{}');c.window(1000,'provider/model');
  const info={role:'assistant',providerID:'provider',modelID:'model',tokens:{input:10,output:20,reasoning:5,cache:{read:30,write:40}}};
  c.opencode(info);assert.equal(c.snapshot.usedTokens,null);
  c.opencode({...info,time:{completed:123}});assert.equal(c.snapshot.usedTokens,105);assert.equal(c.snapshot.measurement,'estimated');
});
test('unknown window stays unknown; explicit per-model settings and compact ratio validate independently',()=>{
  const f=fixture();// An unknown window still gets the working budget; a known large window is bounded by it.
  assert.deepEqual(contextLimits(f.state,f.store,'execution'),{window:null,compactAt:160000});assert.deepEqual(contextLimits(f.state,f.store,'decision'),{window:null,compactAt:120000});
  assert.equal(compactLimit(1000000,f.state,'decision'),120000);assert.equal(compactLimit(475000,f.state,'execution'),160000);
  assert.equal(compactLimit(1000000,{...f.state,config:{...f.state.config,contextManagement:{budgetTokens:{decision:300000}}}},'decision'),300000);
  f.state.config.contextManagement={compactRatio:.8,modelWindows:{fixture:32000}};
  assert.deepEqual(contextLimits(f.state,f.store,'execution'),{window:32000,compactAt:25600});
  assert.equal(modelContexts([{event:'model-context',data:{role:'execution',usedTokens:10}},{event:'model-context',data:{role:'execution',usedTokens:5}}])[0]!.usedTokens,5);
});
test('context overflow has its own classification and does not blindly replay an executed turn',()=>{
  for(const message of ['context_length_exceeded','maximum context length exceeded','prompt is too long'])assert.deepEqual(classifyFailure(Error(message),'execute'),{kind:'context',stage:'execute',message,recoverable:true});
});
