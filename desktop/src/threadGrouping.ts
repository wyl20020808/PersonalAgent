import type {ChatMessage} from './types.js';
import {messageLane,publicMessageText} from './chatPresentation.js';
import {toolPresentation} from './chatPresentation.js';
export type MessageGroup={id:string;category:string;messages:ChatMessage[];status:string;firstTime:string;lastTime:string};
const categories:Record<string,string>={commands:'命令',files:'文件操作',summary:'执行进度',output:'公开输出',todo:'步骤记录'};
function groupable(message:ChatMessage){return message.role!=='controller'&&message.role!=='user'&&Boolean(message.category)&&!['error','warning','stage','session','retry','review','tests'].includes(message.kind)&&!['fail','failed','human','paused','completed'].includes(message.status);}
/** Detailed mode preserves audit adjacency; compact execution groups use visible reply boundaries. */
export function groupMessages(messages:ChatMessage[],compactExecution=false):MessageGroup[]{
 const groups:MessageGroup[]=[];
 const execution=(message:ChatMessage)=>compactExecution&&['execution','decision'].includes(messageLane(message))&&['tool','todo'].includes(message.kind);
 const category=(message:ChatMessage)=>execution(message)?'execution':message.category;
 const canGroup=(message:ChatMessage)=>execution(message)||groupable(message)&&(!compactExecution||message.kind==='tool'||message.kind==='todo');
 for(const message of messages){const previous=groups.at(-1),tail=previous?.messages.at(-1);
  if(compactExecution&&message.kind==='receiving')continue;
  if(compactExecution&&['session','stage'].includes(message.kind)&&message.details?.protocol&&!['fail','failed','running','human','paused'].includes(message.status))continue;
  if(compactExecution&&message.kind==='tool'&&!['fail','failed'].includes(message.status)&&(message.title.includes('StructuredOutput')||toolPresentation({kind:message.kind,title:message.title,text:message.text,source:message.details?.protocol})?.output==='Structured output provided successfully'))continue;
  if(compactExecution&&messageLane(message)==='execution'&&['output','summary','tool'].includes(message.kind)&&!publicMessageText(message).trim()&&!message.details?.paths?.length&&!message.details?.diff&&!message.attachments?.length&&!['fail','failed','running','human','paused'].includes(message.status))continue;
  const merge=tail&&canGroup(tail)&&canGroup(message)&&tail.role===message.role&&messageLane(tail)===messageLane(message)&&tail.participantId===message.participantId&&tail.decisionStage===message.decisionStage&&category(tail)===category(message)&&tail.runId===message.runId&&tail.taskId===message.taskId&&tail.loop===message.loop&&tail.scope===message.scope&&(execution(tail)&&execution(message)||tail.timelineIndex!==undefined&&message.timelineIndex===tail.timelineIndex+1);
  if(merge){previous!.messages.push(message);previous!.lastTime=message.time;if(execution(message)){previous!.status=['fail','failed'].includes(previous!.status)||['fail','failed'].includes(message.status)?'fail':message.status;}else if(message.status==='running')previous!.status='running';else if(previous!.status!=='running'&&message.status!==previous!.status)previous!.status='recorded';}
  else groups.push({id:'group:'+message.id,category:execution(message)?'执行操作':categories[message.category??'']??message.title,messages:[message],status:message.status,firstTime:message.time,lastTime:message.time});
 }return groups;
}
