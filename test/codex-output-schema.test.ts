import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codexOutputSchema, restoreOptionalFields, runCodexDecisionTurn } from '../src/codex-decision-turn.js';
import { planSchema, reviewSchema, validate } from '../src/schema.js';
import type { Codex } from '@openai/codex-sdk';

test('Plan and Review transport schemas require every property, nullable optional fields, no uniqueItems; originals unchanged', () => {
  const before = JSON.stringify([planSchema, reviewSchema]);
  function inspect(node: any) {
    if (!node || typeof node !== 'object') return;
    assert.ok(!Object.hasOwn(node, 'uniqueItems'));
    if (node.properties) assert.deepEqual(node.required, Object.keys(node.properties));
    for (const child of Object.values(node)) inspect(child);
  }
  inspect(codexOutputSchema(planSchema)); inspect(codexOutputSchema(reviewSchema));
  const task = codexOutputSchema(planSchema).properties.tasks.items;
  assert.deepEqual(task.properties.dependsOn.anyOf[1], {type:'null'});
  assert.equal(JSON.stringify([planSchema, reviewSchema]), before);
});

test('Nullable wire fields restore absent local options while preserving required humanDecision null and strict duplicate validation', () => {
  const wire = {humanDecision:null,tasks:[{id:'entry',instruction:'Fix entrance',acceptance:['Regression'],dependsOn:null,acceptanceStage:null,moduleIds:null}]};
  const local = restoreOptionalFields(planSchema, wire);
  assert.deepEqual(validate(planSchema, local), {humanDecision:null,tasks:[{id:'entry',instruction:'Fix entrance',acceptance:['Regression']}]});
  assert.equal(wire.tasks[0]!.dependsOn, null);
  assert.deepEqual(validate(planSchema,restoreOptionalFields(planSchema,{humanDecision:null,tasks:[],discussionRounds:null,planUpdate:{patches:[{id:'entry',instruction:'Faster',acceptance:null,dependsOn:null,acceptanceStage:null,moduleIds:null}],remove:null}})),{humanDecision:null,tasks:[],planUpdate:{patches:[{id:'entry',instruction:'Faster'}]}});
  assert.throws(()=>validate(planSchema,{...local,tasks:[{...local.tasks[0],dependsOn:['x','x']}]}),/duplicate items/);
  assert.deepEqual(validate(reviewSchema,restoreOptionalFields(reviewSchema,{verdict:'human',reason:'UE pending',contextReview:null,contextConfirmations:null})),{verdict:'human',reason:'UE pending'});
});

test('SDK transport adapter preserves original schema rejection of duplicate dependencies', async () => {
  const sdk = {startThread:()=>({runStreamed:async (_prompt: string, options: any)=>{
    assert.ok(!JSON.stringify(options.outputSchema).includes('uniqueItems'));
    return {events:(async function*(){
      yield {type:'thread.started',thread_id:'transport-test'};
      yield {type:'item.completed',item:{type:'agent_message',text:JSON.stringify({humanDecision:null,tasks:[{id:'entry',instruction:'Fix',acceptance:['Check'],dependsOn:['x','x'],acceptanceStage:null,moduleIds:null}]})}};
      yield {type:'turn.completed',usage:{input_tokens:1,output_tokens:1,cached_input_tokens:0}};
    })()};
  }})} as unknown as Pick<Codex,'startThread'|'resumeThread'>;
  await assert.rejects(()=>runCodexDecisionTurn(sdk,{workspace:'D:/fixture',threadId:null,prompt:'fixture',schema:planSchema,runId:'fixture',role:'plan'},()=>{}),/duplicate items/);
});
