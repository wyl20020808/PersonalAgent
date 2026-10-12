import type {ChatMessage,SessionMessage,DecisionAgent} from './types.js';
import {localFilePath} from './fileReferences.js';
import {partialPublicText} from '../../dist/src/discussion-stream.js';

export function imageFilePath(value:string):string|undefined{
 const file=localFilePath(value);return file&&/\.(?:png|jpe?g|gif|webp)$/i.test(file)?file:undefined;
}

export function sessionDiscussionReply(message:SessionMessage,sessionId:string,choice?:DecisionAgent):ChatMessage|undefined{
 if(message.status==='cancelled'||message.action!=='discuss'&&!message.discussionReply)return undefined;
 const waiting=message.status==='starting'||message.status==='pending'&&Boolean(message.autoQueued);
 const text=message.discussionReply??message.discussionDraft??(message.status==='pending'?(message.autoQueued?'已排队，上一条回复完成后处理。':'尚未处理，请重试或取消此消息。'):message.discussionProgress??(message.status==='failed'?message.error:'决策者正在思考…'))??'';
 return {id:'discussion-reply:'+message.id,time:message.discussionReplyTime??message.time,role:message.discussionNotice?'controller':choice?.backend==='codex'?'codex':choice?.backend==='opencode'?'opencode':'claude',...(message.discussionNotice?{}:{participantRole:'决策者',decisionStage:'discussion'}),title:message.discussionNotice?'进入讨论模式':waiting?'决策者 · 正在回复':'决策者 · 讨论',text,kind:message.discussionNotice?'phase':'discussion',status:waiting?'running':message.status==='failed'?'fail':message.status==='pending'?'pending':'success',runId:'',taskId:null,loop:0,source:'session:'+sessionId};
}

export function messageLane(message:ChatMessage):'user'|'decision'|'execution'|'system' {
 if(message.role==='user')return 'user';
 if(message.role==='controller')return 'system';
 if(message.decisionStage==='execute'||message.participantRole==='执行者')return 'execution';
 if(message.participantId||message.decisionStage||message.participantRole?.includes('决策'))return 'decision';
 // Legacy Codex events predate explicit role metadata.
 return message.role==='codex'?'execution':'decision';
}

type Activity={kind:string;text:string;title?:string;source?:string};
type ToolView={label:string;command?:string;paths?:string[];images?:string[];imageAction?:'view'|'write';output?:string;status:string;exitCode?:number;durationMs?:number};
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
  if(!['opencode-sdk','claude-cli-stream-json','codex-sdk-runStreamed','codex-app-server'].includes(data.source??''))return null;
  const input=object(receipt.input)?receipt.input:object(receipt.arguments)?receipt.arguments:{};
  const path=input.filePath??input.file_path??input.path;
  const toolName=String(receipt.tool??receipt.name??data.title??'');
  const image=typeof path==='string'?imageFilePath(path):undefined,images=image?[image]:[];
  // Public MCP input may wrap view_image. Extract literal paths, never execute code.
  if(typeof input.code==='string')for(const match of input.code.matchAll(/view_image\s*\(\s*\{\s*path\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g)){
   try{const value=match[1].startsWith('"')?JSON.parse(match[1]):match[1].slice(1,-1),file=imageFilePath(value);if(file)images.push(file);}catch{/* Invalid literals remain raw evidence. */}
  }
  const imageAction=images.length?(/view_image|image_view|open_image|read|读取|查看/i.test(toolName)||typeof input.code==='string'?'view':/write|edit|生成/i.test(toolName)?'write':undefined):undefined;
  const output=receipt.error??receipt.output??receipt.content??receipt.result;
  const exitCode=data.source==='opencode-sdk'&&receipt.tool==='bash'&&Number.isInteger(receipt.metadata?.exit)?receipt.metadata.exit:undefined;
  const failed=receipt.is_error===true||(receipt.error!==undefined&&receipt.error!==null&&receipt.error!=='')||(exitCode!==undefined&&exitCode!==0);
  const measured=receipt.durationMs??receipt.metadata?.durationMs;
  const durationMs=typeof measured==='number'&&Number.isFinite(measured)&&measured>=0?measured:undefined;
  return {label:typeof receipt.tool==='string'?receipt.tool:data.title??'工具记录',command:typeof input.command==='string'?input.command:undefined,paths:images.length?[...new Set(images)]:typeof path==='string'?[path]:undefined,...(images.length?{images:[...new Set(images)],imageAction}:{}),output:output===undefined?undefined:typeof output==='string'?output:JSON.stringify(output,null,2),exitCode,durationMs,status:failed?'fail':receipt.is_error===false?'success':data.source==='claude-cli-stream-json'&&typeof receipt.id==='string'&&object(receipt.input)?'running':statusOf(receipt.status)};
 }catch{return null;}
}

