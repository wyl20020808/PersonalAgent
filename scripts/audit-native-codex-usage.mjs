// Read-only derived accounting. Never rewrites a Run audit or a native rollout.
// Usage: node scripts/audit-native-codex-usage.mjs <native-rollout.jsonl>
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const source=process.argv[2];
if(!source)throw Error('Supply an explicit native rollout path');
const raw=fs.readFileSync(source,'utf8'),turns=[];
let current=null,unattributedEvents=0;
const keys=['input_tokens','cached_input_tokens','output_tokens'];
for(const line of raw.trim().split('\n')){
 const row=JSON.parse(line),p=row.payload;
 if(row.type!=='event_msg')continue;
 if(p.type==='task_started'){
  current={turnId:p.turn_id,startedAt:row.timestamp,status:'incomplete',samples:0,before:null,last:null,compactionAccountingUnknown:false};turns.push(current);
 }else if(p.type==='task_complete'&&current&&p.turn_id===current.turnId){current.status='completed';current=null;}
 else if(p.type==='token_count'&&p.info){
  if(!current){unattributedEvents++;continue;}
  const {total_token_usage:t,last_token_usage:l}=p.info;
  if(!t||!l)continue;
  // Compaction may report context size while reporting zero consumption. Do not treat it as free.
  if(l.input_tokens===0&&l.output_tokens===0&&l.total_tokens>0)current.compactionAccountingUnknown=true;
  if(JSON.stringify(t)===JSON.stringify(current.last))continue;
  current.before??=Object.fromEntries(keys.map(k=>[k,Number.isSafeInteger(t[k])&&Number.isSafeInteger(l[k])?t[k]-l[k]:null]));
  current.last=t;current.samples++;
 }
}
const results=turns.map(({before,last,...turn})=>({...turn,usage:Object.fromEntries(keys.map(k=>[k,before?.[k]!==null&&before?.[k]!==undefined&&Number.isSafeInteger(last?.[k])&&last[k]>=before[k]?last[k]-before[k]:null]))}));
console.log(JSON.stringify({source,sourceHash:createHash('sha256').update(raw).digest('hex'),unattributedEvents,turns:results,note:'Derived native protocol totals, not billing. Incomplete turns and compaction overhead may be unreported; no historical audit was rewritten.'},null,2));
