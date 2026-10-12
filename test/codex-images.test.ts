import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {observeCodexImages} from '../src/codex-images.js';
const time='2026-10-12T08:00:00Z';
function fixture(){const root=path.resolve('.validation','image-receipts-'+randomUUID()),workspace=path.join(root,'source'),id=randomUUID(),sessions=path.join(root,'sessions');fs.mkdirSync(sessions,{recursive:true});const file=path.join(sessions,'rollout-'+id+'.jsonl');return{root,workspace,id,file};}
const event=(id:string,image='D:/proof/进度.png')=>({timestamp:time,type:'event_msg',payload:{type:'item_completed',thread_id:id,item:{type:'ImageView',id:'view-1',path:image}}});
test('native image receipts are incremental, deduplicated and bound to Thread workspace and time',()=>{
 const f=fixture(),received:any[]=[];fs.writeFileSync(f.file,JSON.stringify({type:'session_meta',payload:{id:f.id,cwd:f.workspace}})+'\n'+JSON.stringify(event(f.id))+'\n');
 const observer=observeCodexImages(f.workspace,()=>f.id,e=>received.push(e),f.root,Date.parse(time));observer.poll();observer.poll();
 assert.equal(received.length,1);assert.equal(JSON.parse(received[0].text).input.path,'D:/proof/进度.png');
 fs.appendFileSync(f.file,JSON.stringify(event(randomUUID()))+'\n'+JSON.stringify({...event(f.id),timestamp:'2026-10-11T08:00:00Z'})+'\n'+JSON.stringify({type:'message',text:'PRIVATE_REASONING'})+'\n');observer.finish();assert.equal(received.length,1);
 const other=observeCodexImages('D:/wrong',()=>f.id,e=>received.push(e),f.root,Date.parse(time));other.finish();assert.equal(received.length,1);
});
test('native image reader handles partial UTF-8 lines and skips binary-sized records',()=>{
 const f=fixture(),received:any[]=[];fs.writeFileSync(f.file,JSON.stringify({type:'session_meta',payload:{id:f.id,cwd:f.workspace}})+'\n'+JSON.stringify({payload:'x'.repeat(90000)})+'\n');
 const record=Buffer.from(JSON.stringify(event(f.id))+'\n'),split=record.indexOf(Buffer.from('进'))+1;fs.appendFileSync(f.file,record.subarray(0,split));
 const observer=observeCodexImages(f.workspace,()=>f.id,e=>received.push(e),f.root,Date.parse(time));observer.poll();assert.equal(received.length,0);fs.appendFileSync(f.file,record.subarray(split));observer.finish();assert.equal(received.length,1);assert.equal(JSON.parse(received[0].text).input.path,'D:/proof/进度.png');
});
