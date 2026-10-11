import type {ChatMessage} from './types.js';

export function messageLane(message:ChatMessage):'user'|'decision'|'execution'|'system' {
 if(message.role==='user')return 'user';
 if(message.role==='controller')return 'system';
 if(message.decisionStage==='execute'||message.participantRole==='执行者')return 'execution';
 if(message.participantId||message.decisionStage||message.participantRole?.includes('决策'))return 'decision';
 // Legacy Codex events predate explicit role metadata.
 return message.role==='codex'?'execution':'decision';
}

type Activity={kind:string;text:string;title?:string;source?:string};
type ToolView={label:string;command?:string;paths?:string[];output?:string;status:string;exitCode?:number;durationMs?:number};
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const statusOf=(status:unknown)=>status==='completed'?'success':status==='failed'||status==='error'?'fail':['pending','running','in_progress'].includes(String(status))?'running':'recorded';

/** Parse only public adapter formats. Tool output is data, never a status signal. */
export function toolPresentation(data:Activity):ToolView|null {
 if(data.kind!=='tool'&&data.kind!=='error')return null;
 if(data.source==='codex-sdk-runStreamed'&&data.title==='Codex 执行事件'){
  const match=/^([\s\S]*?)\r?\n(in_progress|completed|failed) · exit_code=(pending|-?\d+)(?:\r?\n([\s\S]*))?$/.exec(data.text);
  if(match){const exitCode=match[3]==='pending'?undefined:Number(match[3]);return {label:'运行命令',command:match[1],output:match[4]??'',exitCode,status:match[2]==='failed'?'fail':exitCode!==undefined?(exitCode===0?'success':'fail'):statusOf(match[2])};}
 }
 if(data.source==='codex-sdk-runStreamed'&&data.title==='Codex 文件操作'){
  const [status,...rest]=data.text.split('\n');
  try{const changes:unknown=JSON.parse(rest.join('\n'));if(Array.isArray(changes)&&changes.every(c=>object(c)&&typeof c.path==='string'))return {label:'文件变更',paths:changes.map(c=>c.path),status:statusOf(status.trim())};}catch{/* Partial records retain their raw text. */}
 }
 try{
  const raw:unknown=JSON.parse(data.text);if(!object(raw))return null;
  const receipt=object(raw.receipt)?raw.receipt:raw;
  if(data.source==='opencode-sdk'&&typeof raw.receipt==='string')return null;
  if(!['opencode-sdk','claude-cli-stream-json','codex-sdk-runStreamed'].includes(data.source??''))return null;
  const input=object(receipt.input)?receipt.input:object(receipt.arguments)?receipt.arguments:{};
  const path=input.filePath??input.file_path??input.path;
  const output=receipt.error??receipt.output??receipt.content??receipt.result;
  const exitCode=data.source==='opencode-sdk'&&receipt.tool==='bash'&&Number.isInteger(receipt.metadata?.exit)?receipt.metadata.exit:undefined;
  const failed=receipt.is_error===true||(receipt.error!==undefined&&receipt.error!==null&&receipt.error!=='')||(exitCode!==undefined&&exitCode!==0);
  const measured=receipt.durationMs??receipt.metadata?.durationMs;
  const durationMs=typeof measured==='number'&&Number.isFinite(measured)&&measured>=0?measured:undefined;
  return {label:typeof receipt.tool==='string'?receipt.tool:data.title??'工具记录',command:typeof input.command==='string'?input.command:undefined,paths:typeof path==='string'?[path]:undefined,output:output===undefined?undefined:typeof output==='string'?output:JSON.stringify(output,null,2),exitCode,durationMs,status:failed?'fail':receipt.is_error===false?'success':statusOf(receipt.status)};
 }catch{return null;}
}

export function activityStatus(data:Activity):string {
 if(data.kind==='error')return 'fail';
 return toolPresentation(data)?.status??'recorded';
}

export function publicMessageText(message:ChatMessage):string {
 if(message.details?.protocol==='opencode-sdk'&&['output','summary'].includes(message.kind)){
  try{const data=JSON.parse(message.text);if(object(data)&&data.role==='execution'&&data.phase==='execute'&&typeof data.receipt==='string')return data.receipt;}catch{/* Keep partial public output intact. */}
 }
 return message.text;
}

export function messagePreview(message:ChatMessage):string {
 const tool=toolPresentation({kind:message.kind,text:message.text,title:message.title,source:message.details?.protocol});
 return (tool?.command??tool?.paths?.join('、')??(message.kind==='tool'?message.title:publicMessageText(message))).split('\n')[0].slice(0,160);
}
