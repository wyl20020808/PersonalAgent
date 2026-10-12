import {Worker} from 'node:worker_threads';

// Audit verification and projection must not run on Electron's event loop.
export const historyOperations=new Set(['thread','detail','pictures','messageEvidence','readChatFile']);
export class HistoryReader {
 private worker:Worker|undefined;
 private sequence=0;
 private readonly pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;key:string}>();
 private readonly requests=new Map<string,Promise<any>>();
 constructor(private readonly root:string,private readonly data:string,private readonly node:string){}
 read(request:unknown):Promise<any>{
  const key=JSON.stringify(request),existing=this.requests.get(key);if(existing)return existing;
  if(this.pending.size>=32)return Promise.reject(Error('History reader busy; retry after current refresh'));
  if(!this.worker){
   const worker=new Worker(new URL('./historyWorker.js',import.meta.url),{workerData:{root:this.root,data:this.data,node:this.node}});this.worker=worker;
   worker.on('message',({id,value,error})=>{const entry=this.pending.get(id);if(!entry)return;this.pending.delete(id);this.requests.delete(entry.key);error?entry.reject(Error(error)):entry.resolve(value);});
   const fail=(error:Error)=>{if(this.worker!==worker)return;this.worker=undefined;for(const entry of this.pending.values())entry.reject(error);this.pending.clear();this.requests.clear();};
   worker.on('error',fail);worker.on('exit',code=>fail(Error(`History reader exited (${code})`)));
  }
  const id=++this.sequence,promise=new Promise<any>((resolve,reject)=>{this.pending.set(id,{resolve,reject,key});});this.requests.set(key,promise);this.worker.postMessage({id,request});return promise;
 }
 async close(){const worker=this.worker;this.worker=undefined;for(const entry of this.pending.values())entry.reject(Error('History reader closed'));this.pending.clear();this.requests.clear();await worker?.terminate();}
}
