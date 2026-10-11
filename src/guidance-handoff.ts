import { AsyncLocalStorage } from 'node:async_hooks';
import type { Store } from './store.js';
import { pendingGuidance } from './steering.js';
import { FlowError } from './failure.js';

type HandoffContext={tools:Set<string>;blocked?:string;check?:()=>void};
const context=new AsyncLocalStorage<HandoffContext>();
export class GuidanceHandoff extends Error {
 constructor(readonly forced:boolean){super('用户引导：当前调用已退出，交给决策者调整');}
}
/** Scoped to one Controller call, including adapter callbacks and remote event consumers. */
export function guidanceTool(id:string,running:boolean):void {
 const current=context.getStore();if(!current)return;
 if(running)current.tools.add(id);else {current.tools.delete(id);current.check?.();}
}
export function blockGuidanceHandoff(reason:string):void {const current=context.getStore();if(current)current.blocked=reason;}
export function codexGuidanceBoundary(event:any):void {
 if(!['item.started','item.updated','item.completed'].includes(event?.type)||!['command_execution','file_change','mcp_tool_call'].includes(event.item?.type))return;
 guidanceTool('codex:'+event.item.id,event.type!=='item.completed');
}
export function opencodeGuidanceBoundary(part:any):void {
 if(part?.type==='tool')guidanceTool('opencode:'+part.id,['pending','running'].includes(part.state?.status));
}
export async function withGuidanceHandoff<T>(store:Store,outer:AbortSignal,operation:(signal:AbortSignal)=>Promise<T>,graceMs=55000):Promise<T>{
 const current:HandoffContext={tools:new Set()},interruption=new AbortController();
 let requestedAt=0,forced=false,failure:Error|undefined;
 const signal=AbortSignal.any([outer,interruption.signal]);
 const poll=()=>{
  if(outer.aborted||interruption.signal.aborted)return;
  try{
   if(!pendingGuidance(store).length){requestedAt=0;return;}
   requestedAt ||= Date.now();
   forced=current.tools.size>0&&Date.now()-requestedAt>=graceMs;
   if(!current.tools.size||forced)interruption.abort();
  }catch(error){failure=error as Error;interruption.abort();}
 };
 return context.run(current,async()=>{
  current.check=poll;
  const timer=setInterval(poll,250);poll();
  try{
   let output:T|undefined,error:unknown;
   try{output=await operation(signal);}catch(caught){error=caught;}
   if(outer.aborted)throw error??new Error('Stopped');
   if(failure)throw failure;
   if(current.blocked)throw new FlowError('interrupted',current.blocked);
   if(interruption.signal.aborted){
    // Scope, repository integrity and policy failures must never be hidden by a queued message.
    if(error instanceof FlowError&&['safety','git','git-integrity'].includes(error.kind))throw error;
    throw new GuidanceHandoff(forced);
   }
   if(error)throw error;
   return output as T;
  }finally{clearInterval(timer);}
 });
}
