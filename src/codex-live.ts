import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import type {CodexOptions,Input,ThreadOptions,TurnOptions,ThreadEvent} from '@openai/codex-sdk';
import {terminateTree} from './process.js';

export interface CodexTurnClient {
 startThread(options?:ThreadOptions):{runStreamed(input:Input,options?:TurnOptions):Promise<{events:AsyncGenerator<ThreadEvent>}>};
 resumeThread(id:string,options?:ThreadOptions):{runStreamed(input:Input,options?:TurnOptions):Promise<{events:AsyncGenerator<ThreadEvent>}>};
}
function executable(options:CodexOptions){
 if(options.codexPathOverride)return {file:options.codexPathOverride,dirs:[] as string[]};
 const os=process.platform,arch=process.arch;
 const triple=os==='win32'?(arch==='x64'?'x86_64':'aarch64')+'-pc-windows-msvc':(arch==='x64'?'x86_64':'aarch64')+(os==='darwin'?'-apple-darwin':'-unknown-linux-musl');
 if(!['win32','darwin','linux'].includes(os)||!['x64','arm64'].includes(arch))throw Error('Unsupported Codex live platform');
 const require=createRequire(new URL(import.meta.resolve('@openai/codex-sdk'))),platform=os==='win32'?'win32':os;
 const root=path.join(path.dirname(require.resolve(`@openai/codex-${platform}-${arch}/package.json`)),'vendor',triple);
 const file=path.join(root,'bin',os==='win32'?'codex.exe':'codex');
 if(!fs.existsSync(file))throw Error('Installed Codex app-server binary unavailable');
 return {file,dirs:[path.join(root,'codex-path')].filter(p=>fs.existsSync(p))};
}

/** Project official App Server notifications onto the existing owned turn contract. */
export class CodexLiveProjection {
 private items=new Map<string,any>();
 private usage={input_tokens:0,cached_input_tokens:0,output_tokens:0};
 constructor(private threadId:string,private turnId:string){}
 accept(method:string,p:any):any[]{
  if(p?.threadId!==this.threadId||(p.turnId??p.turn?.id)!==this.turnId||p.turn?.id!==undefined&&p.turn.id!==this.turnId)return [];
  if(method==='thread/tokenUsage/updated'){const u=p.tokenUsage?.last;if(u)this.usage={input_tokens:u.inputTokens??0,cached_input_tokens:u.cachedInputTokens??0,output_tokens:u.outputTokens??0};return [{type:'context.usage',usedTokens:u?.totalTokens,windowTokens:p.tokenUsage?.modelContextWindow}];}
  if(method==='turn/completed')return p.turn?.status==='completed'?[{type:'turn.completed',usage:this.usage}]:[{type:'turn.failed',error:{message:p.turn?.error?.message??'Codex turn '+(p.turn?.status??'failed')}}];
  if(method==='error')return [{type:'error',message:(p.willRetry?'Reconnecting... ':'')+(p.error?.message??'Codex service error')}];
  const status=(value:string)=>value==='inProgress'?'in_progress':value;
  let item:any;
  if(['item/started','item/completed'].includes(method)){
   const raw=p.item;if(typeof raw?.id!=='string'||!raw.id)return [];
   if(raw.type==='contextCompaction')return [{type:'context.compaction',id:raw.id,status:method==='item/started'?'compacting':'compacted'}];
   if(raw.type==='agentMessage')item={id:raw.id,type:'agent_message',text:raw.text??''};
   else if(raw.type==='commandExecution')item={id:raw.id,type:'command_execution',command:raw.command,status:status(raw.status),aggregated_output:raw.aggregatedOutput??'',exit_code:raw.exitCode};
   else if(raw.type==='fileChange')item={id:raw.id,type:'file_change',status:status(raw.status),changes:(raw.changes??[]).map((c:any)=>({path:c.path,kind:c.kind?.type??c.kind}))};
   else if(raw.type==='mcpToolCall'||raw.type==='dynamicToolCall')item={id:raw.id,type:'mcp_tool_call',server:raw.server??raw.namespace??'native',tool:raw.tool,arguments:raw.arguments,status:status(raw.status),result:raw.result??raw.contentItems,error:raw.error};
   else if(raw.type==='collabAgentToolCall')item={id:raw.id,type:'mcp_tool_call',server:'codex-native',tool:raw.tool,arguments:{prompt:raw.prompt,receiverThreadIds:raw.receiverThreadIds},status:status(raw.status),result:raw.agentsStates};
   else if(raw.type==='imageView')item={id:raw.id,type:'image_view',path:raw.path,status:method==='item/completed'?'completed':'in_progress'};
   else if(raw.type==='webSearch')item={id:raw.id,type:'web_search',query:raw.query};
   else if(raw.type==='reasoning')item={id:raw.id,type:'reasoning',text:(raw.summary??[]).join('\n')}; // Never forward raw reasoning content.
   if(!item)return [];this.items.set(item.id,item);
   return [{type:method==='item/started'?'item.started':'item.completed',item}];
  }
  if(typeof p.itemId!=='string'||!p.itemId)return [];
  const old=this.items.get(p.itemId);
  if(method==='item/agentMessage/delta'&&typeof p.delta==='string'){
   if(old&&old.type!=='agent_message')return [];
   item={id:p.itemId,type:'agent_message',text:(old?.text??'')+p.delta};
  }else if(method==='item/commandExecution/outputDelta'&&old?.type==='command_execution'&&typeof p.delta==='string')item={...old,aggregated_output:old.aggregated_output+p.delta};
  else return [];
  this.items.set(item.id,item);return [{type:'item.updated',item}];
 }
}

