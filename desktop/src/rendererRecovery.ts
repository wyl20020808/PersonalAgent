import type {BrowserWindow} from 'electron';

/** Reload only the renderer; the Controller and its children remain owned by the main process. */
export function installRendererRecovery(window:BrowserWindow,options:{
 quitting:()=>boolean;
 allowed:()=>boolean;
 log:(entry:Record<string,unknown>)=>void;
 now?:()=>number;
 schedule?:(callback:()=>void,delay:number)=>ReturnType<typeof setTimeout>;
 cancel?:(timer:ReturnType<typeof setTimeout>)=>void;
}){
 const now=options.now??Date.now,schedule=options.schedule??setTimeout,cancel=options.cancel??clearTimeout;
 const interval=10*60*1000;
 let attempts:number[]=[],timer:ReturnType<typeof setTimeout>|undefined,disposed=false,loading=false,pending=false;
 const unavailable=()=>disposed||options.quitting()||window.isDestroyed()||window.webContents.isDestroyed();
 const log=(entry:Record<string,unknown>)=>{try{options.log(entry);}catch{/* Diagnostics must never prevent recovery. */}};
 const clear=()=>{if(timer!==undefined)cancel(timer);timer=undefined;};
 const queue=()=>{
  if(unavailable()||timer!==undefined||loading||!pending)return;
  attempts=attempts.filter(time=>now()-time<interval);
  const delay=attempts.length>=2?Math.max(1000,attempts[0]!+interval-now()):1000;
  if(delay>1000)log({event:'renderer-recovery-cooldown',delay});
  timer=schedule(()=>{timer=undefined;void reload();},delay);
 };
 const reload=async()=>{
  if(unavailable()||loading)return;
  if(!options.allowed()){
   pending=true;log({event:'renderer-recovery-deferred',reason:'deferred_by_work_mode'});
   timer=schedule(()=>{timer=undefined;void reload();},10000);return;
  }
  pending=false;loading=true;attempts=attempts.filter(time=>now()-time<interval);attempts.push(now());
  log({event:'renderer-reload-start'});
  try{await window.loadURL('personalagent://app/index.html');log({event:'renderer-reload-complete'});}
  catch(error){pending=true;log({event:'renderer-reload-failed',error:String(error)});}
  finally{loading=false;queue();}
 };
 const gone=(_event:unknown,details:{reason:string;exitCode:number})=>{
  log({event:'renderer-process-gone',...details});
  if(details.reason==='clean-exit'||unavailable())return;
  pending=true;queue();
 };
 const recover=()=>{if(unavailable()||loading)return;clear();attempts=[];pending=true;void reload();};
 const dispose=()=>{disposed=true;clear();window.webContents.removeListener('render-process-gone',gone);};
 window.webContents.on('render-process-gone',gone);
 window.once('closed',dispose);
 return {recover,dispose};
}
