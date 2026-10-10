import type {ChatMessage} from './types.js';
export type MessageGroup={id:string;category:string;messages:ChatMessage[];status:string;firstTime:string;lastTime:string};
const categories:Record<string,string>={commands:'命令',files:'文件操作',summary:'执行进度',output:'公开输出',todo:'步骤记录'};
function groupable(message:ChatMessage){return message.role!=='controller'&&Boolean(message.category)&&!['error','warning','stage','session','retry','review','tests'].includes(message.kind)&&!['fail','failed','human','paused','completed'].includes(message.status);}
/** Deterministic projection over the unfiltered timeline; invisible audit entries are boundaries too. */
export function groupMessages(messages:ChatMessage[]):MessageGroup[]{
 const groups:MessageGroup[]=[];
 for(const message of messages){const previous=groups.at(-1),tail=previous?.messages.at(-1);
  const merge=tail&&groupable(tail)&&groupable(message)&&tail.role===message.role&&tail.participantId===message.participantId&&tail.decisionStage===message.decisionStage&&tail.category===message.category&&tail.runId===message.runId&&tail.taskId===message.taskId&&tail.loop===message.loop&&tail.scope===message.scope&&tail.timelineIndex!==undefined&&message.timelineIndex===tail.timelineIndex+1;
  if(merge){previous!.messages.push(message);previous!.lastTime=message.time;if(message.status==='running')previous!.status='running';else if(previous!.status!=='running'&&message.status!==previous!.status)previous!.status='recorded';}
  else groups.push({id:'group:'+message.id,category:categories[message.category??'']??message.title,messages:[message],status:message.status,firstTime:message.time,lastTime:message.time});
 }return groups;
}
