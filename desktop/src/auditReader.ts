import fs from 'node:fs';
import {StringDecoder} from 'node:string_decoder';
import {createHash} from 'node:crypto';

// Keep at most two histories and 128 MiB of source data. Never cache an
// unverified tail; file rewrites/appends invalidate the complete chain.
export class AuditReader {
 private readonly cache=new Map<string,{stamp:string;bytes:number;events:any[]}>();
 read(file:string):any[]{
  if(!fs.existsSync(file)){this.cache.delete(file);return [];}
  const stat=fs.statSync(file,{bigint:true}),stamp=`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
  const cached=this.cache.get(file);if(cached?.stamp===stamp)return cached.events;
  this.cache.delete(file);
  const bytes=Number(stat.size),limit=128*1024*1024;
  while(this.cache.size&&(this.cache.size>=2||[...this.cache.values()].reduce((sum,row)=>sum+row.bytes,bytes)>limit))this.cache.delete(this.cache.keys().next().value!);
  const events:any[]=[],decoder=new StringDecoder('utf8'),buffer=Buffer.allocUnsafe(256*1024),descriptor=fs.openSync(file,'r');let pending='',previous='';
  const parse=(line:string)=>{if(!line.trim())return;const record=JSON.parse(line),{hash,...payload}=record;if(payload.previousHash!==previous||createHash('sha256').update(JSON.stringify(payload)).digest('hex')!==hash)throw Error('Audit integrity failure');previous=hash;events.push(record);};
  try{let read=0,remaining=bytes;while(remaining>0&&(read=fs.readSync(descriptor,buffer,0,Math.min(buffer.length,remaining)))>0){remaining-=read;pending+=decoder.write(buffer.subarray(0,read));let start=0,index=0;while((index=pending.indexOf('\n',start))>=0){parse(pending.slice(start,index));start=index+1;}pending=pending.slice(start);}if(remaining)throw Error('Audit changed during read; retry current refresh');pending+=decoder.end();if(pending.trim())parse(pending);}
  finally{fs.closeSync(descriptor);}
  const after=fs.statSync(file,{bigint:true});if(after.ino!==stat.ino||after.dev!==stat.dev||after.size<stat.size||after.size===stat.size&&(after.mtimeNs!==stat.mtimeNs||after.ctimeNs!==stat.ctimeNs))throw Error('Audit changed during read; retry current refresh');
  if(bytes<=limit)this.cache.set(file,{stamp,bytes,events});return events;
 }
}
