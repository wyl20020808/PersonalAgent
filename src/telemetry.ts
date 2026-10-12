import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import {createHash} from 'node:crypto';
import type {State, Store} from './store.js';

export function redact(text:string):string {
  return text.replace(/\b(?:sk-[\w-]{8,}|gh[pousr]_[\w]{12,})\b/g,'[已隐藏凭据]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)\s*["']?\s*[:=]\s*["']?)[^\s,"'\r\n}]+/gi,'$1[已隐藏凭据]')
    .replace(/Bearer\s+[\w.\/-]+/gi,'Bearer [已隐藏凭据]');
}
export interface PublicActivity {key:string;kind:string;title:string;text:string;streamId?:string}
export function activityRecorder(state:State,store:Store,agent:'claude'|'codex'|'opencode',scope:string,phase?:'plan'|'review'|'execute'){
  const seen=new Set<string>();let count=0,limited=false;
  if(existsSync(store.file('audit.jsonl')))for(const line of readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').filter(Boolean)){
    const e=JSON.parse(line);if(e.event==='agent-activity'&&e.data.scope===scope){seen.add(e.data.key);if(!e.data.streamId)count++;}if(e.event==='agent-activity-limit'&&e.data.scope===scope)limited=true;
  }
  return (event:PublicActivity)=>{
    if(!event||!['key','kind','title','text'].every(k=>typeof (event as unknown as Record<string,unknown>)[k]==='string'))throw Error('Invalid public activity');
    const key=createHash('sha256').update(event.key).digest('hex');if(seen.has(key))return;seen.add(key);
    if(!event.streamId&&count>=120 && state.config.executionMode === 'proposal'){if(!limited){store.audit('agent-activity-limit',{scope,agent,runId:state.id,taskId:state.tasks[state.taskIndex]?.id??null,loop:state.loops,note:'活动展示已达上限；最终结构化结果仍按完整 Schema 校验'});limited=true;}count++;return;}
    if(!event.streamId)count++;
    const text=redact(event.text);
    const fullTextFile=text.length>6000?`activity-${createHash('sha256').update(scope+key).digest('hex')}.txt`:undefined;
    if(fullTextFile)writeFileSync(store.file(fullTextFile),text,'utf8');
    store.audit('agent-activity',{scope,agent,...(phase?{phase}:{}),runId:state.id,taskId:state.tasks[state.taskIndex]?.id??null,loop:state.loops,
      key,streamId:event.streamId,kind:event.kind.slice(0,80),title:redact(event.title).slice(0,160),text:text.slice(0,6000),truncated:!!fullTextFile,fullTextFile,fullTextHash:fullTextFile?createHash('sha256').update(text).digest('hex'):undefined,source:agent==='opencode'?'opencode-sdk':agent==='claude'?'claude-cli-stream-json':'codex-sdk-runStreamed'});
  };
}

// Only public text is retained. Thinking/signature blocks are deliberately excluded.
export function claudePublicEvent(value:any):PublicActivity|null {
  if(value.type==='system'&&value.subtype==='api_retry')return {key:`retry:${value.attempt??value.retry_attempt??JSON.stringify(value)}`,kind:'retry',title:'Claude 服务重连',text:String(value.error?.message??value.message??'CLI 报告重试')};
  if(value.type==='system'&&value.subtype==='init')return {key:'init',kind:'session',title:'Claude 会话已就绪',text:'正在等待公开输出；未提供隐藏思维链'};
  if(value.type==='assistant'){
    const text=(value.message?.content??[]).filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n');
    if(text)return {key:`message:${value.uuid??value.message?.id??text}`,kind:'output',title:'Claude 公开输出',text};
  }
  return null;
}

export function codexPublicEvent(value:any):PublicActivity|null {
  const item=value.item;
  if(value.type==='turn.started')return {key:'turn.started',kind:'stage',title:'Codex 开始执行',text:'已收到 Controller 派发的任务'};
  if(value.type==='turn.completed')return {key:'turn.completed',kind:'stage',title:'Codex 回合完成',text:'原生执行回合完成，等待决策者验收；通过后自动继续，重大问题才请用户决定'};
  if(value.type==='error' && /^Reconnecting\.\.\./.test(value.message??''))return {key:`retry:${value.message}`,kind:'retry',title:'Codex 正在重连',text:value.message};
  if(value.type==='turn.failed'||value.type==='error')return {key:`${value.type}:${value.error?.message??value.message}`,kind:'error',title:'Codex 连接或执行异常',text:value.error?.message??value.message??'未知异常'};
  if(!item||!['item.started','item.updated','item.completed'].includes(value.type))return null;
  if(item.type==='reasoning')return {key:`${item.id}:${value.type}:${item.text}`,kind:'summary',title:'Codex 公开摘要',text:item.text??''};
  if(item.type==='agent_message'){
    let title='Codex 公开输出',text=item.text??'';
    try{const parsed=JSON.parse(text);if(typeof parsed.summary==='string'){title='Codex 修改提案';text=parsed.summary+'\n'+(parsed.changes??[]).map((c:any)=>c.path).join('\n');}}catch{/* Partial public message, never interpreted as validated edits. */}
    return {key:`${item.id}:${value.type}:${text}`,streamId:item.id,kind:'output',title,text};
  }
  if(item.type==='command_execution')return {key:`${item.id}:${value.type}:${item.aggregated_output}`,kind:'tool',title:'Codex 执行事件',text:`${item.command}\n${item.status} · exit_code=${item.exit_code??'pending'}\n${item.aggregated_output??''}`};
  if(item.type==='file_change')return {key:`${item.id}:${value.type}:${JSON.stringify(item.changes)}`,streamId:item.id,kind:'tool',title:'Codex 文件操作',text:`${item.status}\n${JSON.stringify(item.changes??[])}`};
  if(item.type==='mcp_tool_call'&&item.id)return {key:`${item.id}:${value.type}:${JSON.stringify(item.result??item.error)}`,kind:'tool',title:`Codex MCP · ${item.server}/${item.tool}`,text:JSON.stringify({status:item.status,arguments:item.arguments,result:item.result,error:item.error})};
  if(item.type==='web_search')return {key:`${item.id}:${value.type}`,kind:'tool',title:'Codex 网络搜索',text:item.query??''};
  if(item.type==='error')return {key:`${item.id}:${value.type}`,kind:'error',title:'Codex 工具错误',text:item.message??''};
  if(item.type==='todo_list')return {key:`${item.id}:${value.type}:${JSON.stringify(item.items)}`,kind:'todo',title:'Codex 步骤记录',text:(item.items??[]).map((i:any)=>`${i.completed?'✓':'○'} ${i.text}`).join('\n')};
  return null;
}

// Multiple tools/results may share one CLI message. Do not discard sibling blocks.
export function claudePublicEvents(value:any):PublicActivity[] {
  const events:PublicActivity[]=[];
  const message=claudePublicEvent(value); if(message)events.push(message);
  if(value.type==='system'&&value.subtype==='init')events.push({key:'tools:init',kind:'session',title:'Claude 原生工具与权限',text:JSON.stringify({tools:value.tools,permissionMode:value.permissionMode,mcp_servers:value.mcp_servers,skills:value.skills,plugins:value.plugins})});
  if(['assistant','user'].includes(value.type))for(const block of value.message?.content??[]){
    if(block.type==='tool_use')events.push({key:`tool:${block.id}`,kind:'tool',title:`Claude 工具 · ${block.name}`,text:JSON.stringify({id:block.id,input:block.input})});
    if(block.type==='tool_result'){
      const content=typeof block.content==='string'?block.content:(block.content??[]).filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('\n');
      events.push({key:`result:${block.tool_use_id}:${value.uuid??content}`,kind:block.is_error?'error':'tool',title:'Claude 工具结果',text:JSON.stringify({tool_use_id:block.tool_use_id,is_error:block.is_error??false,content})});
    }
  }
  if(value.type==='tool_progress')events.push({key:`progress:${value.tool_use_id}:${value.elapsed_time_seconds}`,kind:'tool',title:`Claude 正在执行 · ${value.tool_name??'工具'}`,text:JSON.stringify({tool_use_id:value.tool_use_id,elapsed_time_seconds:value.elapsed_time_seconds})});
  if(value.type==='tool_use_summary')events.push({key:`tool-summary:${value.uuid??value.summary}`,kind:'output',title:'Claude 公开工具摘要',text:String(value.summary??'')});
  if(value.type==='result')events.push({key:'result',kind:value.is_error?'error':'stage',title:'Claude 调用结束',text:JSON.stringify({is_error:value.is_error??false,duration_ms:value.duration_ms,num_turns:value.num_turns,total_cost_usd:value.total_cost_usd})});
  return events;
}