export function activityStatus(data:Activity):string {
 if(data.kind==='error')return 'fail';
 return toolPresentation(data)?.status??'recorded';
}

const publicProtocols=['opencode-sdk','codex-sdk-runStreamed','codex-app-server','claude-cli-stream-json'];
function publicReceipt(value:unknown,depth=0):string {
 if(depth>=4)return typeof value==='string'?value:JSON.stringify(value,null,2);
 if(typeof value==='string'){
  try{return publicReceipt(JSON.parse(value),depth+1);}catch{return value;}
 }
 if(object(value)&&value.role==='execution'&&value.phase==='execute'&&'receipt' in value)return publicReceipt(value.receipt,depth+1);
 if(object(value)&&value.mode==='native'&&typeof value.summary==='string')return value.summary;
 const labels:Record<string,string>={action:'操作',summary:'结果',output:'输出',result:'结果',checks:'验证',tests:'测试',files:'文件',changes:'变更',error:'错误',next:'下一步',status:'状态'};
 if(object(value)&&Object.keys(value).some(key=>key in labels))return Object.entries(value).map(([key,item])=>{
  const content=typeof item==='string'?item:Array.isArray(item)&&item.every(entry=>typeof entry==='string')?item.map(entry=>'- '+entry).join('\n'):'```json\n'+JSON.stringify(item,null,2)+'\n```';
  return `**${labels[key]??key}**\n\n${content}`;
 }).join('\n\n');
 return '```json\n'+JSON.stringify(value,null,2)+'\n```';
}

export function publicMessageText(message:ChatMessage):string {
 if(publicProtocols.includes(message.details?.protocol??'')&&['output','summary'].includes(message.kind)){
  try{
   const data:unknown=JSON.parse(message.text);
   if(object(data)&&data.role==='execution'&&data.phase==='execute'&&'receipt' in data)return publicReceipt(data.receipt);
   if(object(data)&&data.mode==='native'&&typeof data.summary==='string')return data.summary;
  }catch{
   // Recognize only the adapter envelope header; never guess partial receipt contents.
   if(/^\s*\{\s*"role"\s*:\s*"execution"\s*,\s*"phase"\s*:\s*"execute"\s*,/.test(message.text))return message.status==='running'?'正在接收执行结果…':'执行记录不完整，无法整理正文。请展开原始记录查看。';
  }
  if(/^\s*\{/.test(message.text)){
   const text=partialPublicText(message.text);if(text!==undefined)return text;
   try{JSON.parse(message.text);}catch{return '';}
  }
 }
 return message.text;
}

export function messagePreview(message:ChatMessage):string {
 const tool=toolPresentation({kind:message.kind,text:message.text,title:message.title,source:message.details?.protocol});
 const text=tool?.command??tool?.paths?.join('、')??(message.kind==='tool'?message.title:publicMessageText(message));
 return (text.split('\n').find(line=>line.trim()&&!/^\*\*[^*]+\*\*$/.test(line.trim()))??'').slice(0,160);
}
