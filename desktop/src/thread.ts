import {redact} from '../../dist/src/telemetry.js';
import type {State} from '../../src/store.js';
import type {ChatMessage,Note} from './types.js';

export function projectMessages(state:State,events:any[],notes:Note[]):ChatMessage[]{
 const decisionRole:ChatMessage['role']=(state.decisionAgent??state.config?.decisionAgent)?.backend==='opencode'?'opencode':'claude',decisionName=decisionRole==='opencode'?'OpenCode':'Claude Code';
 const result:ChatMessage[]=[];let taskIndex=0,loop=0;
 for(const [timelineIndex,e] of events.entries()){
   const d=e.data??{};if(Number.isInteger(d.taskIndex))taskIndex=d.taskIndex;if(Number.isInteger(d.loops))loop=d.loops;
   let role:ChatMessage['role']='controller',title=e.event,text='',kind='system',details:ChatMessage['details']=undefined,status='recorded';
   if(e.event==='created'){role='user';title='项目目标';text=d.goal??state.goal;kind='goal';status='executed';}
   else if(e.event==='human-decision'){role='user';title='Controller 已收到人工决策';text=d.decision+'\n\n收到决策不代表已开始执行；请查看后续派单或暂停事件。';kind='decision';status='recorded';}
   else if(e.event==='limits-updated'){title='授权预算已更新';text=`每任务返工上限：${d.maxReworks??'保持不变'}；已有消耗保留。`;kind='system';}
   else if(e.event==='plan'){role=state.discussion?'controller':decisionRole;title=state.discussion?'最终计划 · Controller 校验通过':'任务计划';text=d.humanDecision??`已返回 ${d.tasks?.length??0} 个任务，Controller 将逐项执行并独立验证。`;kind='plan';details={tasks:d.tasks};}
   else if(e.event==='review'){role=decisionRole;title=d.verdict==='human'?'需要你作出决定':d.verdict==='pass'?'审查通过':d.verdict==='rework'?'审查要求返工':'审查终止';text=d.reason;kind='review';status=d.verdict;}
   else if(e.event==='planning-human-decision'){role=decisionRole;title='需要补充目标';text=d.humanDecision;kind='review';status='human';}
   else if(e.event==='discussion-step-start'){title='决策调用开始';text=`${d.discussionStage} · 决策者 ${d.participantId.toUpperCase()} · ${d.mode==='mock'?'本地 Mock':'真实适配器调用'}；输出尚未校验`;kind='dispatch';status='running';}
   else if(e.event==='discussion-step-failed'){title=`决策者 ${d.participantId.toUpperCase()} · ${d.discussionStage} 调用失败`;text=d.error;kind='error';status=d.status;}
   else if(e.event==='discussion-replan-output'){role=d.participantAgent.backend==='opencode'?'opencode':'claude';title='主决策者 Replan · 非双决策讨论';text=d.output.humanDecision??'基于用户新指令重新规划；提案仍须 Controller 校验。';kind='plan';details={tasks:d.output.tasks};}
   else if(e.event==='discussion-output'){role=d.participantAgent.backend==='opencode'?'opencode':'claude';title=({draft:'初步计划',discussion:'讨论意见',synthesis:'主决策者总结 · 最终 Plan 提案'} as Record<string,string>)[d.discussionStage];text=d.mode==='mock'?'本地 Mock 适配器输出，未调用远端模型。':'真实决策调用的结构化输出；最终提案仍须 Controller 校验。';kind='discussion';if(d.output.tasks){details={tasks:d.output.tasks};text+='\n'+(d.output.humanDecision??'');}else text+='\n\n'+d.output.summary+'\n\n分歧：\n'+d.output.disagreements.map((s:string)=>'- '+s).join('\n')+'\n\n修改建议：\n'+d.output.amendments.map((s:string)=>'- '+s).join('\n');}
   else if(e.event==='agent-activity'){role=d.participantAgent?(d.participantAgent.backend==='opencode'?'opencode':'claude'):d.agent==='claude'?decisionRole:d.agent;title=d.title;text=d.text;kind=d.kind;details={protocol:d.source,fullTextHash:d.fullTextHash};status=activityStatus(d);}
   else if(e.event==='agent-start'&&state.discussion&&d.role==='plan'){title='决策周期开始';text='按绑定的参与者配置顺序调用；完成最终 Plan 前不派发执行者。';kind='dispatch';}
   else if(e.event==='agent-start'){role=d.agent==='claude'?decisionRole:d.agent;title=d.agent==='codex'?'Codex 正在执行':decisionName+' 正在执行';text=`阶段：${d.role}`;kind='dispatch';status='running';}
   else if(e.event==='agent-finish'){role=state.discussion&&d.role==='plan'?'controller':d.agent==='claude'?decisionRole:d.agent;title='Agent 实际文件变更';text=`耗时 ${d.durationMs} ms；${d.changed?'有文件修改':'无文件修改'}`;kind='changes';details={diff:redact(d.diff??''),protocol:'Controller Git snapshot'};}
   else if(e.event==='native-result'){role='codex';title='原生开发结果';text=d.summary;kind='output';}
   else if(e.event==='review-modified-workspace'){role='controller';title=decisionName+' 修改后需重新独立验收';text=d.reason;kind='tests';status='pending';}
   else if(e.event==='execution-interrupted'){title='原生执行中断，已有修改已保留';text=d.note;kind='warning';}
   else if(e.event==='claude-call-start'){title=d.role==='plan'?'派发规划任务':'派发审查任务';text=`${decisionName} 调用预约 ${d.call}；会话 ${d.sessionId}`;kind='dispatch';}
   else if(e.event==='codex-thread'){title='Codex 会话已续接';text=d.id;kind='session';}
   else if(e.event==='edits-applied'){role='codex';title='开发结果已由 Controller 应用';text=d.summary;kind='changes';details={paths:d.paths};}
   else if(e.event==='independent-check'){title=d.passed?'独立验收通过':'独立验收未通过';text=d.issues?.length?d.issues.join('\n'):'结果来自 Controller 配置的可信验收程序。';kind='tests';status=d.passed?'pass':'fail';details={tests:d.tests?.map((t:any)=>({...t,stdout:redact(t.stdout).slice(0,16000),stderr:redact(t.stderr).slice(0,6000)})),diff:redact(d.diff??'').slice(0,160000),issues:d.issues};}
   else if(e.event==='transition'){const names:Record<string,string>={planning:'CC 规划中',execute:'准备派单',executing:'Codex 执行中',applying:'受控应用提案',verify:'独立验证中',review:'CC 审查中',paused:'已安全暂停',stopped:'已停止',failed:'运行失败',completed:'开发 Run 已完成'};title=state.config?.mode==='mock'&&d.phase==='completed'?'Mock 演练完成（未完成真实开发目标）':names[d.phase]??d.phase;text=d.reason??'';kind='phase';status=d.phase;}
   else if(e.event==='error'){title='异常已记录';text=d.message;kind='error';status=d.kind;}
   else if(e.event==='codex-exit'||e.event==='claude-exit'){title=e.event==='codex-exit'?'Codex 进程退出':'Claude CLI 进程退出';text=`退出码 ${d.exitCode}${d.stderr?'\n'+d.stderr:''}`;kind='exit';}
   else if(e.event==='review-vetoed'||e.event==='agent-activity-limit'){title=e.event==='review-vetoed'?'Controller 否决审查通过':'活动输出已达展示上限';text=d.reason??d.note;kind='warning';}
   else if(e.event.startsWith('delivery-')){const phases:Record<string,string>={preview:'交付预览已生成 · 等待负责人审批',approved:'具体交付已获批准 · 尚未应用',applying:'正在受控应用',applied:'已批准的交付已应用',invalidated:'交付批准已失效',blocked:'交付应用已停止'};title=phases[d.phase]??'交付状态记录';text=`Delivery ID：${d.deliveryId??'见正式交付页'}${d.digest?'\n\n审批摘要：`'+d.digest+'`':''}${d.reason?'\n\n'+d.reason:''}`;kind='delivery';}
   else continue;
   const visibleText=redact(String(text??''));
   const owner=d.participantId?d:state.discussion&&(['review','planning-human-decision'].includes(e.event)||['agent-start','agent-finish'].includes(e.event)&&d.role==='review')?{participantId:state.discussion.config.primary,participantAgent:state.discussion.participants.find(p=>p.id===state.discussion!.config.primary)!.agent,primary:true}:undefined;
   result.push({...((owner&&role!=='controller')?{participantId:owner.participantId,participantName:(owner.participantAgent.backend==='opencode'?'OpenCode':'Claude Code')+' '+owner.participantId.toUpperCase(),participantRole:owner.primary?'主决策者':'决策者',decisionStage:d.discussionStage}:{}),id:`audit:${e.hash}`,time:e.time,role,title:redact(String(title)),text:visibleText,kind,status,runId:state.id,taskId:d.discussionStage&&d.discussionStage!=='review'?null:d.taskId??state.tasks[taskIndex]?.id??null,loop:d.loop??loop,scope:d.scope,timelineIndex,category:e.event==='agent-activity'?activityCategory(d):undefined,source:`audit.jsonl:${e.hash}`,details:details?JSON.parse(redact(JSON.stringify(details))):undefined});
 }
 for(const note of notes)result.push({id:`note:${note.id}`,time:note.time,role:'user',title:'补充需求 · 已记录，尚未生效',text:note.text,kind:'note',status:'pending',runId:state.id,taskId:note.taskId,loop:note.loop,source:`desktop-note:${note.id}`});
 return [...new Map(result.map(m=>[m.id,m])).values()].sort((a,b)=>a.time.localeCompare(b.time));
}
function activityCategory(data:any):string {
 if(data.kind!=='tool')return data.kind;
 if(/文件|file/i.test(data.title))return 'files';
 if(/执行事件|命令|Shell/.test(data.title))return 'commands';
 // Unstructured legacy tools are grouped only when their exact titles match.
 return 'tool:'+data.title;
}
function activityStatus(data:any):string {
 if(data.kind==='error'||/exit_code=-?[1-9]\d*\b|"is_error":true|"error":(?!null)[{\"]|\bfailed\b/.test(data.text??''))return 'fail';
 if(/exit_code=pending|\bin_progress\b|正在执行/.test(data.text??''))return 'running';
 if(/exit_code=0\b|"status":"completed"/.test(data.text??''))return 'success';
 return 'recorded';
}
export {groupMessages} from './threadGrouping.js';
export function messagePage(messages:ChatMessage[],after?:string){
 const index=after?messages.findIndex(m=>m.id===after):-1;
 const reset=Boolean(after&&index<0),start=index<0?0:index+1;
 const page=messages.slice(start,start+150);
 return {messages:page,cursor:page.at(-1)?.id??after??null,hasMore:start+page.length<messages.length,reset,total:messages.length};
}
