import {activityStatus,toolPresentation} from './chatPresentation.js';
import {redact} from '../../dist/src/telemetry.js';
import type {State} from '../../src/store.js';
import type {ChatMessage,Note} from './types.js';

export function projectMessages(state:State,events:any[],notes:Note[]):ChatMessage[]{
 const decisionRole:ChatMessage['role']=(state.decisionAgent??state.config?.decisionAgent)?.backend==='codex'?'codex':(state.decisionAgent??state.config?.decisionAgent)?.backend==='opencode'?'opencode':'claude',decisionName=decisionRole==='codex'?'Codex':decisionRole==='opencode'?'OpenCode':'Claude Code';
 const executionRole=state.config?.executionAgent?.backend==='claude-code'?'claude':state.config?.executionAgent?.backend==='opencode'?'opencode':'codex',executionName=executionRole==='claude'?'Claude Code':executionRole==='opencode'?'OpenCode':'Codex';
 const result:ChatMessage[]=[];const streams=new Map<string,number>();let taskIndex=0,loop=0;
 const imageCalls=new Map<string,{input:unknown;title:string;paths:string[]}>();
 for(const [timelineIndex,e] of events.entries()){
   const d={...(e.data??{})};if(Number.isInteger(d.taskIndex))taskIndex=d.taskIndex;if(Number.isInteger(d.loops))loop=d.loops;
   let imagePaths:string[]|undefined;
   if(e.event==='agent-activity'&&d.source==='claude-cli-stream-json')try{
    const receipt=JSON.parse(d.text),view=toolPresentation(d);
    if(typeof receipt.id==='string'&&view?.images?.length){imageCalls.set(d.scope+':'+receipt.id,{input:receipt.input,title:d.title,paths:view.images});d.streamId='image:'+receipt.id;imagePaths=view.images;}
    const call=typeof receipt.tool_use_id==='string'?imageCalls.get(d.scope+':'+receipt.tool_use_id):undefined;
    if(call&&typeof receipt.is_error==='boolean'){d.title=call.title;d.text=JSON.stringify({...receipt,input:call.input});d.streamId='image:'+receipt.tool_use_id;imagePaths=call.paths;}
   }catch{/* Unknown receipts retain their public raw event. */}
   let role:ChatMessage['role']='controller',title=e.event,text='',kind='system',details:ChatMessage['details']=undefined,status='recorded';
   if(e.event==='created'){role='user';title='项目目标';text=d.goal??state.goal;kind='goal';status='executed';}
   else if(e.event==='automatic-decision'){title='全自动模式 · 决策者接管';text=d.decision;kind='decision';status='delegated';}
   else if(e.event==='automatic-supervision-dispatch'){title='后台巡检 · 超时委托';text='用户等待超过十分钟，已请求当前决策者判断。第 '+d.attempts+' 次接管；接管不代表恢复或验收已通过。';kind='decision';status='delegated';}
   else if(e.event==='automatic-supervision-error'){title='后台巡检失败';text=d.message;kind='error';status='failed';}
   else if(e.event==='human-decision'){role='user';title='Controller 已收到人工决策';text=d.decision+'\n\n收到决策不代表已开始执行；请查看后续派单或暂停事件。';kind='decision';status='recorded';}
   else if(e.event==='limits-updated'){title='授权预算已更新';text=`每任务返工上限：${d.maxReworks??'保持不变'}；已有消耗保留。${d.timeoutMs===undefined?'':d.timeoutMs===0?'运行时间：不限时。':`运行时间：${d.timeoutMs} 毫秒。`}`;kind='system';}
   else if(e.event==='plan'){role=state.discussion?'controller':decisionRole;title=state.discussion?'最终计划 · Controller 校验通过':'任务计划';text=d.humanDecision??`已返回 ${d.tasks?.length??0} 个任务，Controller 逐项调度；决策者验收通过后自动继续，重大决策再交用户。`;kind='plan';details={tasks:d.tasks};}
   else if(e.event==='review'){role=decisionRole;title=d.verdict==='human'?'需要你作出决定':d.verdict==='pass'?'审查通过':d.verdict==='rework'?'审查要求返工':'审查终止';text=d.reason;kind='review';status=d.verdict;}
   else if(e.event==='planning-human-decision'){role=decisionRole;title='需要补充目标';text=d.humanDecision;kind='review';status='human';}
   else if(e.event==='discussion-step-start'){title='决策调用开始';text=`${d.discussionStage} · 决策者 ${d.participantId.toUpperCase()} · ${d.mode==='mock'?'本地 Mock':'真实适配器调用'}；输出尚未校验`;kind='dispatch';status='running';}
   else if(e.event==='discussion-step-failed'){title=`决策者 ${d.participantId.toUpperCase()} · ${d.discussionStage} 调用失败`;text=d.error;kind='error';status=d.status;}
   else if(e.event==='discussion-replan-output'){role=d.participantAgent.backend==='codex'?'codex':d.participantAgent.backend==='opencode'?'opencode':'claude';title='主决策者 Replan · 非双决策讨论';text=d.output.humanDecision??'基于用户新指令重新规划；提案仍须 Controller 校验。';kind='plan';details={tasks:d.output.tasks};}
   else if(e.event==='discussion-output'){role=d.participantAgent.backend==='codex'?'codex':d.participantAgent.backend==='opencode'?'opencode':'claude';title=({draft:'初步计划',discussion:'讨论意见',synthesis:'主决策者总结 · 最终 Plan 提案'} as Record<string,string>)[d.discussionStage];text=d.mode==='mock'?'本地 Mock 适配器输出，未调用远端模型。':'真实决策调用的结构化输出；最终提案仍须 Controller 校验。';kind='discussion';if(d.output.tasks){details={tasks:d.output.tasks};text+='\n'+(d.output.humanDecision??'');}else text+='\n\n'+d.output.summary+'\n\n分歧：\n'+d.output.disagreements.map((s:string)=>'- '+s).join('\n')+'\n\n修改建议：\n'+d.output.amendments.map((s:string)=>'- '+s).join('\n');}
   else if(e.event==='agent-activity'){role=d.participantAgent?(d.participantAgent.backend==='codex'?'codex':d.participantAgent.backend==='opencode'?'opencode':'claude'):d.agent==='claude'?(d.phase==='execute'?'claude':decisionRole):d.agent;title=d.title;text=d.text;kind=d.kind;details={protocol:d.source,fullTextHash:d.fullTextHash,...(imagePaths?{paths:imagePaths}:{})};status=activityStatus(d);}
   else if(e.event==='agent-start'&&state.discussion&&d.role==='plan'){title='决策周期开始';text='按绑定的参与者配置顺序调用；完成最终 Plan 前不派发执行者。';kind='dispatch';}
   else if(e.event==='agent-start'){role=d.role==='execute'?executionRole:d.agent==='claude'?decisionRole:d.agent;title=d.role==='execute'?executionName+' 正在执行':decisionName+' 正在决策';text=`阶段：${d.role}`;kind='dispatch';status='running';}
   else if(e.event==='agent-finish'){role=state.discussion&&d.role==='plan'?'controller':d.role==='execute'?executionRole:d.agent==='claude'?decisionRole:d.agent;title='Agent 实际文件变更';text=`耗时 ${d.durationMs} ms；${d.changed===null?'文件变更未自动验证':d.changed?'观测到文件修改':'未观测到文件修改'}${d.verificationScope?'\n'+d.verificationScope:''}`;kind='changes';details={diff:redact(d.diff??''),protocol:d.verificationScope?'Controller limited Git observation':'Controller Git snapshot'};}
   else if(e.event==='native-result'){role=d.agent??executionRole;title=executionRole==='opencode'?'OpenCode 原生开发结果':'原生开发结果';text=d.summary+(d.sessionId?'\n\n执行 Session：'+d.sessionId:'');kind='output';}
   else if(e.event==='review-modified-workspace'){role='controller';title=decisionName+' 修改后需重新审查成果';text=d.reason;kind='tests';status='pending';}
   else if(e.event==='execution-interrupted'){title='原生执行中断，已有修改已保留';text=d.note;kind='warning';}
   else if(e.event==='claude-call-start'){title=d.role==='execute'?'派发 Claude Code 执行任务':d.role==='plan'?'派发规划任务':'派发审查任务';text=`${d.role==='execute'?executionName:decisionName} 调用预约 ${d.call}；会话 ${d.sessionId}`;kind='dispatch';}
   else if(e.event==='opencode-execution-session'){role='opencode';title='OpenCode 执行 Session';text=`执行者 · Session ${d.sessionId} · ${d.providerID} / ${d.modelID} · ${state.config.mode}`;kind='session';}
   else if(e.event==='opencode-execute-exit'){role='opencode';title='OpenCode Execute 结束';text=`执行者 · Session ${d.sessionId} · 退出码 ${d.exitCode}`;kind='exit';}
   else if(e.event==='opencode-execute-error'){role='opencode';title='OpenCode Execute 异常';text=d.message;kind='error';status='fail';}
   else if(e.event==='opencode-execute-exit-unconfirmed'){role='opencode';title='OpenCode 进程退出未确认';text=`执行 Session ${d.sessionId??'未建立'}；需要人工检查后恢复。`;kind='error';status='fail';}
   else if(e.event==='codex-decision-thread'){title='Codex 决策 Thread';text=d.sessionId;kind='session';}
   else if(e.event==='codex-decision-call-start'){title='派发 Codex 决策任务';text=`阶段：${d.role} · 调用 ${d.call} · 配置模型 ${d.configuredModel??'SDK 默认'}`;kind='dispatch';}
   else if(e.event==='codex-thread'){title='Codex 会话已续接';text=d.id;kind='session';}
   else if(e.event==='edits-applied'){role='codex';title='开发结果已由 Controller 应用';text=d.summary;kind='changes';details={paths:d.paths};}
   else if(e.event==='review-evidence'){title='成果证据已转交决策者';text='Controller 收集并转发观察记录，不判定成果成败。';kind='evidence';status='recorded';details={diff:redact(d.diff??'').slice(0,160000),issues:d.issues};}
   else if(e.event==='independent-check'){title=d.passed?'配置检查通过':'配置检查未通过';text=d.issues?.length?d.issues.join('\n'):'Controller 执行配置检查并记录结果；成果验收由决策者负责。';kind='tests';status=d.passed?'pass':'fail';details={tests:d.tests?.map((t:any)=>({...t,stdout:redact(t.stdout).slice(0,16000),stderr:redact(t.stderr).slice(0,6000)})),diff:redact(d.diff??'').slice(0,160000),diffTruncated:redact(d.diff??'').length>160000,issues:d.issues};}
   else if(e.event==='transition'){const names:Record<string,string>={planning:decisionName+' 规划中',execute:'准备派单',executing:executionName+' 执行中',applying:'受控应用提案',verify:'准备决策者审查证据',review:decisionName+' 审查中',paused:'已安全暂停',stopped:'已停止',failed:'运行失败',completed:'开发 Run 已完成'};title=state.config?.mode==='mock'&&d.phase==='completed'?'Mock 演练完成（未完成真实开发目标）':names[d.phase]??d.phase;text=d.reason??'';kind='phase';status=d.phase;}
   else if(e.event==='error'){title='异常已记录';text=d.message;kind='error';status=d.kind;}
   else if(e.event==='codex-exit'||e.event==='codex-decision-exit'||e.event==='claude-exit'){title=e.event==='codex-exit'?'Codex 执行进程退出':e.event==='codex-decision-exit'?'Codex 决策进程退出':'Claude CLI 进程退出';text=`退出码 ${d.exitCode}${d.stderr?'\n'+d.stderr:''}`;kind='exit';}
   else if(e.event==='review-vetoed'||e.event==='agent-activity-limit'){title=e.event==='review-vetoed'?'Controller 否决审查通过':'活动输出已达展示上限';text=d.reason??d.note;kind='warning';}
   else if(e.event.startsWith('delivery-')){const phases:Record<string,string>={preview:'交付预览已生成 · 等待负责人审批',approved:'具体交付已获批准 · 尚未应用',applying:'正在受控应用',applied:'已批准的交付已应用',invalidated:'交付批准已失效',blocked:'交付应用已停止'};title=phases[d.phase]??'交付状态记录';text=`Delivery ID：${d.deliveryId??'见正式交付页'}${d.digest?'\n\n审批摘要：`'+d.digest+'`':''}${d.reason?'\n\n'+d.reason:''}`;kind='delivery';}
   else continue;
   const visibleText=redact(String(text??''));
   const owner=d.participantId?d:state.discussion&&(['review','planning-human-decision'].includes(e.event)||['agent-start','agent-finish'].includes(e.event)&&d.role==='review')?{participantId:state.discussion.config.primary,participantAgent:state.discussion.participants.find(p=>p.id===state.discussion!.config.primary)!.agent,primary:true}:undefined;
   const executionEvent=(d.role==='execute'||d.phase==='execute')||e.event.startsWith('opencode-exec')||e.event==='native-result'||e.event==='agent-activity'&&d.scope?.startsWith('opencode-execute:');
   const tail=result.at(-1),fileTool=e.event==='agent-activity'&&d.source==='codex-sdk-runStreamed'&&title==='Codex 文件操作'?toolPresentation(d):null;
   const previousFiles=tail?.status==='running'&&tail.title===title?toolPresentation({kind:tail.kind,title:tail.title,text:tail.text,source:tail.details?.protocol}):null;
   const legacyFileUpdate=fileTool&&previousFiles&&tail!.scope===d.scope&&tail!.runId===state.id&&tail!.role===role&&tail!.loop===(d.loop??loop)&&tail!.taskId===(d.taskId??state.tasks[taskIndex]?.id??null)&&JSON.stringify(previousFiles.paths)===JSON.stringify(fileTool.paths);
   const previousStream=d.streamId?streams.get(d.scope+':'+d.streamId):legacyFileUpdate?result.length-1:undefined;
   if(d.streamId||previousStream!==undefined)details={...details,evidenceMessageId:'audit:'+e.hash};
   const visibleId=previousStream!==undefined?result[previousStream]!.id:'audit:'+e.hash;
   result.push({...((owner&&role!=='controller')?{participantId:owner.participantId,participantName:(owner.participantAgent.backend==='codex'?'Codex':owner.participantAgent.backend==='opencode'?'OpenCode':'Claude Code')+' '+owner.participantId.toUpperCase(),participantRole:owner.primary?'主决策者':'决策者',decisionStage:d.discussionStage}:{}),...(executionEvent?{participantRole:'执行者',participantName:executionName,decisionStage:'execute'}:{}),id:visibleId,time:e.time,role,...(role===decisionRole&&!owner&&!executionEvent&&(['plan','review','planning-human-decision'].includes(e.event)||e.event==='agent-activity'&&(d.phase==='plan'||d.phase==='review'||d.agent!=='codex')||['agent-start','agent-finish'].includes(e.event)&&d.role!=='execute')?{participantRole:'决策者'}:{}),title:redact(String(title)),text:visibleText,kind,status,runId:state.id,taskId:d.discussionStage&&d.discussionStage!=='review'?null:d.taskId??state.tasks[taskIndex]?.id??null,loop:d.loop??loop,scope:d.scope,timelineIndex,category:e.event==='agent-activity'?activityCategory(d):undefined,source:e.origin==='codex-native-log'?`codex-native-log:${e.hash}`:`audit.jsonl:${e.hash}`,details:details?JSON.parse(redact(JSON.stringify(details))):undefined});
   if(previousStream!==undefined){const latest=result.pop()!;latest.time=result[previousStream]!.time;result[previousStream]=latest;}else if(d.streamId)streams.set(d.scope+':'+d.streamId,result.length-1);
 }
 for(const note of notes)result.push({id:`note:${note.id}`,time:note.time,role:'user',title:'补充需求 · 已记录，尚未生效',text:note.text,kind:'note',status:'pending',runId:state.id,taskId:note.taskId,loop:note.loop,source:`desktop-note:${note.id}`});
 return [...new Map(result.map(m=>[m.id,m])).values()].sort((a,b)=>a.time.localeCompare(b.time));
}
function activityCategory(data:any):string {
 if(data.kind!=='tool')return data.kind;
 const view=toolPresentation(data);if(view?.command)return 'commands';if(view?.paths?.length)return 'files';
 try{const tool=JSON.parse(data.text).receipt?.tool;if(['write','edit','apply_patch'].includes(tool))return 'files';if(tool==='bash')return 'commands';}catch{/* legacy public text */}
 if(/文件|file/i.test(data.title))return 'files';
 if(/执行事件|命令|Shell/.test(data.title))return 'commands';
 // Unstructured legacy tools are grouped only when their exact titles match.
 return 'tool:'+data.title;
}
export {groupMessages} from './threadGrouping.js';
export function messagePage(messages:ChatMessage[],after?:string){
 const version=after?.match(/^(.*):v2:(-?\d+)$/),watermark=version?Number(version[2]):undefined;
 const id=version&&Number.isSafeInteger(watermark)&&(watermark??-2)>=-1?version[1]:after;
 const index=id?messages.findIndex(m=>m.id===id):-1;
 const reset=Boolean(after&&index<0),start=index<0?0:index+1;
 const latest=messages.reduce((value,m)=>Math.max(value,m.timelineIndex??-1),-1);
 // The visible ID stays stable while a text/tool stream grows. Re-send changes
 // before the chronological cursor as well as newly appended messages.
 const changed=version&&!reset?messages.slice(0,start).filter(m=>m.timelineIndex!==undefined&&m.timelineIndex>watermark!).sort((a,b)=>a.timelineIndex!-b.timelineIndex!):[];
 const updates=changed.slice(0,150),page=messages.slice(start,start+150-updates.length);
 const nextId=page.at(-1)?.id??(index>=0?id:undefined);
 const nextWatermark=changed.length>updates.length?updates.at(-1)!.timelineIndex!:latest;
 return {messages:[...updates,...page],cursor:nextId?`${nextId}:v2:${nextWatermark}`:null,hasMore:changed.length>updates.length||start+page.length<messages.length,reset,total:messages.length};
}
