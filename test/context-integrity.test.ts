import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { regressionFixture } from '../scripts/context-regression-fixtures.js';
import { assemblePrompt } from '../src/prompt-context.js';
import { recordAcceptedTask, taskLedger, ledgerBrief } from '../src/task-ledger.js';
import { CallObservation, codexObservation } from '../src/call-observation.js';
import { CodexLiveProjection } from '../src/codex-live.js';
import { usageReport } from '../src/usage-report.js';
import { classifyFailure } from '../src/failure.js';

const fixture = () => regressionFixture(path.resolve('.validation', 'context-integrity-'+randomUUID()), 'T1');
test('long accepted evidence survives brief clipping; immutable checkpoint preserves original constraints', async () => {
  const f=await fixture(), state=f.store.load();
  state.tasks=[{id:'a',instruction:'长说明'.repeat(12000)+'TAIL',acceptance:['explicit acceptance']}];state.taskIndex=0;state.completedTaskIds=['a'];
  recordAcceptedTask(f.store,state);
  assert.ok(taskLedger(f.store)[0]!.instruction.endsWith('TAIL'));
  assert.ok(Buffer.byteLength(JSON.stringify(ledgerBrief(f.store,state,100)))<=100);
  state.config.contextManagement={promptBudgetTokens:{review:1024}};
  const evidence={log:'日志'.repeat(30000)+'END',passed:false,issues:['MUST FIX']}, payload=JSON.parse(assemblePrompt(state,f.store,'review',{goal:state.goal,task:{id:'current',instruction:'MUST KEEP',acceptance:['must verify']},feedback:'latest correction',evidence}));
  assert.equal(payload.feedback,'latest correction');assert.equal(payload.task.instruction,'MUST KEEP');assert.equal(payload.evidence.externalized,true);
  assert.equal(payload.evidence.verification.passed,false);assert.deepEqual(payload.evidence.verification.issues,['MUST FIX']);
  const full=JSON.parse(fs.readFileSync(payload.evidence.path,'utf8'));
  assert.deepEqual(full,evidence);assert.equal(createHash('sha256').update(JSON.stringify(full)).digest('hex'),payload.evidence.hash);
  const checkpoint=JSON.parse(fs.readFileSync(payload.handoff.checkpoint.path,'utf8'));
  assert.equal(checkpoint.plan[0].instruction,state.tasks[0]!.instruction);
  assert.deepEqual(checkpoint.completedTaskIds,['a']);assert.equal(taskLedger(f.store)[0]!.userAccepted,false);
  state.tasks=[];assert.equal(ledgerBrief(f.store,state)[0]!.id,'a');
});

test('soft budget never truncates current acceptance or long feedback',async()=>{
  const f=await fixture(),state=f.store.load();state.config.contextManagement={promptBudgetTokens:{execute:1024}};
  const feedback='keep '.repeat(10000), prompt=JSON.parse(assemblePrompt(state,f.store,'execute',{goal:state.goal,feedback,task:{acceptance:['no new permission']}}));
  assert.equal(prompt.feedback,feedback);assert.deepEqual(prompt.task.acceptance,['no new permission']);
  const events=fs.readFileSync(f.store.file('audit.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s));
  assert.equal(events.at(-1).data.overBudget,true);
});

test('Codex progress survives interruption, duplicate frames are not added, unknown usage stays null',async()=>{
  const f=await fixture(),state=f.store.load();state.codexThreadId='owned';
  const call=new CallObservation(state,f.store,'execute','{}'), p=new CodexLiveProjection('owned','turn');
  const frame={threadId:'owned',turnId:'turn',tokenUsage:{last:{inputTokens:20,cachedInputTokens:10,outputTokens:3,totalTokens:23},total:{inputTokens:120,cachedInputTokens:60,outputTokens:13}}};
  for(let i=0;i<2;i++)for(const event of p.accept('thread/tokenUsage/updated',frame))call.observe(codexObservation(event));
  const usage=call.finish('interrupted');assert.equal(usage.inputTokens,20);assert.equal(usage.outputTokens,3);assert.equal(usage.completeness,'partial');
  const report=usageReport(f.store.dir);assert.equal(report.tokens.total.input,20);assert.equal(report.context.execution.average,23);
  const blank=new CodexLiveProjection('owned','other');assert.equal(blank.accept('turn/completed',{threadId:'owned',turnId:'other',turn:{id:'other',status:'completed'}})[0].usage,null);
  const failed=p.accept('turn/completed',{threadId:'owned',turnId:'turn',turn:{id:'turn',status:'failed'}})[0];assert.equal(failed.usage.input_tokens,20);
  const noCache=new CodexLiveProjection('owned','no-cache');
  noCache.accept('thread/tokenUsage/updated',{threadId:'owned',turnId:'no-cache',tokenUsage:{last:{inputTokens:5,outputTokens:1},total:{inputTokens:5,outputTokens:1}}});
  assert.equal(noCache.accept('turn/completed',{threadId:'owned',turnId:'no-cache',turn:{id:'no-cache',status:'completed'}})[0].usage.cached_input_tokens,null);
});

test('known input with unknown output remains counted; repeated occupancy snapshots do not bias average',async()=>{
  const f=await fixture(),state=f.store.load(),call=new CallObservation(state,f.store,'plan','{}');
  call.observe({type:'stream_event',event:{type:'message_start',message:{id:'m1',usage:{input_tokens:0}}}});
  call.observe({type:'assistant',message:{id:'m1',usage:{input_tokens:100}}});
  call.observe({type:'stream_event',event:{type:'message_start',message:{id:'m2',usage:{input_tokens:300}}}});
  call.context.window(1000000);call.finish('failed');
  const report=usageReport(f.store.dir);assert.equal(report.tokens.total.input,400);assert.equal(report.coverage.unknownOutput,1);assert.equal(report.context.decision.average,200);
  assert.equal(classifyFailure(Error('Context compaction outcome unknown or failed; timeout'),'execute').kind,'context');
});