/** Each worker owns one stdio App Server and its descendants; no detached service. */
export function streamingCodex(options:CodexOptions & {compactBeforeTurn?:boolean}={}):CodexTurnClient {
 const thread=(id:string|null,settings:ThreadOptions={})=>({async runStreamed(input:Input,turn:TurnOptions={}){
  async function* events():AsyncGenerator<ThreadEvent>{
   turn.signal?.throwIfAborted();const binary=executable(options),env={...process.env,...options.env};
   const pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')??'PATH';env[pathKey]=[...binary.dirs,env[pathKey]??''].join(path.delimiter);
   const child=spawn(binary.file,['app-server',...(options.configOverrides??[]).flatMap(c=>['-c',c])],{cwd:settings.workingDirectory,env,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
   let sequence=0,pending='',closed=false,failure:Error|undefined,wake:(()=>void)|undefined;
   const queue:any[]=[],requests=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
   const fail=(error:Error)=>{failure??=error;for(const r of requests.values())r.reject(failure);requests.clear();wake?.();};
   const ended=new Promise<void>(resolve=>{child.once('close',code=>{closed=true;if(!failure)fail(Error('Codex app-server exited '+code));resolve();});child.once('error',error=>{closed=true;fail(error);resolve();});});
   const send=(value:object)=>child.stdin.write(JSON.stringify(value)+'\n');
   const request=(method:string,params:object)=>new Promise<any>((resolve,reject)=>{const key=++sequence;requests.set(key,{resolve,reject});send({id:key,method,params});});
   child.stdin.on('error',fail);child.stdout.setEncoding('utf8');child.stderr.resume();
   child.stdout.on('data',(text:string)=>{
    pending+=text;if(pending.length>8*1024*1024){fail(Error('Codex app-server frame limit exceeded'));return;}
    let end:number;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(!line.trim())continue;
     try{const e=JSON.parse(line);if(e.id!==undefined&&!e.method){const r=requests.get(e.id);if(r){requests.delete(e.id);e.error?r.reject(Error(e.error.message??'Codex RPC failed')):r.resolve(e.result);}}
      else if(e.id!==undefined&&e.method)send({id:e.id,error:{code:-32601,message:'Controller-managed user interaction required'}});
      else if(e.method){queue.push(e);wake?.();}
     }catch{fail(Error('Invalid Codex app-server JSON frame'));}
    }
   });
   const abort=()=>fail(Error('Stopped'));turn.signal?.addEventListener('abort',abort,{once:true});
   try{
    await request('initialize',{clientInfo:{name:'personalagent',version:'0.1.0'},capabilities:{experimentalApi:true}});send({method:'initialized'});
    const config={...options.config,...(settings.webSearchMode?{web_search:settings.webSearchMode}:{})};
    const params={cwd:settings.workingDirectory,model:settings.model,approvalPolicy:settings.approvalPolicy??'never',sandbox:settings.sandboxMode??'danger-full-access',config,...(id?{threadId:id,excludeTurns:true}:{})};
    const opened=await request(id?'thread/resume':'thread/start',params),threadId=opened.thread?.id;
    if(!threadId||id&&threadId!==id)throw Error('Codex live Thread ownership mismatch');
    if(opened.thread.cwd&&path.resolve(opened.thread.cwd)!==path.resolve(settings.workingDirectory??process.cwd()))throw Error('Codex live workspace mismatch');
    yield {type:'thread.started',thread_id:threadId};
    if(id && options.compactBeforeTurn){
     await request('thread/compact/start',{threadId});
     let compactTurn:string|undefined;
     for(;;){if(failure)throw failure;const next=queue.shift();if(!next){await new Promise<void>(resolve=>{wake=resolve;});wake=undefined;continue;}
      const p=next.params;if(p?.threadId!==threadId)continue;
      if(next.method==='turn/started'&&p.turn?.id)compactTurn=p.turn.id;
      if(!compactTurn||(p.turnId??p.turn?.id)!==compactTurn)continue;
      if(['item/started','item/completed'].includes(next.method)&&p.item?.type==='contextCompaction')yield {type:'context.compaction',id:p.item.id,status:next.method==='item/started'?'compacting':'compacted'} as any;
      if(next.method==='turn/completed'){if(p.turn.status!=='completed')throw Error('Codex context compaction failed: '+(p.turn.error?.message??p.turn.status));break;}
     }
    }
    const parts=typeof input==='string'?[{type:'text',text:input}]:input.map(p=>p.type==='local_image'?{type:'localImage',path:p.path}:p);
    const result=await request('turn/start',{threadId,input:parts,effort:settings.modelReasoningEffort,outputSchema:turn.outputSchema,
     ...(settings.sandboxMode==='read-only'?{sandboxPolicy:{type:'readOnly',networkAccess:settings.networkAccessEnabled??false}}:{})});
    if(!result.turn?.id)throw Error('Codex live turn identity missing');
    const projection=new CodexLiveProjection(threadId,result.turn.id);yield {type:'turn.started'};
    for(;;){if(failure)throw failure;const next=queue.shift();if(!next){await new Promise<void>(resolve=>{wake=resolve;});wake=undefined;continue;}
     for(const projected of projection.accept(next.method,next.params)){
      yield Object.assign(projected,{nativeSource:'codex-app-server'});
      if(projected.type==='turn.completed'||projected.type==='turn.failed')return;
     }
    }
   }finally{
    turn.signal?.removeEventListener('abort',abort);if(!closed&&child.pid)await terminateTree(child.pid);await ended;
   }
  }
  return {events:events()};
 }});
 return {startThread:settings=>thread(null,settings),resumeThread:(id,settings)=>thread(id,settings)};
}
