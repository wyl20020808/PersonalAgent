import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DesktopService,validateRequest,redact} from './service.js';
import {git} from '../../dist/src/workspace.js';
const root='D:/PersonalAgent',data=path.join(root,'.validation','desktop-unit-'+randomUUID());
const service=new DesktopService(root,data,process.execPath);
let profileId='',runId='',target='',head='';
async function wait(phase:string){for(let n=0;n<150;n++){const detail=service.detail(profileId,runId);if(detail.run.phase===phase)return detail.run;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out waiting for '+phase);}
test('IPC rejects generic shell, extra fields, path-shaped IDs and malformed approval digests',()=>{
 for(const r of [{operation:'shell',command:'whoami'},{operation:'toString'},{operation:'__proto__'},{operation:'overview',path:'C:/secret'},{operation:'detail',profileId:'../x',runId:randomUUID()},{operation:'approve',profileId:randomUUID(),runId:randomUUID(),deliveryId:randomUUID(),digest:'bad',decision:'approve'}])assert.throws(()=>validateRequest(r));
});
test('sensitive diagnostics are redacted before entering Renderer',()=>{const text=redact('api_key=sk-test1234567890 Bearer abcd1234 refresh_token=privatevalue');assert.ok(!text.includes('sk-test')&&!text.includes('abcd1234')&&!text.includes('privatevalue'));});

test('configuration import accepts optional D path but never bypasses native trust confirmation',async()=>{
 assert.deepEqual(validateRequest({operation:'importProfile'}),{operation:'importProfile'});
 for(const file of ['D:/fixtures/config.json','D:\\fixtures\\config.json'])assert.equal(validateRequest({operation:'importProfile',file}).file,file);
 for(const file of ['C:/config.json','../config.json','\\\\server\\config.json',''])assert.throws(()=>validateRequest({operation:'importProfile',file}));
 await assert.rejects(service.dispatch({operation:'importProfile',file:'D:/fixtures/config.json'}),/Native file dialog required/);
});
test('create isolated Mock profile without touching delivered games',async()=>{await service.prepareMock();const p=service.overview().profiles[0]!;profileId=p.id;target=p.repositories[0]!;head=await git(target,['rev-parse','HEAD']);assert.equal(p.mode,'mock');assert.equal(await git(target,['status','--porcelain']),'');assert.equal(service.overview().runs.length,0);});
test('trusted upper limits and repository whitelist cannot be expanded by GUI',async()=>{
 const request={operation:'start' as const,profileId,repository:target,goal:'Mock flow',maxClaudeCalls:5,maxLoops:4,maxReworks:1};
 await assert.rejects(service.dispatch({...request,repository:'D:/OpenWorld'}),/authorized/);
 await assert.rejects(service.dispatch({...request,maxLoops:5}),/预算超出可信配置/);
 await assert.rejects(service.dispatch({...request,maxClaudeCalls:6}),/预算超出可信配置/);
});
test('native CLI executes full Mock cycle, returns actual tests and durable session IDs',async()=>{const r=await service.dispatch({operation:'start',profileId,repository:target,goal:'GUI integration: create verified markers',maxClaudeCalls:5,maxLoops:4,maxReworks:1}) as any;runId=r.id;const done=await wait('completed');assert.equal(done.loops,2);assert.equal(done.claudeCalls,0);assert.equal(done.evidence?.passed,true);assert.ok(done.claudeSessionId&&done.codexThreadId);assert.equal(fs.existsSync(path.join(target,'hello.txt')),false);assert.ok(service.detail(profileId,runId).auditVerified);});
test('application without explicit approval is rejected and target remains clean',async()=>{const d=await service.dispatch({operation:'preview',profileId,runId,target,branch:'desktop-delivery'}) as any;await assert.rejects(service.dispatch({operation:'apply',profileId,runId,deliveryId:d.id}),/approv/i);assert.equal(await git(target,['status','--porcelain']),'');});
test('separate digest-bound approval and apply safely deliver only generated markers',async()=>{const d=(await service.deliveries(profileId,runId))[0]!;await assert.rejects(service.dispatch({operation:'approve',profileId,runId,deliveryId:d.id,digest:'0'.repeat(64),decision:'Explicit Mock approval'}),/digest/i);await service.dispatch({operation:'approve',profileId,runId,deliveryId:d.id,digest:d.digest,decision:'Explicit automated approval for this isolated Mock fixture only'});assert.equal(fs.existsSync(path.join(target,'hello.txt')),false);await service.dispatch({operation:'apply',profileId,runId,deliveryId:d.id});assert.equal(fs.readFileSync(path.join(target,'hello.txt'),'utf8'),'hello\n');assert.equal(await git(target,['rev-parse','HEAD']),head);assert.equal(await git(target,['diff','--cached','--name-only']),'');});
test('changed registered configuration is refused rather than silently trusted',()=>{const entry=service.registry().profiles[0]!;const original=fs.readFileSync(entry.file);fs.writeFileSync(entry.file,Buffer.concat([original,Buffer.from('\n')]));assert.throws(()=>service.config(profileId),/配置已改变/);fs.writeFileSync(entry.file,original);});
test('read-only historic profiles cannot start, stop, resume or approve',async()=>{const entry=service.registry().profiles[0]!;service.register(entry.file,true);await assert.rejects(service.dispatch({operation:'stop',profileId,runId}),/只读/);await assert.rejects(service.dispatch({operation:'start',profileId,repository:target,goal:'do not run',maxClaudeCalls:5,maxLoops:4,maxReworks:1}),/只读/);service.register(entry.file,false);});
test('preferences persist across service restarts',async()=>{await service.dispatch({operation:'preferences',reducedMotion:true});const restarted=new DesktopService(root,data,process.execPath);assert.equal(restarted.overview().reducedMotion,true);assert.equal(restarted.overview().runs[0]?.id,runId);});
test('real mode refuses missing explicit consumption acknowledgement without calling services',async()=>{const entry=service.registry().profiles[0]!;const config=JSON.parse(fs.readFileSync(entry.file,'utf8'));config.mode='real';const file=path.join(data,'real.config.json');fs.writeFileSync(file,JSON.stringify(config));service.register(file);const p=service.overview().profiles.find(p=>p.mode==='real')!;await assert.rejects(service.dispatch({operation:'start',profileId:p.id,repository:target,goal:'must never run',maxClaudeCalls:5,maxLoops:4,maxReworks:1}),/authorization/);});
test('audit tampering blocks UI detail instead of displaying forged evidence',()=>{const store=service.store(profileId,runId),file=store.file('audit.jsonl'),original=fs.readFileSync(file);fs.appendFileSync(file,'{"hash":"fake","previousHash":"bad"}\n');assert.throws(()=>service.detail(profileId,runId),/integrity/);fs.writeFileSync(file,original);});
test('concurrent delivery polling is serialized without bypassing Controller locks',async()=>{
 const results=await Promise.all(Array.from({length:6},()=>service.deliveries(profileId,runId)));
 assert.ok(results.every(deliveries=>deliveries[0]?.phase==='applied'));
 assert.ok(service.detail(profileId,runId).auditVerified);
});
