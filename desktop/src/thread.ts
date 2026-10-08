import {redact} from '../../dist/src/telemetry.js';
import type {State} from '../../src/store.js';
import type {ChatMessage,Note} from './types.js';

export function projectMessages(state:State,events:any[],notes:Note[]):ChatMessage[]{
 const result:ChatMessage[]=[];let taskIndex=0,loop=0;
 for(const e of events){
   const d=e.data??{};if(Number.isInteger(d.taskIndex))taskIndex=d.taskIndex;if(Number.isInteger(d.loops))loop=d.loops;
   let role:ChatMessage['role']='controller',title=e.event,text='',kind='system',details:ChatMessage['details']=undefined,status='recorded';
   if(e.event==='created'){role='user';title='项目目标';text=d.goal??state.goal;kind='goal';status='executed';}
   else if(e.event==='human-decision'){role='user';title='人工决策已进入 Controller';text=d.decision;kind='decision';status='executed';}
   else if(e.event==='plan'){role='claude';title='任务计划';text=d.humanDecision??`已返回 ${d.tasks?.length??0} 个任务，Controller 将逐项执行并独立验证。`;kind='plan';details={tasks:d.tasks};}
   else if(e.event==='review'){role='claude';title=d.verdict==='human'?'需要你作出决定':d.verdict==='pass'?'审查通过':d.verdict==='rework'?'审查要求返工':'审查终止';text=d.reason;kind='review';status=d.verdict;}
   else if(e.event==='planning-human-decision'){role='claude';title='需要补充目标';text=d.humanDecision;kind='review';status='human';}
   else if(e.event==='agent-activity'){role=d.agent;title=d.title;text=d.text;kind=d.kind;details={protocol:d.source};}
   else if(e.event==='agent-start'){role=d.agent;title=d.agent==='claude'?'Claude 正在执行':'Codex 正在执行';text=`阶段：${d.role}`;kind='dispatch';status='running';}
   else if(e.event==='agent-finish'){role=d.agent;title='Agent 实际文件变更';text=`耗时 ${d.durationMs} ms；${d.changed?'有文件修改':'无文件修改'}`;kind='changes';details={diff:redact(d.diff??''),protocol:'Controller Git snapshot'};}
   else if(e.event==='native-result'){role='codex';title='原生开发结果';text=d.summary;kind='output';}
   else if(e.event==='review-modified-workspace'){role='controller';title='Claude 修改后需重新独立验收';text=d.reason;kind='tests';status='pending';}
   else if(e.event==='execution-interrupted'){title='原生执行中断，已有修改已保留';text=d.note;kind='warning';}
   else if(e.event==='claude-call-start'){title=d.role==='plan'?'派发规划任务':'派发审查任务';text=`Claude Code 调用预约 ${d.call}；会话 ${d.sessionId}`;kind='dispatch';}
   else if(e.event==='codex-thread'){title='Codex 会话已续接';text=d.id;kind='session';}
   else if(e.event==='edits-applied'){role='codex';title='开发结果已由 Controller 应用';text=d.summary;kind='changes';details={paths:d.paths};}
   else if(e.event==='independent-check'){title=d.passed?'独立验收通过':'独立验收未通过';text=d.issues?.length?d.issues.join('\n'):'结果来自 Controller 配置的可信验收程序。';kind='tests';status=d.passed?'pass':'fail';details={tests:d.tests?.map((t:any)=>({...t,stdout:redact(t.stdout).slice(0,16000),stderr:redact(t.stderr).slice(0,6000)})),diff:redact(d.diff??'').slice(0,160000),issues:d.issues};}
   else if(e.event==='transition'){const names:Record<string,string>={planning:'CC 规划中',execute:'准备派单',executing:'Codex 执行中',applying:'受控应用提案',verify:'独立验证中',review:'CC 审查中',paused:'已安全暂停',stopped:'已停止',failed:'运行失败',completed:'开发 Run 已完成'};title=names[d.phase]??d.phase;text=d.reason??'';kind='phase';status=d.phase;}
   else if(e.event==='error'){title='异常已记录';text=d.message;kind='error';status=d.kind;}
   else if(e.event==='codex-exit'||e.event==='claude-exit'){title=e.event==='codex-exit'?'Codex 进程退出':'Claude CLI 进程退出';text=`退出码 ${d.exitCode}${d.stderr?'\n'+d.stderr:''}`;kind='exit';}
   else if(e.event==='review-vetoed'||e.event==='agent-activity-limit'){title=e.event==='review-vetoed'?'Controller 否决审查通过':'活动输出已达展示上限';text=d.reason??d.note;kind='warning';}
   else if(e.event.startsWith('delivery-')){const phases:Record<string,string>={preview:'交付预览已生成 · 等待负责人审批',approved:'具体交付已获批准 · 尚未应用',applying:'正在受控应用',applied:'已批准的交付已应用',invalidated:'交付批准已失效',blocked:'交付应用已停止'};title=phases[d.phase]??'交付状态记录';text=`Delivery ID：${d.deliveryId??'见正式交付页'}${d.digest?'\n\n审批摘要：`'+d.digest+'`':''}${d.reason?'\n\n'+d.reason:''}`;kind='delivery';}
   else continue;
   result.push({id:`audit:${e.hash}`,time:e.time,role,title:redact(String(title)),text:redact(String(text??'')).slice(0,100000),kind,status,runId:state.id,taskId:d.taskId??state.tasks[taskIndex]?.id??null,loop:d.loop??loop,source:`audit.jsonl:${e.hash}`,details:details?JSON.parse(redact(JSON.stringify(details))):undefined});
 }
 for(const note of notes)result.push({id:`note:${note.id}`,time:note.time,role:'user',title:'补充需求 · 已记录，尚未生效',text:note.text,kind:'note',status:'pending',runId:state.id,taskId:note.taskId,loop:note.loop,source:`desktop-note:${note.id}`});
 return [...new Map(result.map(m=>[m.id,m])).values()].sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
}
export function messagePage(messages:ChatMessage[],after?:string){
 const index=after?messages.findIndex(m=>m.id===after):-1;
 const reset=Boolean(after&&index<0),start=index<0?0:index+1;
 const page=messages.slice(start,start+150);
 return {messages:page,cursor:page.at(-1)?.id??after??null,hasMore:start+page.length<messages.length,reset,total:messages.length};
}
