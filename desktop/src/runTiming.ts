export type RunTiming={decisionMs:number;executionMs:number;running:'decision'|'execution'|null;since:string|null};
type Event={time:string;event:string;data?:{phase?:string}};
const role=(phase:string)=>['planning','review'].includes(phase)?'decision':['execute','executing','applying'].includes(phase)?'execution':null;

/** Reconstruct elapsed stage time from Controller records, excluding human waits and verification. */
export function runTiming(events:Event[]):RunTiming {
 const result:RunTiming={decisionMs:0,executionMs:0,running:null,since:null};
 let phase='',since:number|null=null;
 for(const event of events){
  const time=Date.parse(event.time);if(!Number.isFinite(time))continue;
  const next=event.event==='created'?'planning':event.event==='transition'?event.data?.phase:undefined;
  if(!next)continue;
  const current=role(phase);
  if(current&&since!==null)result[current==='decision'?'decisionMs':'executionMs']+=Math.max(0,time-since);
  phase=next;since=time;
 }
 result.running=role(phase);result.since=result.running&&since!==null?new Date(since).toISOString():null;
 return result;
}

export function timingTotals(items:RunTiming[],now:number){
 const total={decisionMs:0,executionMs:0};
 for(const item of items){total.decisionMs+=item.decisionMs;total.executionMs+=item.executionMs;
  if(item.running&&item.since){const since=Date.parse(item.since);if(Number.isFinite(since))total[item.running==='decision'?'decisionMs':'executionMs']+=Math.max(0,now-since);}
 }
 return total;
}
export function durationLabel(ms:number){const seconds=Math.floor(Math.max(0,ms)/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds/60)%60;return (hours?hours+':':'')+String(hours?minutes:Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
