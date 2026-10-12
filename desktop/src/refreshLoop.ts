/** Coalesce bursts into one follow-up. Never overlap reads or multiply timers. */
export function refreshLoop(read:()=>Promise<void>, interval=1500, retry=3000) {
 let stopped=false, running=false, again=false,lastStart=-Infinity;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const refresh=async()=>{
  if(stopped)return;
  if(running){again=true;return;}
  const wait=100-(Date.now()-lastStart);
  if(wait>0){clearTimeout(timer);timer=setTimeout(()=>void refresh(),wait);return;}
  clearTimeout(timer);running=true;lastStart=Date.now();let delay=interval;
  try{await read();}catch{delay=retry;}finally{
   running=false;
   if(!stopped){timer=setTimeout(()=>void refresh(),again?Math.max(0,100-(Date.now()-lastStart)):delay);again=false;}
  }
 };
 void refresh();
 return {refresh:()=>void refresh(),stop:()=>{stopped=true;clearTimeout(timer);}};
}
