import fs from 'node:fs';
import {atomicJson,type Store,type State} from './store.js';
import {validate} from './schema.js';
import {resourceLimitsSchema,type ResourceLimits} from './resource-limits.js';
import {processingGuidance} from './steering.js';
import type {CallUsage} from './call-observation.js';
import {FlowError} from './failure.js';
import {auditRecords} from './context-trust.js';

export type ResourceState={limits:ResourceLimits;activeMs:number;activeSince:number|null;applied:string[];knownTokens:number;unknownCalls:number;operations:number;stagnant:number;replans:number;accepted:number};
const file='resource-control.json';
export function loadResources(store:Store,state:State):ResourceState{
 if(fs.existsSync(store.file(file))){const r=JSON.parse(fs.readFileSync(store.file(file),'utf8')) as ResourceState;
  validate(resourceLimitsSchema,r.limits);
  for(const key of ['activeMs','knownTokens','unknownCalls','operations','stagnant','replans','accepted'] as const)if(!Number.isSafeInteger(r[key])||r[key]<0)throw new FlowError('safety','Invalid resource ledger: '+key);
  if(r.activeSince!==null&&(!Number.isSafeInteger(r.activeSince)||r.activeSince<0)||!Array.isArray(r.applied)||r.applied.some(id=>typeof id!=='string'))throw new FlowError('safety','Invalid resource ledger');
  return r;
 }
 // Upgrade without erasing historical elapsed time; an unfinished call is conservatively charged on resume.
 let activeMs=0,activeSince:number|null=null,operations=0;
 for(const event of auditRecords(store.file('audit.jsonl'))){
  if(event.event==='agent-start')activeSince=Date.parse(event.time);
  if(event.event==='agent-finish'){const duration=event.data.durationMs;if(Number.isSafeInteger(duration)&&duration>=0)activeMs+=duration;activeSince=null;operations++;}
 }
 return {limits:state.config.resourceLimits??{activeMs:null,tokens:null},activeMs,activeSince,applied:[],knownTokens:0,unknownCalls:0,operations,stagnant:0,replans:0,accepted:state.completedTaskIds?.length??0};
}
export function saveResources(store:Store,r:ResourceState){atomicJson(store.file(file),r);}
/** Receipts are per-call deltas. Never add cached Codex input twice or sum ambiguous thread totals. */
export function resourceTokens(rows:CallUsage[]):{knownTokens:number;unknownCalls:number}{
 let knownTokens=0,unknownCalls=0;const unique=new Map(rows.map(row=>[row.callId,row]));
 for(const row of unique.values()){
  const codex=row.agent==='codex',safeScope=!codex||row.source==='codex-app-server-turn'||row.source==='codex-sdk-0.161.0-turn.completed-thread-delta'||!row.resumed&&row.source==='codex-sdk-0.161.0-turn.completed';
  const values=codex?[row.inputTokens,row.outputTokens]:[row.inputTokens,row.outputTokens,row.cacheReadTokens,row.cacheCreationTokens];
  if(!safeScope||row.completeness!=='complete'||row.status!=='success'||values.some(v=>v===null||!Number.isSafeInteger(v)||v!<0))unknownCalls++;
  if(safeScope)knownTokens+=values.reduce<number>((n,v)=>n+(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:0),0);
 }
 return {knownTokens,unknownCalls};
}
export function refreshResources(store:Store,state:State,r:ResourceState){
 const directory=store.file('context'),rows:CallUsage[]=[];let empty=0;
 if(fs.existsSync(directory))for(const name of fs.readdirSync(directory).filter(name=>name.endsWith('.usage.json'))){const text=fs.readFileSync(store.file('context/'+name),'utf8');if(!text.trim()){empty++;continue;}const row=JSON.parse(text) as CallUsage;if(row.runId!==state.id)throw new FlowError('safety','Usage receipt Run mismatch');rows.push(row);}
 const totals=resourceTokens(rows);r.knownTokens=Math.max(r.knownTokens,totals.knownTokens);r.unknownCalls=totals.unknownCalls+Math.max(empty,state.config.mode==='real'?Math.max(0,r.operations-rows.length):0);
 for(const message of processingGuidance(store))if(!r.applied.includes(message.id)){
  if(message.resourceLimits)r.limits=validate<ResourceLimits>(resourceLimitsSchema,message.resourceLimits);r.applied.push(message.id);r.stagnant=0;r.replans=0;
  store.audit('resource-limits-applied',{messageId:message.id,limits:r.limits,activeMs:r.activeMs,knownTokens:r.knownTokens});
 }
 if((state.completedTaskIds?.length??0)>r.accepted){r.accepted=state.completedTaskIds!.length;r.stagnant=0;r.replans=0;}
 saveResources(store,r);
}
export function resourceBlock(r:ResourceState,now=Date.now()):string|undefined{
 const elapsed=r.activeMs+(r.activeSince===null?0:Math.max(0,now-r.activeSince));
 if(r.limits.activeMs!==null&&elapsed>=r.limits.activeMs)return '已达到本次累计运行时间上限；调整投入后可继续原 Run';
 if(r.limits.tokens!==null){
  if(r.unknownCalls)return 'Token 用量记录不完整，无法保证阈值；保留现场，请调整投入或补齐计量后继续';
  if(r.knownTokens>=r.limits.tokens)return '已达到本次 Token 阈值；调整投入后可继续原 Run';
 }
}
export function resourceBrief(store:Store,state:State){
 if(!state.config.autonomousDevelopment&&!state.config.resourceLimits&&!fs.existsSync(store.file(file)))return undefined;
 const r=loadResources(store,state),elapsed=r.activeMs+(r.activeSince===null?0:Math.max(0,Date.now()-r.activeSince));
 return {remainingActiveMs:r.limits.activeMs===null?null:Math.max(0,r.limits.activeMs-elapsed),remainingKnownTokens:r.limits.tokens===null?null:Math.max(0,r.limits.tokens-r.knownTokens),unknownCalls:r.unknownCalls,instruction:'Fit remaining work to user limits. Preserve accepted results. Token threshold is checked at call boundaries and may overshoot within one call; unknown usage is not zero. Never extend limits yourself. Finish early when the goal is met.'};
}
