/** Coalesce bursts into one follow-up. Never overlap reads or multiply timers. */
export function refreshLoop(read:()=>Promise<void>, interval=1500, retry=3000) {
 let stopped=false, running=false, again=false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const refresh=async()=>{
  if(stopped)return;
  if(running){again=true;return;}
  clearTimeout(timer);running=true;let delay=interval;
  try{await read();}catch{delay=retry;}finally{
   running=false;
   if(!stopped){timer=setTimeout(()=>void refresh(),again?0:delay);again=false;}
  }
 };
 void refresh();
 return {refresh:()=>void refresh(),stop:()=>{stopped=true;clearTimeout(timer);}};
}
