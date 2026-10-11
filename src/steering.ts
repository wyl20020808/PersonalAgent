import fs from 'node:fs';
import {atomicJson,type Store} from './store.js';
import {validate} from './schema.js';
import {attachmentRefSchema,type AttachmentRef} from './attachment-types.js';
import {readNativeAttachment} from './multimodal.js';
import {projectTarget} from './project-files.js';

export type Guidance={id:string;sessionId:string;runId:string;text:string;time:string;sequence?:number;attachments:AttachmentRef[]};
const uuid={type:'string',pattern:'^[a-f0-9-]{36}$'};
export const guidanceSchema={type:'object',additionalProperties:false,required:['id','sessionId','runId','text','time','attachments'],properties:{id:uuid,sessionId:uuid,runId:uuid,text:{type:'string',minLength:1,maxLength:5000},time:{type:'string'},sequence:{type:'integer',minimum:1},attachments:{type:'array',maxItems:8,items:attachmentRefSchema}}};
type Status='pending'|'processing'|'applied'|'cancelled';
function file(store:Store,id:string,status:Status){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('引导消息 ID 无效');return store.file(`guidance/${status}/${id}.json`);}
function prepare(store:Store){for(const status of ['pending','processing','applied','cancelled'] as const)fs.mkdirSync(store.file('guidance/'+status),{recursive:true});}
export function guidanceStatus(store:Store,id:string):Status|undefined{
 for(const status of ['applied','processing','pending','cancelled'] as const)if(fs.existsSync(file(store,id,status)))return status;
}
export function readGuidance(store:Store,id:string):Guidance|undefined{
 const status=guidanceStatus(store,id);if(!status)return;
 const message=validate<Guidance>(guidanceSchema,JSON.parse(fs.readFileSync(projectTarget(store.dir,`guidance/${status}/${id}.json`),'utf8')));
 if(message.runId!==store.id||message.id!==id)throw Error('引导消息归属不匹配');return message;
}
/** Desktop publishes a mailbox only. The running Controller remains the sole state/audit writer. */
export function publishGuidance(store:Store,message:Guidance){
 validate(guidanceSchema,message);if(message.runId!==store.id)throw Error('引导 Run 归属不匹配');prepare(store);
 const status=guidanceStatus(store,message.id);if(status&&status!=='cancelled')throw Error('引导消息已经投递');
 const sequenceFile=store.file('guidance/sequence.json');
 const sequence=fs.existsSync(sequenceFile)?JSON.parse(fs.readFileSync(projectTarget(store.dir,'guidance/sequence.json'),'utf8'))+1:1;
 if(!Number.isSafeInteger(sequence)||sequence<1)throw Error('引导队列序号无效');
 atomicJson(sequenceFile,sequence);
 atomicJson(file(store,message.id,'pending'),{...message,sequence});
 if(status==='cancelled')fs.unlinkSync(file(store,message.id,'cancelled'));
}
export function cancelGuidance(store:Store,id:string){
 prepare(store);
 // Claim and cancellation compete for the same source. Exactly one rename wins.
 try{fs.renameSync(file(store,id,'pending'),file(store,id,'cancelled'));}
 catch(error){if(guidanceStatus(store,id)==='cancelled')return;throw Error('决策者已接收此消息，不能再删除或修改');}
}
export function pendingGuidance(store:Store):Guidance[]{
 const directory=store.file('guidance/pending');if(!fs.existsSync(directory))return [];
 return fs.readdirSync(directory).filter(name=>/^[a-f0-9-]{36}\.json$/.test(name)).map(name=>{
  let message:Guidance;try{message=validate<Guidance>(guidanceSchema,JSON.parse(fs.readFileSync(projectTarget(directory,name),'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
  if(message.runId!==store.id||name!==message.id+'.json')throw Error('引导消息归属不匹配');return message;
 }).filter((message):message is Guidance=>Boolean(message)).sort((a,b)=>a.sequence&&b.sequence?a.sequence-b.sequence:a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
}
export function claimGuidance(store:Store,appliedIds:string[]=[]):Guidance|undefined{
 prepare(store);
 // A crash between atomic claim and state persistence retains the exact input.
 for(const message of processingGuidance(store)){
  if(appliedIds.includes(message.id)){finishGuidance(store,message);continue;}return message;
 }
 return claimPendingGuidance(store);
}
export function processingGuidance(store:Store):Guidance[]{
 const directory=store.file('guidance/processing');if(!fs.existsSync(directory))return [];
 return fs.readdirSync(directory).filter(name=>/^[a-f0-9-]{36}\.json$/.test(name)).map(name=>{
  const message=validate<Guidance>(guidanceSchema,JSON.parse(fs.readFileSync(projectTarget(directory,name),'utf8')));
  if(message.runId!==store.id||name!==message.id+'.json')throw Error('引导消息归属不匹配');return message;
 }).sort((a,b)=>(a.sequence??0)-(b.sequence??0)||a.time.localeCompare(b.time));
}
export function claimPendingGuidance(store:Store):Guidance|undefined{
 prepare(store);
 for(const message of pendingGuidance(store)){
  // Validate before claiming: damaged pending inputs remain removable by the user.
  validateGuidanceAttachments(store,message);
  try{fs.renameSync(file(store,message.id,'pending'),file(store,message.id,'processing'));}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
  return message;
 }
}
export function validateGuidanceAttachments(store:Store,message:Guidance){
 for(const {file:relative,...item} of message.attachments)readNativeAttachment({...item,path:projectTarget(store.dir,relative)});
}
export function finishGuidance(store:Store,message:Guidance){
 if(guidanceStatus(store,message.id)==='applied')return;
 fs.renameSync(file(store,message.id,'processing'),file(store,message.id,'applied'));
}
