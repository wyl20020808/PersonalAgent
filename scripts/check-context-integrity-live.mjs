// Real Codex adapter smoke test, entirely inside an isolated regression workspace.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {regressionFixture} from '../dist/scripts/context-regression-fixtures.js';
import {streamingCodex} from '../dist/src/codex-live.js';
import {CallObservation,codexObservation} from '../dist/src/call-observation.js';
import {assemblePrompt} from '../dist/src/prompt-context.js';
import {usageReport} from '../dist/src/usage-report.js';
const root=path.resolve('.validation','context-live-'+randomUUID());
const f=await regressionFixture(root,'T1'),state=f.store.load();
state.config.mode='real';state.config.executionAgent={backend:'codex'};
state.tasks=[{id:'smoke',instruction:'Read marker.txt and report the marker; never change files.',acceptance:['Marker is preserved after same-Thread compaction.']}];state.taskIndex=0;
const marker='CHECKPOINT_'+randomUUID();fs.writeFileSync(path.join(state.workspace,'marker.txt'),marker);
const results=[];
for(let index=0;index<2;index++){
 const prompt=assemblePrompt(state,f.store,'execute',{goal:'Read-only context integrity smoke check',task:state.tasks[0],action:'Use the shell once to read marker.txt. Return the exact marker. No other file reads or writes.'});
 const call=new CallObservation(state,f.store,'execute',prompt), client=streamingCodex({compactBeforeTurn:index===1});
 const options={workingDirectory:state.workspace,sandboxMode:'read-only',approvalPolicy:'never',networkAccessEnabled:false,webSearchMode:'disabled'};
 const session=state.codexThreadId?client.resumeThread(state.codexThreadId,options):client.startThread(options);
 const {events}=await session.runStreamed(prompt,{signal:AbortSignal.timeout(150000)});
 const seen=[];let ok=false,answer='',commands=0;
 try{for await(const e of events){
   if(e.type==='thread.started')state.codexThreadId=e.thread_id;
   const observed=codexObservation(e);if(observed)call.observe(observed);
   if(e.type.startsWith('context.')||e.type==='turn.completed')seen.push(e);
   if(e.type==='item.completed'&&e.item.type==='command_execution')commands++;
   if(e.type==='item.completed'&&e.item.type==='agent_message')answer=e.item.text;
   if(e.type==='turn.failed')throw Error(e.error.message);
   if(e.type==='turn.completed')ok=true;
 }}finally{call.finish(ok?'success':'failed');}
 if(!ok||!answer.includes(marker)||commands<1)throw Error('Real tool/answer validation failed');
 results.push({index,thread:state.codexThreadId,commands,usage:call.usage,events:seen});
 console.log(JSON.stringify({index,thread:state.codexThreadId,commands,input:call.usage.inputTokens,output:call.usage.outputTokens,compactions:call.context.snapshot.compactions}));
}
if(results[0].thread!==results[1].thread||!results[1].events.some(e=>e.type==='context.compaction'&&e.status==='compacted'))throw Error('Same-Thread compaction not confirmed');
fs.writeFileSync(path.join(root,'result.json'),JSON.stringify({results,report:usageReport(f.store.dir)},null,2));
console.log(JSON.stringify({root,runDirectory:f.store.dir,status:'PASS',boundary:'Native Codex smoke only; no cost reduction claim or Controller long-run acceptance.'}));
