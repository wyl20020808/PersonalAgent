import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activityRecorder,codexPublicEvent,codexStartupNotice} from '../src/telemetry.js';
import {DiscussionStream,partialPublicText} from '../src/discussion-stream.js';
import {OpenCodePublicStream} from '../src/opencode-decision-agent.js';
import type {State,Store} from '../src/store.js';

export const banner='Under-development features enabled: respect_system_proxy. Under-development features are incomplete and may behave unpredictably. To suppress this warning, set `suppress_unstable_features_warning = true` in C:\\Users\\fixture\\.codex\\config.toml.';
test('only the known nonterminal configuration banner is informational',()=>{
 assert.ok(codexStartupNotice(banner));assert.ok(!codexStartupNotice(banner+'\nAuthentication failed'));
 assert.equal(codexPublicEvent({type:'item.completed',item:{id:'warning',type:'error',message:banner}})?.kind,'notice');
 assert.equal(codexPublicEvent({type:'turn.failed',error:{message:banner}})?.kind,'error');
 for(const message of ['Authentication failed','Tool failed','Rate limit exceeded'])assert.equal(codexPublicEvent({type:'item.completed',item:{id:'bad',type:'error',message}})?.kind,'error');
});
test('1000 text deltas over one second yield bounded audit writes and exact owned tail',()=>{
 const rows:any[]=[],state={id:'run',config:{executionMode:'native'},tasks:[{id:'original'}],taskIndex:0,loops:1} as unknown as State;
 const store={file:()=> 'D:/nonexistent-owned-stream-fixture',audit:(event:string,data:any)=>rows.push({event,data})} as unknown as Store;
 let clock=0;const record=activityRecorder(state,store,'codex','call','execute',()=>clock);
 for(let i=0;i<1000;i++){clock=i;record({key:'chunk'+i,streamId:'answer',kind:'output',title:'public',text:'字'.repeat(i+1)});}
 state.tasks=[{id:'other'}] as State['tasks'];state.loops=2;record.flush();
 assert.equal(rows.length,11);assert.equal(rows.at(-1).data.text,'字'.repeat(1000));assert.ok(rows.every(r=>r.data.taskId==='original'&&r.data.loop===1));
 record({key:'duplicate-final',streamId:'answer',kind:'output',title:'public',text:'字'.repeat(1000)});record.flush();assert.equal(rows.length,11);
 record({key:'error',kind:'error',title:'failure',text:'real failure'});assert.equal(rows.at(-1).data.kind,'error');
});
test('discussion parsing is coalesced, separate OpenCode deltas reach drafts, final tail survives interruption',()=>{
 let clock=0;const updates:any[]=[],discussion=new DiscussionStream(p=>updates.push(p),100,()=>clock),native=new OpenCodePublicStream('owned','session');
 const feed=(payload:any)=>{for(const a of native.accept({directory:'owned',payload}))if(a.kind==='output')discussion.text(a.streamId!,a.text);};
 feed({properties:{part:{id:'part',messageID:'message',sessionID:'session',type:'text',text:'{"reply":"'}}});
 for(let i=0;i<1000;i++){clock=i;feed({type:'message.part.delta',properties:{sessionID:'session',messageID:'message',partID:'part',field:'text',delta:'字'}});}
 discussion.flush();assert.equal(updates.at(-1).reply,'字'.repeat(1000));assert.ok(updates.length<=12);
 const before=updates.length;feed({type:'message.part.delta',properties:{sessionID:'other',messageID:'message',partID:'part',field:'text',delta:'foreign'}});discussion.flush();assert.equal(updates.length,before);
 assert.deepEqual(native.accept({directory:'owned',payload:{properties:{part:{id:'synthetic',sessionID:'session',type:'text',synthetic:true,text:'private prompt'}}}}),[]);
});
test('all structured reply schemas expose prose before completion without raw JSON or file contents',()=>{
 for(const field of ['reply','summary','reason','humanDecision'])assert.equal(partialPublicText('{"'+field+'":"公开\\n文'),'公开\n文');
 assert.equal(partialPublicText('{"tasks":[{"id":"one","instruction":"第一步","acceptance":["hidden"]},{"id":"two","instruction":"第二'),'1. 第一步\n\n2. 第二');
 assert.equal(partialPublicText('{"other":{"tasks":[{"instruction":"fake"}]}}'),undefined);
 assert.equal(partialPublicText('{"changes":[{"content":"private file"}]}'),undefined);
});
