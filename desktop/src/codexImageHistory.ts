import {createHash} from 'node:crypto';
import path from 'node:path';
import {observeCodexImages} from '../../dist/src/codex-images.js';
import type {PublicActivity} from '../../src/telemetry.js';

/** Read-only projection of public native receipts missing from older Run audits. */
export function codexImageHistory(events:any[],workspace:string,home?:string):any[]{
 const calls=new Map<string,{start:any;thread?:any}>(),windows:any[]=[];
 for(const e of events){
  const d=e.data??{};
  if(e.event==='codex-decision-call-start'&&d.callId&&typeof d.workspace==='string'&&path.resolve(d.workspace)===path.resolve(workspace))calls.set(d.callId,{start:e});
  else if(e.event==='codex-decision-thread'){
   const call=calls.get(d.callId);if(call&&d.runId===call.start.data.runId&&d.workspace===call.start.data.workspace&&d.role===call.start.data.role&&(!call.start.data.threadId||call.start.data.threadId===d.sessionId))call.thread=e;
  }else if(e.event==='codex-decision-exit'){
   const call=calls.get(d.callId);
   if(call?.thread&&d.sessionId===call.thread.data.sessionId&&d.runId===call.start.data.runId&&d.workspace===call.start.data.workspace&&d.role===call.start.data.role&&Date.parse(e.time)>=Date.parse(call.start.time))windows.push({...call,end:e});
   calls.delete(d.callId);
  }
 }
 const existing=new Set(events.filter(e=>e.event==='agent-activity').map(e=>e.data?.scope+':'+e.data?.streamId)),result:any[]=[];
 for(const id of new Set(windows.map(w=>w.thread.data.sessionId))){
  const owned=windows.filter(w=>w.thread.data.sessionId===id),since=Math.min(...owned.map(w=>Date.parse(w.start.time)));
  const reader=observeCodexImages(workspace,()=>id,(activity:PublicActivity,time:string)=>{
   const window=owned.find(w=>Date.parse(time)>=Date.parse(w.start.time)&&Date.parse(time)<=Date.parse(w.end.time));if(!window)return;
   const d=window.start.data,key=d.callId+':'+activity.streamId;if(existing.has(key))return;existing.add(key);
   const hash=createHash('sha256').update(JSON.stringify({origin:'codex-native-log',callHash:window.start.hash,time,activity})).digest('hex');
   const participant=d.participantAgent?{participantId:d.participantId,participantAgent:d.participantAgent,primary:d.primary,discussionStage:d.discussionStage}:{};
   result.push({time,event:'agent-activity',hash,origin:'codex-native-log',data:{...activity,...participant,title:'Codex 查看图片（历史记录）',agent:'codex',phase:d.role,scope:d.callId,source:'codex-sdk-runStreamed'}});
  },home,since);
  reader.finish();
 }
 return result;
}
