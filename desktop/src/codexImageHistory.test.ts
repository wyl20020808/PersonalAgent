import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {codexImageHistory} from './codexImageHistory.js';
import {projectMessages} from './thread.js';

test('historical image projection requires bound workspace, Thread and closed call window without changing audit input',()=>{
 const home=path.resolve('.validation','historical-images-'+randomUUID()),workspace=path.join(home,'source'),id=randomUUID(),callId=randomUUID();fs.mkdirSync(path.join(home,'sessions'),{recursive:true});
 const data={workspace,runId:randomUUID(),role:'review',callId,threadId:id};
 const events=[{hash:'start',time:'2026-10-12T08:00:00Z',event:'codex-decision-call-start',data},{hash:'thread',time:'2026-10-12T08:00:01Z',event:'codex-decision-thread',data:{...data,sessionId:id}},{hash:'end',time:'2026-10-12T08:01:00Z',event:'codex-decision-exit',data:{...data,sessionId:id,exitCode:0}}];
 const image=(time:string,thread=id)=>({timestamp:time,type:'event_msg',payload:{type:'item_completed',thread_id:thread,item:{type:'ImageView',id:'image-'+time,path:'file:///D:/proof/view.png'}}});
 const file=path.join(home,'sessions','rollout-'+id+'.jsonl');fs.writeFileSync(file,[{type:'session_meta',payload:{id,cwd:workspace}},image('2026-10-12T07:59:59Z'),image('2026-10-12T08:00:30Z'),image('2026-10-12T08:01:01Z'),image('2026-10-12T08:00:40Z',randomUUID()),{type:'event_msg',payload:{type:'agent_reasoning',text:'PRIVATE_REASONING'}}].map(e=>JSON.stringify(e)).join('\n')+'\n');
 const before=JSON.stringify(events),nativeBefore=fs.readFileSync(file),recovered=codexImageHistory(events,workspace,home);
 assert.equal(recovered.length,1);assert.equal(recovered[0].time,'2026-10-12T08:00:30Z');assert.equal(recovered[0].origin,'codex-native-log');assert.equal(recovered[0].data.phase,'review');assert.deepEqual(codexImageHistory(events,workspace,home),recovered);
 assert.equal(codexImageHistory([...events,recovered[0]],workspace,home).length,0);
 assert.equal(codexImageHistory(events.slice(0,2),workspace,home).length,0);assert.equal(codexImageHistory(events,'D:/wrong',home).length,0);
 assert.equal(codexImageHistory(events.map(e=>e.event==='codex-decision-exit'?{...e,data:{...e.data,sessionId:randomUUID()}}:e),workspace,home).length,0);
 const state:any={id:data.runId,tasks:[],taskIndex:0,config:{decisionAgent:{backend:'codex'}},decisionAgent:{backend:'codex'}};
 const messages=projectMessages(state,recovered,[]);assert.equal(messages[0].status,'success');assert.match(messages[0].source,/^codex-native-log:/);assert.equal(messages[0].participantRole,'决策者');assert.doesNotMatch(JSON.stringify(messages),/PRIVATE_REASONING/);
 assert.equal(JSON.stringify(events),before);assert.ok(fs.readFileSync(file).equals(nativeBefore));
});
