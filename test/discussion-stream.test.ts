import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DiscussionStream,partialDiscussionReply,type DiscussionProgress} from '../src/discussion-stream.js';
import {activityRecorder} from '../src/telemetry.js';
import type {State,Store} from '../src/store.js';

test('partial replies decode escapes and never expose plan, raw JSON or nested fake reply fields',()=>{
 assert.equal(partialDiscussionReply('{"reply":"第'), '第');
 assert.equal(partialDiscussionReply('{"reply":"表格\\n\\u4f60\\"好\\'), '表格\n你"好');
 assert.equal(partialDiscussionReply('{"plan":"private","reply":"hello'), 'hello');
 assert.equal(partialDiscussionReply('{"other":{"reply":"fake"},"reply":"real'), 'real');
 assert.equal(partialDiscussionReply('{"plan":"reply: fake"}'),undefined);
 assert.equal(partialDiscussionReply('{"reply":{"internal":1}}'),undefined);
});
test('Claude streams public text and structured reply while excluding thinking and tool arguments',()=>{
 const updates:DiscussionProgress[]=[],stream=new DiscussionStream(p=>updates.push(p));
 const event=(type:string,rest:object)=>stream.claude({type:'stream_event',event:{type,index:0,...rest}});
 event('content_block_start',{content_block:{type:'thinking'}});event('content_block_delta',{delta:{type:'thinking_delta',thinking:'hidden'}});assert.equal(updates.length,0);
 event('content_block_start',{content_block:{type:'tool_use',name:'Read'}});event('content_block_delta',{delta:{type:'input_json_delta',partial_json:'{"file_path":"secret"'}});assert.ok(updates.every(p=>!JSON.stringify(p).includes('secret')));
 event('content_block_start',{content_block:{type:'text'}});event('content_block_delta',{delta:{type:'text_delta',text:'公开'}});assert.equal(updates.at(-1)?.reply,'公开');
 event('content_block_start',{content_block:{type:'tool_use',name:'StructuredOutput'}});event('content_block_delta',{delta:{type:'input_json_delta',partial_json:'{"reply":"答'}});assert.equal(updates.at(-1)?.reply,'答');
 event('content_block_delta',{delta:{type:'input_json_delta',partial_json:'案","plan":"not executable"}'}});assert.equal(updates.at(-1)?.reply,'答案');
 assert.ok(updates.every(p=>!JSON.stringify(p).includes('hidden')&&!JSON.stringify(p).includes('not executable')));
});
test('Codex and OpenCode progress updates replace cumulative snapshots without duplicate text',()=>{
 const updates:DiscussionProgress[]=[],stream=new DiscussionStream(p=>updates.push(p));
 stream.codex({type:'item.updated',item:{id:'a',type:'agent_message',text:'{"reply":"前'}});stream.codex({type:'item.completed',item:{id:'a',type:'agent_message',text:'{"reply":"前后","plan":"p"}'}});assert.equal(updates.at(-1)?.reply,'前后');
 const another=new DiscussionStream(p=>updates.push(p));another.opencode({id:'b',type:'text',text:'你好'});another.opencode({id:'b',type:'text',text:'你好世界'});assert.equal(updates.at(-1)?.reply,'你好世界');
 another.opencode({id:'c',type:'text',text:'{"reply":"答案","plan":"private plan"}'});assert.equal(updates.at(-1)?.reply,'你好世界\n\n答案');assert.ok(!updates.at(-1)?.reply?.includes('private plan'));
});

test('Claude public messages retain separate blocks across native message boundaries',()=>{
 const updates:DiscussionProgress[]=[],stream=new DiscussionStream(p=>updates.push(p));
 for(const text of ['first','second']){stream.claude({type:'stream_event',event:{type:'message_start'}});stream.claude({type:'stream_event',event:{type:'content_block_start',index:0,content_block:{type:'text'}}});stream.claude({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text}}});}
 assert.equal(updates.at(-1)?.reply,'first\n\nsecond');
});

test('public stream snapshots cannot consume proposal tool activity allowance',()=>{
 const events:any[]=[],store={file:()=> 'D:/does-not-exist-discussion-stream-audit',audit:(event:string,data:any)=>events.push({event,data})} as unknown as Store;
 const record=activityRecorder({config:{executionMode:'proposal'},tasks:[],loops:0} as unknown as State,store,'claude','fixture','plan');
 for(let i=0;i<130;i++)record({key:'s'+i,kind:'output',title:'public',text:'hello',streamId:'answer'});
 record({key:'read',kind:'tool',title:'Read',text:'file'});assert.equal(events.at(-1).event,'agent-activity');assert.equal(events.at(-1).data.kind,'tool');
 for(let i=0;i<120;i++)record({key:'t'+i,kind:'tool',title:'Read',text:'file'});
 assert.equal(events.at(-1).event,'agent-activity-limit');
});
