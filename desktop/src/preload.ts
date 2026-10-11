import {contextBridge,ipcRenderer} from 'electron';
import type {Request} from './types.js';
const subscriptions=new Map<string,number>();
contextBridge.exposeInMainWorld('personalAgent',Object.freeze({
 invoke:(request:Request)=>ipcRenderer.invoke('personalagent:request',request),
 subscribe:(profileId:string,runId:string,onUpdate:()=>void)=>{
  const channel=`personalagent:thread:${profileId}:${runId}`,listener=()=>onUpdate();let disposed=false;
  ipcRenderer.on(channel,listener);const count=subscriptions.get(channel)??0;subscriptions.set(channel,count+1);
  if(!count)void ipcRenderer.invoke('personalagent:subscribe',{profileId,runId}).catch(()=>{/* Polling remains authoritative when watching is unavailable. */});
  return()=>{if(disposed)return;disposed=true;ipcRenderer.removeListener(channel,listener);const remaining=(subscriptions.get(channel)??1)-1;if(remaining)subscriptions.set(channel,remaining);else{subscriptions.delete(channel);void ipcRenderer.invoke('personalagent:unsubscribe',{profileId,runId}).catch(()=>{});}};
 }
}));
