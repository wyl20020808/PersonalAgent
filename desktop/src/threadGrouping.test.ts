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
 assert.equal(groupMessages(raw,true).length,2);
 assert.deepEqual(groupMessages(raw).flatMap(g=>g.messages),raw);
 assert.equal(groupMessages([message(0,{kind:'output',text:JSON.stringify({role:'execution',phase:'execute',receipt:''}),details:{protocol:'opencode-sdk'}})],true).length,0);
 for(const extra of [{status:'fail'},{status:'running'},{details:{paths:['a.ts']}},{details:{diff:'NEW FILE a.ts'}},{attachments:[{name:'a.txt',mimeType:'text/plain',size:1,content:'a'}]}])assert.equal(groupMessages([message(0,{kind:'output',text:'',...extra})],true).length,1);
});
test('compact keeps failures, lifecycle and ownership boundaries visible',()=>{
 for(const extra of [{status:'fail'}, {kind:'error'}, {kind:'stage'}, {kind:'session'}, {role:'controller' as const}, {participantId:'b'}, {runId:'other'}, {taskId:'other'}, {loop:2}, {scope:'execute:2'}, {timelineIndex:3}])assert.equal(groupMessages([message(0),message(1,extra)],true).length,2);
 assert.notEqual(groupMessages([message(0,{status:'fail'})],true)[0].category,'执行操作');
 assert.equal(groupMessages([message(0,{role:'claude',participantRole:'决策者',decisionStage:'plan'}),message(1,{role:'claude',participantRole:'决策者',decisionStage:'plan',category:'files'})],true).length,2);
});
