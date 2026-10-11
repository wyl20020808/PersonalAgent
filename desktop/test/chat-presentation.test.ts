import test from 'node:test';
import assert from 'node:assert/strict';
import {activityStatus,toolPresentation,messageLane,publicMessageText,messagePreview} from '../src/chatPresentation.js';
import {groupMessages} from '../src/threadGrouping.js';
import type {ChatMessage} from '../src/types.js';
const command=(text:string)=>({kind:'tool',title:'Codex 执行事件',source:'codex-sdk-runStreamed',text});
test('output words cannot override command exit status',()=>{
 assert.equal(activityStatus(command('npm test\ncompleted · exit_code=0\n0 failed; example exit_code=1')),'success');
 assert.equal(activityStatus(command('npm test\nfailed · exit_code=1\nexit_code=0')),'fail');
 assert.equal(activityStatus(command('npm test\nin_progress · exit_code=pending\nfailed is an output word')),'running');
 assert.equal(activityStatus({kind:'output',text:'previous test failed; now repaired'}),'recorded');
});
test('structured statuses ignore escaped output and preserve actual tool errors',()=>{
 for(const receipt of [{status:'completed',output:'failed'},{is_error:false,content:'failed'}]){
  const source='status' in receipt?'opencode-sdk':'claude-cli-stream-json';
  assert.equal(activityStatus({kind:'tool',source,text:JSON.stringify(receipt)}),'success');
 }
 assert.equal(activityStatus({kind:'tool',source:'opencode-sdk',text:JSON.stringify({receipt:{status:'error',error:'denied'}})}),'fail');
 assert.equal(activityStatus({kind:'tool',source:'opencode-sdk',text:JSON.stringify({receipt:{tool:'bash',status:'completed',metadata:{exit:1},output:'checks failed'}})}),'fail');
 assert.equal(activityStatus({kind:'tool',text:'failed: raw unknown protocol'}),'recorded');
 assert.equal(toolPresentation(command('{truncated')) ,null);
});
test('commands, file operations and truncated records retain evidence',()=>{
 assert.equal(toolPresentation(command('echo first\necho second\ncompleted · exit_code=0\nhello'))?.command,'echo first\necho second');
 const data={kind:'tool',source:'codex-sdk-runStreamed',title:'Codex 文件操作',text:'completed\n[{"path":"src/main.ts","kind":"update"}]'};
 assert.deepEqual(toolPresentation(data)?.paths,['src/main.ts']);
 assert.equal(toolPresentation({...data,text:'completed\n[{"path":42}]'}),null);
 const receipt={tool:'bash',status:'completed',input:{command:'node check.mjs'},output:'PASS'};
 assert.equal(toolPresentation({kind:'tool',source:'opencode-sdk',text:JSON.stringify({receipt})})?.command,'node check.mjs');
});
const message={id:'1',role:'codex',kind:'tool',category:'commands',status:'success',text:'',title:'',time:'',runId:'run',taskId:null,loop:1,source:'',timelineIndex:1} as ChatMessage;
test('OpenCode public output unwraps only known execution envelopes; group preview hides protocol noise',()=>{
 const wrapped={...message,kind:'output',text:JSON.stringify({role:'execution',phase:'execute',receipt:'公开进度'}),details:{protocol:'opencode-sdk'}};
 assert.equal(publicMessageText(wrapped),'公开进度');
 assert.equal(publicMessageText({...wrapped,details:{protocol:'unknown'}}),wrapped.text);
 assert.equal(messagePreview({...message,title:'Codex 执行事件',text:'node test.js\ncompleted · exit_code=0\nPASS',details:{protocol:'codex-sdk-runStreamed'}}),'node test.js');
});
test('role lanes distinguish same provider; users stay centered and Controller stays separate',()=>{
 for(const role of ['codex','opencode','claude'] as const){
  assert.equal(messageLane({...message,role,participantRole:'决策者'}),'decision');
  assert.equal(messageLane({...message,role,participantRole:'执行者'}),'execution');
 }
 assert.equal(messageLane({...message,role:'user'}),'user');
 assert.equal(messageLane({...message,role:'controller'}),'system');
 assert.equal(groupMessages([{...message,participantRole:'决策者'},{...message,id:'2',timelineIndex:2,participantRole:'执行者'}]).length,2);
});
