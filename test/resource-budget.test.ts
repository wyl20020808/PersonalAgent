import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {resourceAllocation,codexBudgetNotice} from '../src/resource-budget.js';
import {streamingCodex} from '../src/codex-live.js';
import {codexObservation} from '../src/call-observation.js';

test('advisory allocations reserve review room without increasing remaining user budget',()=>{
 assert.equal(resourceAllocation(null,'execute',2),undefined);
 const a=resourceAllocation(894094,'execute',2)!;
 assert.equal(a.reviewReserveTokens,178819);assert.equal(a.suggestedCallTokens,357637);
 assert.ok(a.suggestedCallTokens*2+a.reviewReserveTokens<=894094);
 assert.equal(resourceAllocation(1000,'plan',0)!.suggestedCallTokens,100);
 assert.equal(resourceAllocation(1000,'review',0)!.suggestedCallTokens,1000);
 assert.equal(resourceAllocation(1,'execute',1)!.suggestedCallTokens,0);
 const notice=codexBudgetNotice(JSON.stringify({resourceBudget:{remainingKnownTokens:894094,allocation:a}}))!;
 assert.equal(notice.afterTokens,286109);assert.match(notice.text,/not new user authorization/);
 assert.match(notice.text,/partial checkpoint/);
 for(const prompt of ['plain text','{}',JSON.stringify({resourceBudget:{remainingKnownTokens:null,allocation:a}}),JSON.stringify({resourceBudget:{remainingKnownTokens:0,allocation:a}})])assert.equal(codexBudgetNotice(prompt),undefined);
});

for(const mode of ['accept','reject','wrong-ack','no-response','ambiguous','foreign','disabled','finished'] as const)test(`live budget reminder ${mode}: one owned advisory, no new turn or tool interruption`,async()=>{
 const root=path.resolve('.validation','budget-rpc-'+randomUUID());fs.mkdirSync(root,{recursive:true});
 fs.writeFileSync(path.join(root,'app-server'),`import fs from 'node:fs';import readline from 'node:readline';
 const mode=${JSON.stringify(mode)},out=e=>console.log(JSON.stringify(e));
 readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);fs.appendFileSync('requests.jsonl',line+'\\n');
 if(r.method==='initialize')out({id:r.id,result:{}});
 if(r.method==='thread/start')out({id:r.id,result:{thread:{id:'owned',cwd:process.cwd()}}});
 if(r.method==='turn/steer'&&mode!=='no-response')out(mode==='reject'?{id:r.id,error:{message:'unsupported'}}:{id:r.id,result:{turnId:mode==='wrong-ack'?'other-turn':'turn'}});
 if(r.method==='turn/start'){
 out({id:r.id,result:{turn:{id:'turn'}}});const p={threadId:'owned',turnId:'turn'};
 out({method:'item/started',params:{...p,item:{id:'tool',type:'commandExecution',command:'test',status:'inProgress'}}});
 for(let i=0;i<3;i++)out({method:'thread/tokenUsage/updated',params:{...p,threadId:mode==='foreign'?'foreign':'owned',tokenUsage:{last:{inputTokens:70,outputTokens:10,cachedInputTokens:60},...(mode==='ambiguous'?{}:{total:{inputTokens:70*(i+1),outputTokens:10*(i+1),cachedInputTokens:60*(i+1)}})}}});
 const finish=()=>{out({method:'item/completed',params:{...p,item:{id:'tool',type:'commandExecution',command:'test',status:'completed',exitCode:0}}});out({method:'turn/completed',params:{...p,turn:{id:'turn',status:'completed'}}});};
 if(mode==='finished')finish();else setTimeout(finish,100);
 }});
 `);
 try{
 const client=streamingCodex({codexPathOverride:process.execPath,...(mode==='disabled'?{}:{budgetNotice:{afterTokens:75,text:'Budget reminder'}})});
 const {events}=await client.startThread({workingDirectory:root,sandboxMode:'read-only'}).runStreamed('fixture',{signal:AbortSignal.timeout(10000)});
 const seen:any[]=[];for await(const event of events)seen.push(event);
 assert.equal(seen.at(-1).type,'turn.completed');
 const requests=fs.readFileSync(path.join(root,'requests.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(requests.filter(r=>r.method==='turn/start').length,1);assert.equal(requests.filter(r=>r.method==='turn/interrupt').length,0);
 const steer=requests.filter(r=>r.method==='turn/steer');const expected=['accept','reject','wrong-ack','no-response'].includes(mode);
 // stdout frames may race the completion notification. expectedTurnId protects the server boundary.
 if(mode==='finished')assert.ok(steer.length<=1);else assert.equal(steer.length,expected?1:0);
 if(expected){assert.equal(steer[0].params.threadId,'owned');assert.equal(steer[0].params.expectedTurnId,'turn');assert.equal(steer[0].params.input[0].text,'Budget reminder');
  const notices=seen.filter(e=>e.type==='context.budget-notice');assert.equal(notices[0].status,'requested');assert.equal(notices[0].observedTokens,80);
  assert.deepEqual(codexObservation(notices[0]),notices[0]);
  if(mode!=='no-response')assert.equal(notices.at(-1).status,mode==='accept'?'accepted':'unavailable');
 }
 assert.ok(seen.some(e=>e.type==='item.completed'&&e.item.id==='tool'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
