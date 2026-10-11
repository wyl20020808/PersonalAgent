import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupMessages} from './threadGrouping.js';
import type {ChatMessage} from './types.js';

const message=(index:number,extra:Partial<ChatMessage>={}):ChatMessage=>({id:String(index),timelineIndex:index,time:'2026-10-11T10:00:00Z',role:'codex',participantRole:'执行者',decisionStage:'execute',title:'Codex 执行事件',text:'command',kind:'tool',category:'commands',status:'success',runId:'run',taskId:'task',loop:1,scope:'execute:1',source:'audit',...extra});

test('compact execution combines alternating tools, preserves public replies as boundaries',()=>{
 const raw=[message(0),message(1,{category:'files'}),message(2,{kind:'output',category:'output',text:'修改完成'}),message(3),message(4)];
 const groups=groupMessages(raw,true);
 assert.deepEqual(groups.map(g=>g.messages.length),[2,1,2]);
 assert.equal(groups[0].category,'执行操作');
 assert.deepEqual(groups.flatMap(g=>g.messages),raw);
 assert.equal(groupMessages([message(0)],true)[0].category,'执行操作');
});
test('consecutive public outputs and summaries remain separate',()=>{
 for(const kind of ['output','summary'])assert.equal(groupMessages([message(0,{kind,category:kind}),message(1,{kind,category:kind})],true).length,2);
});
test('compact skips blank execution records but keeps failures, active work and evidence',()=>{
 const blank=message(1,{kind:'output',text:' \n'}),raw=[message(0),blank,message(2)];
 assert.deepEqual(groupMessages(raw,true).flatMap(g=>g.messages).map(m=>m.id),['0','2']);
 assert.equal(groupMessages(raw,true).length,1);
 assert.deepEqual(groupMessages(raw).flatMap(g=>g.messages),raw);
 assert.equal(groupMessages([message(0,{kind:'output',text:JSON.stringify({role:'execution',phase:'execute',receipt:''}),details:{protocol:'opencode-sdk'}})],true).length,0);
 for(const extra of [{status:'fail'},{status:'running'},{details:{paths:['a.ts']}},{details:{diff:'NEW FILE a.ts'}},{attachments:[{name:'a.txt',mimeType:'text/plain',size:1,content:'a'}]}])assert.equal(groupMessages([message(0,{kind:'output',text:'',...extra})],true).length,1);
});
test('compact keeps lifecycle and ownership boundaries while failures stay explicit in the summary',()=>{
 for(const extra of [{kind:'error'}, {kind:'stage'}, {kind:'session'}, {role:'controller' as const}, {participantId:'b'}, {runId:'other'}, {taskId:'other'}, {loop:2}, {scope:'execute:2'}])assert.equal(groupMessages([message(0),message(1,extra)],true).length,2);
 const failed=groupMessages([message(0),message(1,{status:'fail'}),message(2)],true);
 assert.equal(failed.length,1);assert.equal(failed[0].status,'fail');assert.equal(failed[0].messages.length,3);
 assert.equal(groupMessages([message(0,{role:'claude',participantRole:'决策者',decisionStage:'plan'}),message(1,{role:'claude',participantRole:'决策者',decisionStage:'plan',category:'files'})],true).length,1);
});
test('decision tools use the same compact groups and public-response boundaries as execution tools',()=>{
 const raw=[message(0,{role:'claude',participantRole:'决策者',decisionStage:'discussion'}),message(1,{role:'claude',participantRole:'决策者',decisionStage:'discussion',category:'files'}),message(2,{role:'claude',participantRole:'决策者',decisionStage:'discussion',kind:'output',category:'output',text:'公开回复'})];
 const groups=groupMessages(raw,true);assert.deepEqual(groups.map(group=>group.messages.length),[2,1]);assert.equal(groups[0].category,'执行操作');
 const receiving=message(3,{role:'claude',kind:'receiving',text:'已收到 100 个字符'});assert.equal(groupMessages([receiving],true).length,0);assert.equal(groupMessages([receiving],false).length,1);
 const metadata=message(4,{role:'claude',kind:'session',details:{protocol:'claude-cli-stream-json'}});assert.equal(groupMessages([metadata],true).length,0);assert.equal(groupMessages([metadata],false).length,1);
 const failed=message(5,{role:'claude',kind:'stage',status:'fail',details:{protocol:'claude-cli-stream-json'}});assert.equal(groupMessages([failed],true).length,1);
});
test('audit gaps no longer fragment an execution burst; public output starts a new stable group',()=>{
 const raw=[message(0,{timelineIndex:10,status:'running'}),message(1,{timelineIndex:12}),message(2,{timelineIndex:20,category:'files'}),message(3,{timelineIndex:21,kind:'output',category:'output',text:'公开回复'}),message(4,{timelineIndex:30})];
 assert.deepEqual(groupMessages(raw,true).map(g=>g.messages.length),[3,1,1]);
 assert.equal(groupMessages(raw,true)[0].status,'success');
 assert.equal(groupMessages(raw,false).length,5);
 const first=groupMessages(raw.slice(0,2),true)[0],appended=groupMessages(raw.slice(0,3),true)[0];
 assert.equal(first.id,appended.id);assert.equal(first.messages.length,2);assert.equal(appended.messages.length,3);
 assert.deepEqual(appended.messages,raw.slice(0,3));
});
