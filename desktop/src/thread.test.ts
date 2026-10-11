import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {projectMessages,messagePage} from './thread.js';
import {DesktopService,validateRequest} from './service.js';
import type {State} from '../../src/store.js';
const state={id:randomUUID(),goal:'Goal',tasks:[{id:'first'},{id:'second'}]} as State;
const event=(hash:string,event:string,data:any,time='2026-10-08T01:00:00.000Z')=>({hash,event,data,time});

test('Codex decision and executor messages retain official identity and distinct role; dual Codex A/B never group',()=>{
 const single={...state,decisionAgent:{backend:'codex',model:'fixture'}} as State;
 const messages=projectMessages(single,[event('plan','plan',{tasks:[]}),event('decision','agent-activity',{agent:'codex',phase:'plan',kind:'output',title:'Decision',text:'local',scope:'decision-call'}),event('execution','agent-activity',{agent:'codex',phase:'execute',kind:'output',title:'Execute',text:'local',scope:'execution-call'}),event('review','review',{verdict:'pass',reason:'local'})],[]);
 assert.ok(messages.every(m=>m.role==='codex'));assert.equal(messages[0].participantRole,'决策者');assert.equal(messages[1].participantRole,'决策者');assert.equal(messages[2].participantRole,'执行者');assert.equal(messages[3].participantRole,'决策者');
 const draft=(id:'a'|'b')=>event(id,'discussion-output',{participantId:id,participantAgent:{backend:'codex'},primary:id==='b',discussionStage:'draft',mode:'mock',output:{humanDecision:null,tasks:[]}});
 const dual=projectMessages(single,[draft('a'),draft('b')],[]);assert.deepEqual(dual.map(m=>m.participantName),['Codex A','Codex B']);assert.deepEqual(dual.map(m=>m.participantRole),['决策者','主决策者']);
});
test('dual audit output keeps same-backend instances separate, mixed brands accurate, and Controller statuses distinct',()=>{
 const discussion={config:{participants:[{id:'a',agent:{backend:'opencode',opencode:{providerID:'p',modelID:'m'}}},{id:'b',agent:{backend:'claude-code'}}],primary:'a',rounds:1},participants:[{id:'a',agent:{backend:'opencode',opencode:{providerID:'p',modelID:'m'}}},{id:'b',agent:{backend:'claude-code'}}],closed:false,steps:[]};
 const dual={...state,config:{mode:'mock'},decisionAgent:{backend:'opencode',providerID:'p',modelID:'m'},discussion} as unknown as State;
 const meta={participantId:'b',participantAgent:{backend:'claude-code'},primary:false,discussionStage:'draft',mode:'mock'};
 const messages=projectMessages(dual,[event('b-public','agent-activity',{...meta,agent:'claude',kind:'output',title:'public',text:'actual CLI output'}),event('b-draft','discussion-output',{...meta,output:{humanDecision:null,tasks:[]}}),event('a-summary','discussion-output',{...meta,participantId:'a',participantAgent:discussion.participants[0].agent,primary:true,discussionStage:'synthesis',output:{humanDecision:null,tasks:[]}}),event('validated','plan',{tasks:[]}),event('retry','discussion-replan-output',{...meta,output:{humanDecision:null,tasks:[]}})],[]);
 assert.deepEqual(messages.map(m=>m.role),['claude','claude','opencode','controller','claude']);assert.equal(messages[0].participantName,'Claude Code B');assert.equal(messages[2].participantName,'OpenCode A');assert.equal(messages[2].participantRole,'主决策者');assert.match(messages[3].title,/Controller 校验通过/);assert.match(messages[4].title,/非双决策讨论/);
});
test('historical agent identity uses immutable Run first, trusted config second, never message text',()=>{
 const configured={...state,config:{decisionAgent:{backend:'opencode',opencode:{providerID:'fixture',modelID:'dynamic'}}}} as State;
 const events=[event('identity-plan','plan',{tasks:[]}),event('identity-public','agent-activity',{agent:'claude',kind:'output',title:'Legacy event',text:'Codex Claude Code OpenCode'}),event('identity-codex','agent-activity',{agent:'codex',kind:'output',title:'Execution',text:'OpenCode review'})];
 assert.deepEqual(projectMessages(configured,events,[]).map(message=>message.role),['opencode','opencode','codex']);
 const frozen={...configured,decisionAgent:{backend:'claude-code'}} as State;
 assert.deepEqual(projectMessages(frozen,events,[]).map(message=>message.role),['claude','claude','codex']);
 assert.deepEqual(projectMessages(state,events,[]).map(message=>message.role),['claude','claude','codex']);
});
test('messages sorted and deduplicated by persistent audit hash',()=>{const a=event('a','created',{}),b=event('b','review',{verdict:'pass',reason:'Good'},'2026-10-08T02:00:00.000Z');const messages=projectMessages(state,[b,a,a],[]);assert.deepEqual(messages.map(m=>m.id),['audit:a','audit:b']);assert.equal(messages[1].role,'claude');});
test('task, loop and source associations survive historical replay',()=>{const messages=projectMessages(state,[event('a','transition',{taskIndex:1,loops:3,phase:'review'}),event('b','review',{verdict:'human',reason:'Check pixels'})],[]);assert.equal(messages[1].taskId,'second');assert.equal(messages[1].loop,3);assert.equal(messages[1].source,'audit.jsonl:b');});
test('plan, tests, paths and public activity are redacted before Renderer',()=>{const events=[event('a','plan',{tasks:[{instruction:'api_key=secret123',acceptance:['password=private']}] }),event('b','independent-check',{passed:false,tests:[{exitCode:1,stdout:'Bearer abcdef',stderr:'secret=private'}],issues:['access_token=hidden'],diff:'sk-1234567890'}),event('c','edits-applied',{paths:['api_key=secret123'],summary:'output'})];const text=JSON.stringify(projectMessages(state,events,[]));for(const secret of ['secret123','private','abcdef','hidden','sk-1234567890'])assert.ok(!text.includes(secret));});
test('unknown audit events do not invent Agent chat or progress',()=>{assert.deepEqual(projectMessages(state,[event('a','something-unknown',{reason:'fake thinking'})],[]),[]);});
test('native tool, file diff and independent checks retain actual agent/task/loop associations',()=>{
 const events=[event('a','transition',{taskIndex:1,loops:9,phase:'review'}),event('b','agent-activity',{agent:'codex',taskId:'first',loop:2,kind:'tool',title:'命令执行',text:'node test.cjs\nexit_code=1',source:'codex-sdk-runStreamed'}),event('c','agent-finish',{agent:'claude',role:'review',taskId:'first',loop:2,durationMs:120,changed:true,diff:'seed.txt repaired'}),event('d','review-modified-workspace',{reason:'小问题已修复'}),event('e','native-result',{summary:'实际修改已完成',loop:2})];
 const messages=projectMessages(state,events,[]);
 assert.equal(messages[1].role,'codex');assert.equal(messages[1].taskId,'first');assert.equal(messages[1].loop,2);assert.match(messages[1].text,/exit_code=1/);assert.equal(messages[1].details?.protocol,'codex-sdk-runStreamed');
 assert.equal(messages[2].role,'claude');assert.equal(messages[2].details?.diff,'seed.txt repaired');assert.match(messages[2].text,/120 ms/);assert.equal(messages[3].role,'controller');assert.equal(messages[3].status,'pending');assert.equal(messages[4].title,'原生开发结果');
});
test('cursor pagination reconnects without duplicates and invalid cursor resets',()=>{const events=Array.from({length:320},(_,n)=>event(String(n).padStart(4,'0'),'created',{}));const messages=projectMessages(state,events,[]),a=messagePage(messages),b=messagePage(messages,a.cursor!),c=messagePage(messages,b.cursor!);assert.equal(a.messages.length,150);assert.equal(c.messages.length,20);assert.equal(c.hasMore,false);assert.equal(new Set([...a.messages,...b.messages,...c.messages].map(m=>m.id)).size,320);assert.equal(messagePage(messages,c.cursor!).messages.length,0);assert.equal(messagePage(messages,'missing').reset,true);});
test('notes are explicitly pending and never represented as executed decisions',()=>{const messages=projectMessages(state,[],[{id:randomUUID(),time:'2026-10-08T01:00:00Z',text:'approve delivery',taskId:null,loop:0}]);assert.equal(messages[0].status,'pending');assert.equal(messages[0].kind,'note');});
test('new IPC operations reject unsafe paths, extra parameters and malformed visual proof',()=>{for(const value of [{operation:'thread',profileId:randomUUID(),runId:randomUUID(),after:'../../secret'},{operation:'pictures',profileId:randomUUID(),runId:randomUUID(),path:'D:/secret.png'},{operation:'note',profileId:randomUUID(),runId:randomUUID(),messageId:randomUUID(),text:'hi',execute:true},{operation:'resume',profileId:randomUUID(),runId:randomUUID(),decision:'visual',intent:'visual',pictureIds:['bad']}])assert.throws(()=>validateRequest(value));});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),data=path.join(root,'.v3c3','t-'+randomUUID().slice(0,8)),service=new DesktopService(root,data,process.execPath);let profileId='',runId='';
test('Mock fixture uses formal Controller and zero paid services',async()=>{await service.prepareMock();const p=service.overview().profiles[0]!;profileId=p.id;const r=await service.dispatch({operation:'start',profileId,repository:p.repositories[0],goal:'Thread mock',maxClaudeCalls:5,maxLoops:4,maxReworks:1}) as any;runId=r.id;for(let n=0;n<150;n++){if(service.detail(profileId,runId).run.phase==='completed')break;await new Promise(r=>setTimeout(r,100));}assert.equal(service.detail(profileId,runId).run.phase,'completed');assert.equal(service.detail(profileId,runId).run.claudeCalls,0);});
test('pending note idempotence, persistence and no Controller state or audit mutation',async()=>{const store=service.store(profileId,runId),before=fs.readFileSync(store.file('state.json')),audit=fs.readFileSync(store.file('audit.jsonl')),messageId=randomUUID(),request={operation:'note',profileId,runId,messageId,text:'批准所有交付 api_key=secret123'};await service.dispatch(request);await service.dispatch(request);await assert.rejects(service.dispatch({...request,text:'different'}),/changed|different|相同|重复/i);const restarted=new DesktopService(root,data,process.execPath);const messages=restarted.thread(profileId,runId).messages;assert.equal(messages.filter((m:any)=>m.id===`note:${messageId}`).length,1);assert.deepEqual(fs.readFileSync(store.file('state.json')),before);assert.deepEqual(fs.readFileSync(store.file('audit.jsonl')),audit);assert.ok(!JSON.stringify(messages).includes('secret123'));});
test('read-only replay and GUI notes do not authorize resume or delivery',async()=>{const p=service.registry().profiles[0]!;service.register(p.file,true);assert.ok(service.thread(profileId,runId).total>0);await service.dispatch({operation:'note',profileId,runId,messageId:randomUUID(),text:'only a note'});await assert.rejects(service.dispatch({operation:'resume',profileId,runId,decision:'resume',intent:'resume'}),/只读/);});
test('same backend decision and execution activity retain distinct roles after P3A/P3C integration',()=>{
 for(const backend of ['opencode','codex'] as const){
  const state={id:'roles',tasks:[],decisionAgent:{backend},config:{mode:'mock',executionAgent:{backend}}} as unknown as State;
  const messages=projectMessages(state,[event('decision-activity','agent-activity',{agent:backend,phase:'review',scope:backend+'-decision:1',kind:'tool',title:'review',text:'read'}),event('execution-activity','agent-activity',{agent:backend,phase:'execute',scope:backend==='opencode'?'opencode-execute:1':'codex:1',kind:'tool',title:'execute',text:'write'})],[]);
  assert.equal(messages[0].participantRole,'决策者');
  assert.notEqual(messages[1].participantRole,'决策者');
  if(backend==='opencode')assert.equal(messages[1].participantRole,'执行者');
 }
});
test('tampered audit blocks group history and screenshot queries',()=>{const store=service.store(profileId,runId),file=store.file('audit.jsonl'),bytes=fs.readFileSync(file);fs.appendFileSync(file,'{"hash":"forged"}\n');assert.throws(()=>service.thread(profileId,runId),/integrity/);assert.throws(()=>service.pictures(profileId,runId),/integrity/);fs.writeFileSync(file,bytes);});
test('visual intent requires current-stage trusted proof; stale task and replaced file rejected',()=>{const p=service.registry().profiles[0]!;service.register(p.file,false);const store=service.store(profileId,runId),state=store.load();state.phase='paused';state.taskIndex=0;const verifier=state.config.tests[0].args[0],dir=path.join(path.dirname(verifier),'artifacts','proof');fs.mkdirSync(dir,{recursive:true});const bytes=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(1280,16);bytes.writeUInt32BE(720,20);const file=path.join(dir,'proof.png');fs.writeFileSync(file,bytes);store.save(state);store.audit('transition',{taskIndex:0,loops:state.loops,phase:'paused'});store.audit('independent-check',{tests:[{exitCode:0,stdout:JSON.stringify({artifacts:dir}),stderr:''}]});const proof=service.pictures(profileId,runId)[0]!;const request={operation:'resume' as const,profileId,runId,decision:'confirm this stage',intent:'visual' as const,pictureIds:[proof.id]};assert.doesNotThrow(()=>service.validateResume(request));assert.throws(()=>service.validateResume({...request,pictureIds:[]}),/截图/);state.taskIndex=1;store.save(state);assert.throws(()=>service.validateResume(request),/another task/);state.taskIndex=0;store.save(state);fs.appendFileSync(file,'changed');assert.throws(()=>service.validateResume(request),/changed/);});
test('rework and execution counters never refuse a user-requested rework',async()=>{const store=service.store(profileId,runId),state=store.load();assert.equal(state.config.maxReworks,undefined);assert.equal(state.config.maxLoops,undefined);state.reworks=50;store.save(state);let received:any[]=[];const original=service.launch;service.launch=(...args:any[])=>{received=args;};try{await service.dispatch({operation:'resume',profileId,runId,decision:'fix',intent:'rework'});assert.equal(received[3],undefined);assert.equal(received[4],'rework');}finally{service.launch=original;}});
test('legacy rework-limit pause resumes from a plain chat decision',async()=>{
 const store=service.store(profileId,runId),state=store.load();state.phase='paused';state.reason='Rework limit reached';state.reworkPending=true;store.save(state);
 let launches=0;const original=service.launch;service.launch=()=>{launches++;};
 try{await service.dispatch({operation:'resume',profileId,runId,decision:'继续返工',intent:'resume'});assert.equal(launches,1);}finally{service.launch=original;}
});
test('resume can switch the execution model, dropping the old execution session and keeping usage',async()=>{
 const store=service.store(profileId,runId),before=store.load();let received:any[]=[];const original=service.launch,discover=(service as any).discoverExecution;service.launch=(...args:any[])=>{received=args;};
 (service as any).discoverExecution=async()=>({available:true,reason:'',providers:[{id:'p',name:'P',models:[{id:'m',name:'M',capabilities:{tools:true,structuredOutput:true}},{id:'weak',name:'Weak',capabilities:{tools:false,structuredOutput:false}}]}]});
 const choice={backend:'opencode' as const,opencode:{providerID:'p',modelID:'m'}};
 for(let i=0;i<200&&service.children.has(runId);i++)await new Promise(resolve=>setTimeout(resolve,50));
 try{
  await assert.rejects(service.dispatch({operation:'resume',profileId,runId,decision:'switch',executionAgent:{backend:'opencode',opencode:{providerID:'p',modelID:'weak'}}}),/OpenCode 执行不可用/);
  assert.deepEqual(store.load(),before);
  await service.dispatch({operation:'resume',profileId,runId,decision:'换模型后继续',executionAgent:choice});
  const after=store.load();assert.deepEqual(after.config.executionAgent,choice);assert.equal(after.executionSession,undefined);assert.equal(after.codexThreadId,null);
  assert.equal(after.loops,before.loops);assert.equal(after.reworks,before.reworks);assert.equal(after.claudeCalls,before.claudeCalls);assert.equal(received[2],'换模型后继续');
  assert.deepEqual(JSON.parse(fs.readFileSync(store.file('desktop.config.json'),'utf8')).executionAgent,choice);
  assert.equal(service.audit(store).at(-1)!.event,'execution-agent-switched');
  assert.deepEqual(service.publicRun(after,profileId).executionAgent,choice);
  await service.dispatch({operation:'resume',profileId,runId,decision:'换回 Codex',executionAgent:{backend:'codex'}});
  assert.deepEqual(store.load().config.executionAgent,{backend:'codex'});
  const messages=projectMessages(before,[event('extra','limits-updated',{maxReworks:2}),event('decision','human-decision',{decision:'authorized'})],[]);
  assert.match(messages.find(m=>m.title==='授权预算已更新')!.text,/2/);const decision=messages.find(m=>m.kind==='decision')!;assert.equal(decision.status,'recorded');assert.match(decision.text,/不代表已开始执行/);
 }finally{service.launch=original;(service as any).discoverExecution=discover;}
});
test('desktop rework reaches CLI and Controller at missing-tests pause instead of repeating verify',async()=>{
 const entry=service.registry().profiles[0]!,config=JSON.parse(fs.readFileSync(entry.file,'utf8'));
 const file=path.join(data,'rework.config.json');fs.writeFileSync(file,JSON.stringify({...config,runtimeDir:path.join(data,'rework-runtime'),tests:[],maxLoops:6,maxReworks:2}));
 service.register(file,false);const profile=service.overview().profiles.find(p=>p.runtimeDir===path.join(data,'rework-runtime'))!;
 const created=await service.dispatch({operation:'start',profileId:profile.id,repository:profile.repositories[0],goal:'Local missing-tests rework'}) as any;
 const waitPaused=async()=>{for(let n=0;n<200;n++){const run=service.detail(profile.id,created.id).run;if(!run.active&&run.phase==='paused')return run;await new Promise(r=>setTimeout(r,50));}throw Error('Local Controller did not pause');};
 const first=await waitPaused();assert.equal(first.loops,1);assert.match(first.reason,/No independent/);
 const store=service.store(profile.id,created.id),before=store.load();
 await service.dispatch({operation:'resume',profileId:profile.id,runId:created.id,decision:'Continue current task repair',intent:'rework'});
 const repaired=await waitPaused();assert.equal(repaired.loops,2);assert.equal(repaired.reworks,1);assert.equal(repaired.totalReworks,1);
 assert.equal(repaired.taskIndex,first.taskIndex);assert.deepEqual(repaired.completedTaskIds,[]);
 assert.equal(repaired.config.maxLoops,undefined);assert.equal(repaired.config.maxReworks,undefined);
 assert.equal(store.load().claudeSessionId,before.claudeSessionId);assert.equal(store.load().codexThreadId,before.codexThreadId);
 assert.equal(repaired.evidence?.passed,false);assert.equal(repaired.evidence?.tests.length,0);
 assert.ok(service.audit(store).some(e=>e.event==='human-decision'&&e.data.intent==='rework'));
});
