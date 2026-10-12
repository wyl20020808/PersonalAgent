import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {AuditReader} from './auditReader.js';
import {HistoryReader} from './historyReader.js';
import {fileURLToPath} from 'node:url';
function line(previousHash:string,text:string){const payload={previousHash,time:'2026-10-12T00:00:00Z',event:'agent-activity',data:{text}};const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');return {hash,json:JSON.stringify({...payload,hash})+'\n'};}
test('large UTF-8 records cross chunks; unchanged reads share only verified cache; append and rewrite revalidate',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'audit-reader-')),file=path.join(dir,'audit.jsonl'),reader=new AuditReader();
 try{const first=line('','道路建筑'.repeat(100000));fs.writeFileSync(file,first.json);const events=reader.read(file);assert.equal(events[0].data.text,'道路建筑'.repeat(100000));assert.equal(reader.read(file),events);
 const second=line(first.hash,'new output');fs.appendFileSync(file,second.json);assert.equal(reader.read(file).length,2);
 fs.writeFileSync(file,first.json.replace('道路','路道')+second.json);assert.throws(()=>reader.read(file),/integrity/);
 fs.writeFileSync(file,first.json);assert.equal(reader.read(file).length,1);
 fs.unlinkSync(file);assert.deepEqual(reader.read(file),[]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('owned history worker coalesces reads, rejects mutation and closes cleanly',async()=>{
 const root=fileURLToPath(new URL('../..',import.meta.url)),dir=fs.mkdtempSync('D:/PersonalAgent-data/history-reader-test-'),reader=new HistoryReader(root,dir,process.execPath);
 try{const request={operation:'thread',profileId:'95b07a05-6350-48f7-822b-bfe6db3634ef',runId:'fbd7645c-e909-47e6-86f1-ad4bca135515'},first=reader.read(request);assert.equal(reader.read(request),first);await assert.rejects(first,/Profile is not registered/);
 await assert.rejects(reader.read({operation:'stop',profileId:'95b07a05-6350-48f7-822b-bfe6db3634ef',runId:'fbd7645c-e909-47e6-86f1-ad4bca135515'}),/read operations only/);
 }finally{await reader.close();fs.rmSync(dir,{recursive:true,force:true});}
});
