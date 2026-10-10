import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DesktopService,validateRequest,redact} from './service.js';
import {git} from '../../dist/src/workspace.js';
import {createRun} from '../../dist/src/controller.js';
import {mockContextDocuments,loadProjectContext} from '../../dist/src/project-context.js';
import {prepareContextConfirmation} from '../../dist/src/context-confirmation.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),data=path.join(root,'.v3c3','s-'+randomUUID().slice(0,8));
const service=new DesktopService(root,data,process.execPath);

test('MAIN cannot acquire writable profiles inside claimed DEV data, including junction aliases; history remains read-only',()=>{
 const previous=process.env.PERSONALAGENT_INSTANCE;process.env.PERSONALAGENT_INSTANCE='main';
 try{const local=new DesktopService(root,path.join(data,'main-ownership'),process.execPath);const foreign=path.join(data,'claimed-dev'),alias=path.join(data,'dev-alias');fs.mkdirSync(foreign,{recursive:true});fs.writeFileSync(path.join(foreign,'instance.json'),JSON.stringify({version:1,instanceId:'dev'}));fs.symlinkSync(foreign,alias,'junction');
  for(const directory of [foreign,alias]){const file=path.join(data,'foreign-'+randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify({allowedRepositories:[data],runtimeDir:path.join(directory,'runtime'),mode:'mock',claudeExecutable:'NEVER-PAID',timeoutMs:30000,maxLoops:2,maxReworks:1,tests:[],mockScenario:'pass'}));assert.throws(()=>local.register(file),/another instance/);local.register(file,true);const entry=local.registry().profiles.find(p=>p.file===file)!;assert.throws(()=>local.writable(entry.id),/只读/);}
 }finally{if(previous===undefined)delete process.env.PERSONALAGENT_INSTANCE;else process.env.PERSONALAGENT_INSTANCE=previous;}
});
test('DEV rejects writable external runtimes while explicit historical replay remains read-only',()=>{
 const previous=process.env.PERSONALAGENT_INSTANCE,localData=path.join(data,'dev-ownership');
 try{process.env.PERSONALAGENT_INSTANCE='dev';const local=new DesktopService(root,localData,process.execPath);
  const file=path.join(data,'external-runtime.json');fs.writeFileSync(file,JSON.stringify({allowedRepositories:[data],runtimeDir:path.join(data,'outside-dev'),mode:'mock',claudeExecutable:'unused',timeoutMs:30000,maxLoops:2,maxReworks:1,tests:[],mockScenario:'pass'}));
  assert.throws(()=>local.register(file),/DEV writable Controller runtime/);const replay=local.register(file,true);assert.equal(replay.profiles.length,1);assert.equal(replay.profiles[0]!.readOnly,true);
 }finally{if(previous===undefined)delete process.env.PERSONALAGENT_INSTANCE;else process.env.PERSONALAGENT_INSTANCE=previous;}
});
test('formal document decision service binds request, rejects stale digest and preserves isolated Delivery boundary',async()=>{
 const directory=path.join(data,'context2'),source=path.join(directory,'source');fs.mkdirSync(path.join(source,'src'),{recursive:true});fs.writeFileSync(path.join(source,'src/main.ts'),'export const fixture=true;\n');
 for(const [relative,content] of Object.entries(mockContextDocuments(randomUUID(),'src/main.ts'))){const file=path.join(source,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
 const relative='docs/project-context/contracts/local.md';fs.mkdirSync(path.join(source,'docs/project-context/contracts'));fs.writeFileSync(path.join(source,relative),'---\nschema: 1\nkind: contract\nid: local\ntitle: Mock 正式确认\nmodules: [fixture]\nstatus: proposed\nbasis: {kind: agent-proposal, ref: Mock}\n---\n## 约束\nMock 内容\n## 检查方式\nMock 核对\n');
 fs.writeFileSync(path.join(source,'.gitattributes'),'* text eol=lf\n');await git(source,['init']);await git(source,['add','.']);await git(source,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Local context fixture']);
 const config={mode:'mock' as const,allowedRepositories:[source],runtimeDir:path.join(directory,'runtime'),projectMode:'isolated' as const,executionMode:'native' as const,claudeExecutable:'NEVER-PAID',timeoutMs:30000,maxLoops:2,maxReworks:1,maxClaudeCalls:4,tests:[],mockScenario:'pass' as const};
 const file=path.join(directory,'config.json');fs.writeFileSync(file,JSON.stringify(config));const local=new DesktopService(root,path.join(directory,'data'),process.execPath);local.register(file);const profileId=local.overview().profiles[0]!.id;
 const store=await createRun(config,source,'Mock 正式确认');const state=store.load();state.phase='paused';state.nextPhase='verify';store.save(state);const request=prepareContextConfirmation(store,relative,'accepted');
 assert.equal(local.detail(profileId,store.id).run.contextConfirmations![0]!.content,request.content);
 await assert.rejects(local.dispatch({operation:'contextDecide',profileId,runId:store.id,requestId:request.id,digest:'a'.repeat(64),decision:'Mock'}),/摘要不匹配/);
 await local.dispatch({operation:'contextDecide',profileId,runId:store.id,requestId:request.id,digest:request.requestHash,decision:'Mock 正式拒绝',contextAction:'rejected'});
 assert.equal((loadProjectContext(state.workspace,true,{runtimeDir:config.runtimeDir,source}) as import('../../src/project-context.js').ProjectContext).contracts[0]!.trust!.effectiveStatus,'rejected');assert.equal(loadProjectContext(source).contracts[0]!.metadata.status,'proposed');assert.equal(local.children.size,0);
 assert.equal(local.detail(profileId,store.id).run.contextConfirmations!.length,0);
});
test('document decision IPC schema rejects extra approval fields and unsupported status actions',()=>{
 const request={operation:'contextDecide',profileId:randomUUID(),runId:randomUUID(),requestId:randomUUID(),digest:'a'.repeat(64),decision:'Mock'};
 assert.equal(validateRequest(request).operation,'contextDecide');assert.throws(()=>validateRequest({...request,contextAction:'superseded'}),/JSON Schema/);assert.throws(()=>validateRequest({...request,deliveryApproved:true}),/JSON Schema/);
});
test('ordinary project detection reads scripts without executing them and requires direct permission without paid authorization',()=>{
 const project=path.join(data,'ordinary');fs.mkdirSync(project,{recursive:true});fs.writeFileSync(path.join(project,'package.json'),JSON.stringify({scripts:{test:'throw never execute',build:'throw never execute'}}));
 const info=service.inspectProject(project);assert.equal(info.git,false);assert.equal(info.kind,'Node.js');assert.deepEqual(info.testCommands,['npm run test']);assert.equal(info.settings.projectMode,'direct');assert.equal(info.settings.mode,'real');assert.equal(info.directAuthorized,false);
 assert.throws(()=>service.inspectProject('relative'),/绝对/);assert.throws(()=>service.validateProjectStart({operation:'startProject',projectPath:project,goal:'test',projectMode:'direct',mode:'mock'}),/明确授权/);
 assert.doesNotThrow(()=>service.validateProjectStart({operation:'startProject',projectPath:project,goal:'test',projectMode:'isolated',mode:'real'}));
 assert.equal(service.validateProjectStart({operation:'startProject',projectPath:project,goal:'test',projectMode:'direct',mode:'mock',directAcknowledged:true}).path,fs.realpathSync(project));
});
test('Mock refuses preexisting user marker contents before config creation or Agent launch',async()=>{
 const project=path.join(data,'collision');fs.mkdirSync(project,{recursive:true});fs.writeFileSync(path.join(project,'hello.txt'),'user data');
 await assert.rejects(service.startProject({operation:'startProject',projectPath:project,goal:'test',projectMode:'direct',mode:'mock',directAcknowledged:true,maxClaudeCalls:5,maxLoops:4,maxReworks:1}),/拒绝覆盖/);
 assert.equal(fs.readFileSync(path.join(project,'hello.txt'),'utf8'),'user data');assert.equal(service.children.size,0);
});
test('automatic config starts authorized non-Git Direct and explicitly fails unavailable isolation without fallback',async()=>{
 const service=new DesktopService(root,path.join(data,'auto'),process.execPath);
 const projects=path.join(data,'projects');fs.mkdirSync(projects,{recursive:true});
 for(const projectMode of ['direct','isolated'] as const){
  const project=path.join(projects,projectMode);fs.mkdirSync(project,{recursive:true});fs.writeFileSync(path.join(project,'user.txt'),'existing user work');
  const run=await service.dispatch({operation:'startProject',projectPath:project,goal:'Create local Mock fixture markers only',projectMode,mode:'mock',directAcknowledged:true,maxClaudeCalls:5,maxLoops:4,maxReworks:1}) as any;
  let result:any;for(let i=0;i<150;i++){result=service.detail(run.profileId,run.id).run;if(['completed','failed','paused'].includes(result.phase)&&!result.active)break;await new Promise(resolve=>setTimeout(resolve,100));}
  if(projectMode==='isolated'){assert.equal(result.phase,'failed');assert.match(result.reason,/no longer automatic/);assert.equal(result.projectMode,'isolated');assert.equal(fs.existsSync(path.join(project,'hello.txt')),false);assert.equal(fs.readFileSync(path.join(project,'user.txt'),'utf8'),'existing user work');assert.equal(service.audit(service.store(run.profileId,run.id)).some(e=>e.event==='agent-start'),false);continue;}
  assert.equal(result.phase,'completed',result.reason);assert.equal(result.projectMode,projectMode);assert.equal(fs.readFileSync(path.join(project,'user.txt'),'utf8'),'existing user work');assert.equal(fs.existsSync(path.join(project,'.git')),false);
  assert.equal(fs.existsSync(path.join(project,'hello.txt')),projectMode==='direct');assert.ok(fs.readFileSync(path.join(result.workspace,`mock-result-${run.id}.txt`),'utf8').includes('任务 done'));
  if(projectMode==='direct')assert.ok(await service.dispatch({operation:'preview',profileId:run.profileId,runId:run.id,target:project,branch:'direct'}));
  const reopened=new DesktopService(root,service.data,process.execPath);assert.equal(reopened.overview().runs.filter(r=>r.id===run.id).length,1);assert.equal(reopened.inspectProject(project).settings.projectMode,projectMode);assert.equal(reopened.inspectProject(project).directAuthorized,projectMode==='direct');assert.ok(reopened.overview().recentProjects?.some(p=>p.path===fs.realpathSync(project)));
 }
});
let profileId='',runId='',target='',head='';
async function wait(phase:string){for(let n=0;n<150;n++){const detail=service.detail(profileId,runId);if(detail.run.phase===phase&&!detail.run.active)return detail.run;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out waiting for '+phase);}
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
test('create authorized Direct Mock profile without touching delivered games',async()=>{await service.prepareMock();const entry=service.registry().profiles[0]!;const config=JSON.parse(fs.readFileSync(entry.file,'utf8'));config.projectMode='direct';config.executionMode='native';config.directAuthorization={projectPath:config.allowedRepositories[0],acknowledgedAt:new Date().toISOString()};fs.writeFileSync(entry.file,JSON.stringify(config));service.register(entry.file);const p=service.overview().profiles[0]!;profileId=p.id;target=p.repositories[0]!;head=await git(target,['rev-parse','HEAD']);assert.equal(p.mode,'mock');assert.equal(await git(target,['status','--porcelain']),'');assert.equal(service.overview().runs.length,0);});
test('trusted upper limits and repository whitelist cannot be expanded by GUI',async()=>{
 const request={operation:'start' as const,profileId,repository:target,goal:'Mock flow',maxClaudeCalls:5,maxLoops:4,maxReworks:1};
 await assert.rejects(service.dispatch({...request,repository:'D:/OpenWorld'}),/authorized/);
 await assert.rejects(service.dispatch({...request,maxLoops:5}),/流程限制超出可信配置/);
 assert.doesNotThrow(()=>service.validateStart({...request,maxClaudeCalls:6}));
});
test('native CLI executes full Mock cycle, returns actual tests and durable session IDs',async()=>{const r=await service.dispatch({operation:'start',profileId,repository:target,goal:'GUI integration: create verified markers',maxClaudeCalls:5,maxLoops:4,maxReworks:1}) as any;runId=r.id;const done=await wait('completed');assert.equal(done.loops,2);assert.equal(done.claudeCalls,0);assert.equal(done.evidence?.passed,true);assert.ok(done.claudeSessionId&&done.codexThreadId);assert.equal(fs.readFileSync(path.join(target,'hello.txt'),'utf8'),'hello\n');assert.ok(service.detail(profileId,runId).auditVerified);});
test('Direct Delivery requires explicit approval and preserves current files',async()=>{const d=await service.dispatch({operation:'preview',profileId,runId,target,branch:'direct'}) as any;await assert.rejects(service.dispatch({operation:'apply',profileId,runId,deliveryId:d.id}),/approv/i);assert.equal(await git(target,['rev-parse','HEAD']),head);});
test('separate digest-bound approval acknowledges Direct result without rewriting files',async()=>{const d=(await service.deliveries(profileId,runId))[0]!;await assert.rejects(service.dispatch({operation:'approve',profileId,runId,deliveryId:d.id,digest:'0'.repeat(64),decision:'Explicit Mock approval'}),/digest/i);await service.dispatch({operation:'approve',profileId,runId,deliveryId:d.id,digest:d.digest,decision:'Explicit automated approval for this isolated Mock fixture only'});assert.equal(fs.readFileSync(path.join(target,'hello.txt'),'utf8'),'hello\n');await service.dispatch({operation:'apply',profileId,runId,deliveryId:d.id});assert.equal(fs.readFileSync(path.join(target,'hello.txt'),'utf8'),'hello\n');assert.equal(await git(target,['rev-parse','HEAD']),head);assert.equal(await git(target,['diff','--cached','--name-only']),'');});
test('changed registered configuration is refused rather than silently trusted',()=>{const entry=service.registry().profiles[0]!;const original=fs.readFileSync(entry.file);fs.writeFileSync(entry.file,Buffer.concat([original,Buffer.from('\n')]));assert.throws(()=>service.config(profileId),/配置已改变/);fs.writeFileSync(entry.file,original);});
test('read-only historic profiles cannot start, stop, resume or approve',async()=>{const entry=service.registry().profiles[0]!;service.register(entry.file,true);await assert.rejects(service.dispatch({operation:'stop',profileId,runId}),/只读/);await assert.rejects(service.dispatch({operation:'start',profileId,repository:target,goal:'do not run',maxClaudeCalls:5,maxLoops:4,maxReworks:1}),/只读/);service.register(entry.file,false);});
test('preferences persist across service restarts',async()=>{await service.dispatch({operation:'preferences',reducedMotion:true});const restarted=new DesktopService(root,data,process.execPath);assert.equal(restarted.overview().reducedMotion,true);assert.equal(restarted.overview().runs[0]?.id,runId);});
test('real mode creates Run without paid acknowledgement or ledger (launch locally intercepted)',async()=>{
 const entry=service.registry().profiles[0]!,config=JSON.parse(fs.readFileSync(entry.file,'utf8'));config.mode='real';config.projectMode='direct';config.directAuthorization={projectPath:target,acknowledgedAt:new Date().toISOString()};config.globalBudget={file:path.join(data,'missing-legacy-ledger.json'),limit:1};
 const file=path.join(data,'real.config.json');fs.writeFileSync(file,JSON.stringify(config));service.register(file);const p=service.overview().profiles.find(p=>p.mode==='real')!;
 const launch=service.launch;let calls=0;service.launch=()=>{calls++;};
 try{const run=await service.dispatch({operation:'start',profileId:p.id,repository:target,goal:'local interception only'}) as any;assert.equal(run.phase,'planning');assert.equal(calls,1);assert.equal(service.detail(p.id,run.id).auditVerified,true);assert.equal(fs.existsSync(config.globalBudget.file),false);}
 finally{service.launch=launch;}
});

test('audit tampering blocks UI detail instead of displaying forged evidence',()=>{const store=service.store(profileId,runId),file=store.file('audit.jsonl'),original=fs.readFileSync(file);fs.appendFileSync(file,'{"hash":"fake","previousHash":"bad"}\n');assert.throws(()=>service.detail(profileId,runId),/integrity/);fs.writeFileSync(file,original);});
test('concurrent delivery polling is serialized without bypassing Controller locks',async()=>{
 const results=await Promise.all(Array.from({length:6},()=>service.deliveries(profileId,runId)));
 assert.ok(results.every(deliveries=>deliveries[0]?.phase==='applied'));
 assert.ok(service.detail(profileId,runId).auditVerified);
});
