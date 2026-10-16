import {completeFixtureRun} from './acceptance-fixture.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {git} from '../../dist/src/workspace.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {DesktopService,validateRequest} from './test-service.js';
import {groupMessages} from './threadGrouping.js';
import {sessionProject} from './sessionProject.js';
import {projectMessages} from './thread.js';
import type {ChatMessage,Conversation} from './types.js';
import type {State} from '../../src/store.js';
import {claimGuidance,guidanceStatus,pendingGuidance} from '../../dist/src/steering.js';
import {runAttachments} from '../../dist/src/multimodal.js';
import type {DecisionModels,DecisionAgent} from './types.js';

test('automatic intake requires answers and current plan confirmation; preferences steer the original Run',async t=>{
 const {service,data,project}=fixture();
 t.after(()=>{service.children.clear();fs.rmSync(data,{recursive:true,force:true});});
 fs.writeFileSync(service.registryFile,JSON.stringify({...service.registry(),automaticDevelopment:{enabled:true,enabledAt:new Date().toISOString()}}));
 const chat=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 assert.equal(chat.chatMode,'discuss');assert.equal(chat.intakeRequired,true);
 let turns=0;
 service.sessions.discuss=async()=>++turns===1?{reply:'先选择范围',plan:'',questions:[{id:'scope',title:'先做哪个版本？',options:[{label:'原型',description:'先验证核心流程'},{label:'完整版本',description:'覆盖主要功能'}],recommended:0}]}:{reply:'方案已整理',plan:'目标：核心流程。范围：原型。完成标准：可验证运行。',questions:[]};
 await service.sessions.send({operation:'sendSession',sessionId:chat.id,messageId:randomUUID(),text:'开发一个工具'});
 const first=await settleDiscussion(service,chat.id);
 assert.equal(first.runs.length,0);assert.equal(first.messages.at(-1)?.clarificationQuestions?.length,1);
 await assert.rejects(service.sessions.executeDiscussion({operation:'executeDiscussion',sessionId:chat.id,messageId:randomUUID(),projectMode:'direct'}),/回答当前问题/);
 await service.sessions.send({operation:'sendSession',sessionId:chat.id,messageId:randomUUID(),text:'原型'});
 const ready=await settleDiscussion(service,chat.id),preferences={time:'low' as const,tokens:'medium' as const,notes:'先完成核心流程',limits:{activeMs:1800000,tokens:100000}};
 await assert.rejects(service.sessions.executeDiscussion({operation:'executeDiscussion',sessionId:chat.id,messageId:randomUUID(),projectMode:'direct'}),/时间与 Token/);
 await assert.rejects(service.sessions.executeDiscussion({operation:'executeDiscussion',sessionId:chat.id,messageId:randomUUID(),projectMode:'direct',taskPreferences:preferences,planMessageId:first.messages[0].id}),/方案已更新/);
 service.launch=()=>{};
 const request={directAcknowledged:true,operation:'executeDiscussion' as const,sessionId:chat.id,messageId:randomUUID(),projectMode:'direct' as const,taskPreferences:preferences,planMessageId:ready.messages.at(-1)!.id};
 const started=await service.sessions.executeDiscussion(request);
 assert.equal(started.runs.length,1);assert.deepEqual(started.taskPreferences,preferences);
 assert.equal((await service.sessions.executeDiscussion(request)).runs.length,1);
 const ref=started.runs[0],store=service.store(ref.profileId,ref.id),before=store.load();
 assert.equal(before.config.autonomousDevelopment,true,'confirmed automatic intake persists autonomous execution in the Run');
 assert.deepEqual(before.config.resourceLimits,preferences.limits);
 assert.match(before.goal,/快速完成/);assert.match(before.goal,/不是精确耗时承诺/);
 service.children.set(ref.id,{} as any);
 const auditBefore=fs.readFileSync(store.file('audit.jsonl'));
 const update={operation:'updateTaskPreferences' as const,sessionId:chat.id,messageId:randomUUID(),preferenceRevision:1,taskPreferences:{...preferences,time:'high' as const}};
 const changed=await service.dispatch(update) as Conversation;
 assert.equal(changed.preferenceRevision,2);assert.equal(changed.runs.length,1);
 assert.equal(pendingGuidance(store).length,1);assert.match(pendingGuidance(store)[0].text,/深入开发/);
 assert.deepEqual(pendingGuidance(store)[0].resourceLimits,preferences.limits);
 assert.deepEqual(store.load(),before,'UI must not write Controller state during execution');
 assert.deepEqual(fs.readFileSync(store.file('audit.jsonl')),auditBefore,'Controller remains the sole audit writer');
 await service.dispatch(update);assert.equal(pendingGuidance(store).length,1);
 await assert.rejects(service.dispatch({...update,messageId:randomUUID()}),/已更新/);
 assert.equal(new DesktopService(root,data,process.execPath).sessions.get(chat.id).taskPreferences?.time,'high');
 service.children.clear();await assert.rejects(service.dispatch({...update,messageId:randomUUID(),preferenceRevision:2}),/未运行/);
 const paused=store.load();paused.phase='paused';store.save(paused);
 const pausedUpdate={...update,messageId:randomUUID(),preferenceRevision:2,taskPreferences:{...preferences,limits:{activeMs:86400000,tokens:1000000}}};
 await service.dispatch(pausedUpdate);assert.equal(store.load().phase,'paused','adjustment never resumes a paused Run');
 assert.equal(pendingGuidance(store).length,2);assert.deepEqual(store.load().config.resourceLimits,preferences.limits,'Desktop does not rewrite Controller limits');
 const completed=store.load();completed.phase='completed';store.save(completed);await service.sessions.drainCompleted(ref.id);
 const final=service.sessions.get(chat.id);assert.equal(final.runs.length,1);assert.equal(final.messages.find(m=>m.id===update.messageId)?.autoQueued,false);
 assert.match(final.messages.find(m=>m.id===update.messageId)?.error??'',/未应用/);
});

test('task preference IPC rejects invalid tiers and authority injection',()=>{
 const base={operation:'updateTaskPreferences',sessionId:randomUUID(),messageId:randomUUID(),preferenceRevision:0,taskPreferences:{time:'low',tokens:'medium',notes:''}};
 assert.doesNotThrow(()=>validateRequest(base));
 assert.throws(()=>validateRequest({...base,taskPreferences:{...base.taskPreferences,time:'unlimited'}}));
 assert.throws(()=>validateRequest({...base,taskPreferences:{...base.taskPreferences,push:true}}));
 assert.throws(()=>validateRequest({...base,taskPreferences:{...base.taskPreferences,limits:{activeMs:-1,tokens:100}}}));
 assert.throws(()=>validateRequest({...base,taskPreferences:{...base.taskPreferences,limits:{activeMs:null,tokens:1.5}}}));
 assert.throws(()=>validateRequest({...base,preferenceRevision:-1}));
});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

test('sidebar rename persists display name and deletion keeps data without resurrecting imported Runs',async()=>{
 const {service,project}=fixture();service.launch=()=>{};
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'sidebar history fixture',directAcknowledged:true});
 const ref=service.sessions.get(session.id).runs[0],store=service.store(ref.profileId,ref.id),state=store.load();state.phase='completed';store.save(state);
 const before=fs.readFileSync(store.file('state.json'));
 await service.dispatch({operation:'renameProject',projectPath:project,title:'新项目名称'});
 assert.equal(service.sessions.get(session.id).projectName,'新项目名称');assert.equal(service.inspectProject(project).name,'新项目名称');
 await service.dispatch({operation:'renameSession',sessionId:session.id,title:'新会话名称'});
 assert.equal(service.sessions.get(session.id).title,'新会话名称');
 await service.dispatch({operation:'deleteSession',sessionId:session.id});
 assert.equal(service.sessions.list().some(s=>s.id===session.id||s.runs.some(r=>r.id===ref.id)),false);
 assert.deepEqual(fs.readFileSync(store.file('state.json')),before);assert.equal(fs.readFileSync(path.join(project,'user.txt'),'utf8'),'user data\n');
 assert.ok(service.sessions.read().find(s=>s.id===session.id)?.deletedAt);
 assert.throws(()=>service.sessions.get(session.id),/会话不存在/);
 await service.dispatch({operation:'deleteProject',projectPath:project});
 assert.equal(service.overview().recentProjects?.some(p=>p.path===project),false);
 assert.ok(service.overview().runs.some(r=>r.id===ref.id));
});

test('project menu applies to parallel group and validates all sessions before deletion',async()=>{
 const {service,project,task}=await parallelFixture();
 const first=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 const second=service.sessions.create({operation:'createSession',projectPath:task,projectGroupPath:project,mode:'mock'});
 await service.dispatch({operation:'renameProject',projectPath:project,title:'并行项目'});
 assert.equal(service.sessions.get(second.id).projectGroupName,'并行项目');assert.equal(service.sessions.get(second.id).projectPath,task);
 service.sessions.inFlight.add(second.id);
 await assert.rejects(service.dispatch({operation:'deleteProject',projectPath:project}),/正在处理消息/);
 assert.equal(service.sessions.list().length,2);assert.equal(service.sessions.read().some(s=>s.deletedAt),false);
 service.sessions.inFlight.delete(second.id);
 const release=service.sessions.acquire(service.sessions.get(second.id));
 await assert.rejects(service.dispatch({operation:'deleteSession',sessionId:second.id}),/正在处理消息/);release();
 const removed=await service.dispatch({operation:'deleteProject',projectPath:project}) as {removedSessionIds:string[]};
 assert.deepEqual(new Set(removed.removedSessionIds),new Set([first.id,second.id]));assert.equal(service.sessions.list().length,0);
 assert.ok(fs.existsSync(path.join(task,'user.txt')));
});

test('sidebar rejects unknown paths, invalid titles, active Runs and queued messages',async()=>{
 const {service,project}=fixture();service.launch=()=>{};
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 assert.throws(()=>validateRequest({operation:'deleteSession',sessionId:'bad'}));
 assert.throws(()=>validateRequest({operation:'renameProject',projectPath:project,title:'x'.repeat(81)}));
 assert.throws(()=>service.sidebarProjectPath(path.resolve(root,'unknown-sidebar-project')),/未在侧栏登记/);
 await assert.rejects(service.dispatch({operation:'renameProject',projectPath:project,title:'  '}),/不能为空/);
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'active fixture',directAcknowledged:true});
 const ref=service.sessions.get(session.id).runs[0],store=service.store(ref.profileId,ref.id),state=store.load();state.phase='executing';store.save(state);
 const unlock=store.lock();try{await assert.rejects(service.dispatch({operation:'deleteSession',sessionId:session.id}),/运行中的任务/);}finally{unlock();}
 state.phase='completed';store.save(state);
 const saved=service.sessions.get(session.id);saved.messages.push({id:randomUUID(),text:'queued',time:new Date().toISOString(),status:'pending'});service.sessions.update(saved);
 await assert.rejects(service.dispatch({operation:'deleteSession',sessionId:session.id}),/待处理消息/);
 assert.equal(service.sessions.list().length,1);
});

test('completed chat discussion projection caches unchanged audits and refreshes real appended notices',async()=>{
 const {service,project}=fixture();const chat=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',chatMode:'discuss'});
 await service.sessions.send({operation:'sendSession',sessionId:chat.id,messageId:randomUUID(),text:'讨论下一阶段'});const saved=await settleDiscussion(service,chat.id);
 let reads=0;const audit=service.audit.bind(service);service.audit=store=>{reads++;return audit(store);};service.sessions.detail(chat.id);service.sessions.detail(chat.id);assert.equal(reads,0);
 const {Store}=await import('../../dist/src/store.js');const store=new Store(path.join(service.data,'conversation-discussions',chat.id),saved.discussionStateId!);
 const banner='Under-development features enabled: respect_system_proxy. Under-development features are incomplete and may behave unpredictably. To suppress this warning, set `suppress_unstable_features_warning = true` in C:\\Users\\fixture\\.codex\\config.toml.';
 store.audit('agent-activity',{agent:'codex',kind:'error',title:'Codex 工具错误',text:banner,source:'codex-sdk-runStreamed',scope:'call'});
 const result=service.sessions.detail(chat.id);assert.equal(reads,1);assert.equal(result.discussionMessages.at(-1)?.kind,'notice');assert.notEqual(result.discussionMessages.at(-1)?.status,'fail');assert.ok(result.session.messages.at(-1)?.discussionReply);
 store.audit('agent-activity',{agent:'codex',kind:'error',title:'Codex 工具错误',text:'Authentication failed',source:'codex-sdk-runStreamed',scope:'call'});
 assert.equal(service.sessions.detail(chat.id).discussionMessages.at(-1)?.status,'fail');
});
test('continue reports runtime startup failure and retries the same paused Run',async()=>{
 const {service,project}=fixture();let launches=0;service.launch=()=>{launches++;};
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'local startup regression',directAcknowledged:true});
 const ref=service.sessions.get(session.id).runs[0],store=service.store(ref.profileId,ref.id),state=store.load();
 state.phase='paused';state.nextPhase='execute';state.codexThreadId='retained-thread';store.save(state);
 const before=fs.readFileSync(store.file('state.json')),check=service.validateControllerRuntime.bind(service);
 service.validateControllerRuntime=async()=>{throw Error('Controller 未启动：ERR_MODULE_NOT_FOUND ajv');};
 const failedId=randomUUID();await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:failedId,text:'继续'});
 const failed=service.sessions.get(session.id).messages.find(message=>message.id===failedId)!;
 assert.equal(failed.status,'failed');assert.match(failed.error!,/ERR_MODULE_NOT_FOUND ajv/);assert.equal(launches,1);
 assert.deepEqual(fs.readFileSync(store.file('state.json')),before);assert.equal(service.sessions.get(session.id).runs.length,1);
 service.validateControllerRuntime=check;
 const retryId=randomUUID();await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:retryId,text:'继续'});
 const resumed=service.sessions.get(session.id),retry=resumed.messages.find(message=>message.id===retryId)!;
 assert.equal(retry.status,'executed');assert.equal(retry.runId,ref.id);assert.equal(resumed.runs.length,1);assert.equal(launches,2);
 assert.equal(store.load().codexThreadId,'retained-thread');
});
const settleDiscussion=async(service:DesktopService,id:string)=>{for(let i=0;i<150;i++){if(!service.sessions.discussionJobs.has(id))return service.sessions.detail(id).session;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Discussion did not settle');};

async function parallelFixture(){
 const result=fixture();await git(result.project,['init','-b','dev']);await git(result.project,['add','user.txt']);await git(result.project,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Parallel baseline']);
 const task=path.join(result.data,'minimap');await git(result.project,['worktree','add','-b','feature/minimap',task]);return {...result,task};
}
test('same project group launches independent worktrees while same execution directory stays queued',async()=>{
 const {service,data,project,task}=await parallelFixture();let launches=0;service.launch=store=>{launches++;service.children.set(store.id,{} as any);};
 const first=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 await service.sessions.send({operation:'sendSession',sessionId:first.id,messageId:randomUUID(),text:'campus feature',directAcknowledged:true});
 const original=service.sessions.detail(first.id).runs[0],store=service.store(original.profileId,original.id),before=fs.readFileSync(store.file('state.json'));
 const second=await service.dispatch({operation:'createSession',projectPath:task,projectGroupPath:project,mode:'mock'}) as Conversation;
 assert.deepEqual(sessionProject(second),sessionProject(first));assert.notEqual(second.projectPath,first.projectPath);
 assert.notEqual(service.sessions.lockPath(service.sessions.get(first.id)),service.sessions.lockPath(service.sessions.get(second.id)));
 await service.sessions.send({operation:'sendSession',sessionId:second.id,messageId:randomUUID(),text:'minimap feature',directAcknowledged:true});
 assert.equal(launches,2);const run=service.sessions.detail(second.id).runs[0];assert.equal(run.source,fs.realpathSync(task));assert.equal(run.workspace,fs.realpathSync(task));assert.notEqual(run.profileId,original.profileId);
 assert.deepEqual(fs.readFileSync(store.file('state.json')),before);
 const third=service.sessions.create({operation:'createSession',projectPath:task,projectGroupPath:project,mode:'mock'});
 const queued=await service.sessions.send({operation:'sendSession',sessionId:third.id,messageId:randomUUID(),text:'other feature',directAcknowledged:true});assert.equal(queued.messages[0].status,'pending');assert.equal(queued.runs.length,0);assert.equal(launches,2);
 const reopened=new DesktopService(root,data,process.execPath),restored=reopened.sessions.detail(second.id);assert.equal(restored.session.projectGroupPath,fs.realpathSync(project));assert.equal(restored.runs[0].id,run.id);assert.equal(restored.session.unavailableRuns?.length,0);
});
test('parallel project binding rejects primary directory, unrelated repository and worktree subdirectories',async()=>{
 const {service,project,task,data}=await parallelFixture();
 assert.throws(()=>service.sessions.create({operation:'createSession',projectPath:project,projectGroupPath:project}),/不同的独立/);
 const unrelated=path.join(data,'unrelated');fs.mkdirSync(unrelated);await git(unrelated,['init']);
 assert.throws(()=>service.sessions.create({operation:'createSession',projectPath:unrelated,projectGroupPath:project}),/不属于此项目/);
 const nested=path.join(task,'nested');fs.mkdirSync(nested);assert.throws(()=>service.sessions.create({operation:'createSession',projectPath:nested,projectGroupPath:project}),/根目录/);
 assert.equal(service.sessions.read().length,0);
});
test('parallel worktree membership is revalidated before starting a persisted session',async()=>{
 const {service,project,task}=await parallelFixture();let launches=0;service.launch=()=>{launches++;};
 const session=service.sessions.create({operation:'createSession',projectPath:task,projectGroupPath:project,mode:'mock'});
 fs.renameSync(path.join(task,'.git'),path.join(task,'detached-git'));
 await assert.rejects(service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'feature',directAcknowledged:true}),/无法绑定并行工作树/);
 assert.equal(launches,0);assert.equal(service.sessions.get(session.id).runs.length,0);
 fs.renameSync(path.join(task,'detached-git'),path.join(task,'.git'));
});

test('Discuss dropdown and slash share persistent multi-turn discussion without launching development',async()=>{
 for(const dropdown of [true,false]){
  const {service,data,project}=fixture();let launches=0;service.launch=()=>{launches++;};
  const original=fs.readFileSync(path.join(project,'user.txt'),'utf8');
  const session=await service.dispatch({operation:'createSession',projectPath:project,mode:'mock',...(dropdown?{chatMode:'discuss'}:{})}) as Conversation;
  await service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:dropdown?'如何修复问题？':'/discuss 如何修复问题？'});
  const first=await settleDiscussion(service,session.id);
  assert.equal(first.chatMode,'discuss');assert.equal(first.runs.length,0);assert.equal(first.status,'discuss');assert.ok(first.discussionPlan);assert.ok(first.messages.at(-1)?.discussionReply);assert.equal(first.directAuthorized,false);
  const next=new DesktopService(root,data,process.execPath);await next.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'继续，开始执行吧'});
  const second=await settleDiscussion(next,session.id);
  assert.equal(second.chatMode,'discuss');assert.equal(second.messages.at(-1)?.action,'discuss');assert.ok(second.messages.at(-1)?.discussionReply);assert.equal(second.discussionStateId,first.discussionStateId);assert.equal(second.runs.length,0);assert.equal(next.overview().profiles.length,0);assert.equal(launches,0);assert.equal(fs.readFileSync(path.join(project,'user.txt'),'utf8'),original);
 }
});

test('discussion acknowledges before response, queues continuations in order, and blocks execution until completion',async()=>{
 const {service,project}=fixture(),session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',chatMode:'discuss'});
 let finish!:()=>void;const gate=new Promise<void>(resolve=>finish=resolve),calls:string[]=[];
 service.sessions.discuss=async(_session,_message,text)=>{calls.push(text);if(calls.length===1)await gate;return {reply:'回复 '+text,plan:'方案 '+text};};
 const id=randomUUID(),first=await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:id,text:'first'});
 assert.equal(first.messages[0].status,'starting');assert.equal(first.messages[0].text,'first');assert.equal(first.discussionPlan,undefined);assert.deepEqual(calls,['first']);
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:id,text:'first'});assert.equal(calls.length,1);
 const second=await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'second'});assert.equal(second.messages[1].status,'pending');
 const thirdId=randomUUID();await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:thirdId,text:'cancelled'});service.sessions.edit({operation:'cancelSessionMessage',sessionId:session.id,messageId:thirdId},true);
 await assert.rejects(service.sessions.executeDiscussion({operation:'executeDiscussion',sessionId:session.id,messageId:randomUUID(),projectMode:'direct'}),/具体方案|未完成/);
 finish();const complete=await settleDiscussion(service,session.id);assert.deepEqual(calls,['first','second']);assert.equal(complete.discussionPlan,'方案 second');assert.equal(complete.messages[2].status,'cancelled');assert.equal(fs.existsSync(service.sessions.lockPath(service.sessions.get(session.id))),false);assert.equal(service.overview().runs.length,0);
});
test('failed background discussion keeps user message and draft, and does not replay queued work',async()=>{
 const {service,project}=fixture(),session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',chatMode:'discuss'});
 let reject!:(error:Error)=>void;const gate=new Promise<never>((_resolve,rejectGate)=>reject=rejectGate);let calls=0;service.sessions.discuss=async()=>{calls++;return gate;};
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'first'});await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'later'});reject(Error('transport disconnected'));
 const complete=await settleDiscussion(service,session.id);assert.equal(complete.messages[0].status,'failed');assert.match(complete.messages[0].error!,/transport disconnected/);assert.equal(complete.messages[1].status,'pending');assert.equal(complete.messages[1].autoQueued,false);assert.equal(calls,1);
 const restarted=new DesktopService(root,service.data,process.execPath);restarted.sessions.detail(session.id);assert.equal(calls,1);assert.equal(restarted.sessions.get(session.id).messages[0].text,'first');
});

test('queued mode notice does not strand the following edited discussion message',async()=>{
 const {service,project}=fixture(),session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',chatMode:'discuss'});
 let finish!:()=>void;const gate=new Promise<void>(resolve=>finish=resolve),calls:string[]=[];
 service.sessions.discuss=async(_session,_message,text)=>{calls.push(text);if(calls.length===1)await gate;return {reply:text,plan:text};};
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'first'});
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'/discuss'});
 const last=randomUUID();await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:last,text:'old'});service.sessions.edit({operation:'editSessionMessage',sessionId:session.id,messageId:last,text:'edited'});
 finish();for(let i=0;i<100&&service.sessions.get(session.id).messages.at(-1)?.status!=='recorded';i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.deepEqual(calls,['first','edited']);assert.equal(service.sessions.get(session.id).messages[1].discussionNotice,true);assert.equal(service.sessions.get(session.id).messages[2].status,'recorded');
});

test('unavailable discussion audit does not discard durable user messages',async()=>{
 const {service,project}=fixture(),session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',chatMode:'discuss'});
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'durable question'});await settleDiscussion(service,session.id);
 const saved=service.sessions.get(session.id);saved.discussionStateId=randomUUID();service.sessions.update(saved);
 const detail=service.sessions.detail(session.id);assert.equal(detail.session.messages[0].text,'durable question');assert.equal(detail.discussionMessages.length,0);assert.match(detail.discussionError!,/不可用/);
});
test('bare /discuss enters discussion, duplicate sends are idempotent and /discussx stays a development goal',async()=>{
 const {service,project}=fixture();service.launch=()=>{};
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'}),id=randomUUID();
 const first=await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:id,text:'/Discuss'});
 assert.equal(first.chatMode,'discuss');assert.equal(first.runs.length,0);assert.equal(first.discussionStateId,undefined);
 const repeated=await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:id,text:'/Discuss'});assert.equal(repeated.messages.length,1);
 await assert.rejects(service.dispatch({operation:'executeDiscussion',sessionId:session.id,messageId:randomUUID(),projectMode:'direct'}),/具体方案/);
 const other=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 await service.sessions.send({operation:'sendSession',sessionId:other.id,messageId:randomUUID(),text:'/discussx implement',directAcknowledged:true});assert.equal(service.sessions.get(other.id).runs.length,1);
});

test('discussion execution requires direct authorization, retains context and starts exactly once',async()=>{
 const {service,project}=fixture();let launches=0;service.launch=()=>{launches++;};
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',chatMode:'discuss'});
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'保持现有文件，新增功能'});
 await settleDiscussion(service,session.id);
 const plan=service.sessions.get(session.id).discussionPlan;
 await assert.rejects(service.dispatch({operation:'executeDiscussion',sessionId:session.id,messageId:randomUUID(),projectMode:'direct'}),/明确授权/);assert.equal(service.sessions.get(session.id).chatMode,'discuss');assert.equal(launches,0);
 const failed=service.sessions.get(session.id).messages.at(-1)!;service.sessions.edit({operation:'cancelSessionMessage',sessionId:session.id,messageId:failed.id},true);
 const id=randomUUID(),request={operation:'executeDiscussion' as const,sessionId:session.id,messageId:id,projectMode:'direct' as const,directAcknowledged:true};
 const result=await service.dispatch(request) as Conversation;
 assert.equal(result.chatMode,'develop');assert.equal(result.runs.length,1);assert.equal(launches,1);assert.ok(result.messages[0].discussionReply);assert.match(service.sessions.detail(session.id).runs[0].goal,/按讨论方案执行/);assert.ok(service.sessions.detail(session.id).runs[0].goal.includes(plan!));
 await service.dispatch(request);assert.equal(launches,1);assert.equal(service.sessions.get(session.id).runs.length,1);
});

test('/discuss never queues into or resumes an unfinished Run',async()=>{
 const {service,project}=fixture();service.launch=()=>{};
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'development',directAcknowledged:true});
 const run=service.sessions.detail(session.id).runs[0],store=service.store(run.profileId,run.id),state=store.load();state.phase='paused';state.nextPhase='execute';store.save(state);
 const discussed=await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'/discuss 修改方案'});
 assert.equal(discussed.chatMode,'develop');assert.equal(discussed.messages.at(-1)?.status,'failed');assert.equal(discussed.messages.at(-1)?.autoQueued,false);assert.equal(store.load().phase,'paused');assert.equal(discussed.runs.length,1);
});

test('chat authorized task advances through decision passes without user confirmation messages',async()=>{
 const {data,project}=fixture(),service=new DesktopService(root,data,process.execPath);
 const session=await service.dispatch({operation:'createSession',projectPath:project,mode:'mock'}) as Conversation;
 async function paused(){for(let i=0;i<300;i++){const run=service.sessions.detail(session.id).runs.at(-1);if(run&&!run.active&&['paused','failed','completed'].includes(run.phase))return run;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Fixture task did not reach user decision');}
 try{
  await service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'Local acceptance transport fixture',directAcknowledged:true});
  const done=await paused();assert.equal(done.phase,'completed',done.reason);assert.equal(done.manualAcceptanceDigest,null);assert.equal(done.manualAccepted,false);assert.equal(done.evidence?.decisionAccepted,true);assert.equal(done.evidence?.passed,false);assert.equal(done.loops,2);
  assert.deepEqual(done.completedTaskIds,['hello','done']);assert.equal(service.sessions.detail(session.id).session.messages.length,1);
 }finally{await service.stopOwned();}
});
test('Claude and Codex executor models persist through IPC, Session restart, project reopen and halted recovery',async()=>{
 for(const backend of ['claude-code','codex'] as const){
  const {data,project}=fixture(),service=new DesktopService(root,data,process.execPath);service.launch=()=>{};
  const executionAgent={backend,model:'executor-model'},decisionAgent={backend:'claude-code' as const,model:'decision-model'};
  const session=await service.dispatch({operation:'createSession',projectPath:project,mode:'mock',executionAgent,decisionAgent}) as Conversation;
  assert.deepEqual(new DesktopService(root,data,process.execPath).sessions.get(session.id).settings.executionAgent,executionAgent);
  await service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'Local model persistence fixture',directAcknowledged:true});
  const run=service.sessions.detail(session.id).runs[0]!,store=service.store(run.profileId,run.id),state=store.load();assert.deepEqual(state.config.executionAgent,executionAgent);assert.deepEqual(service.inspectProject(project).settings.executionAgent,executionAgent);
  state.phase='paused';state.nextPhase='execute';state.claudeSessionId='decision-existing';if(backend==='claude-code'){state.claudeExecutionSessionId='execution-existing';state.executionSession={backend,model:'executor-model',sessionId:'execution-existing',runId:state.id,workspace:state.workspace,directory:state.workspace};}else state.codexThreadId='execution-existing';store.save(state);
  const choice={backend,model:'replacement-model'};
  await service.dispatch({operation:'resume',profileId:run.profileId,runId:run.id,decision:'Switch the model and continue the existing local fixture',executionAgent:choice});
  const after=store.load();assert.equal(after.id,state.id);assert.deepEqual(after.config.executionAgent,choice);assert.equal(after.executionSession,undefined);assert.equal(after.claudeExecutionSessionId,undefined);assert.equal(after.codexThreadId,null);assert.equal(after.claudeSessionId,'decision-existing');assert.deepEqual(service.sessions.get(session.id).settings.executionAgent,choice);
  assert.throws(()=>validateRequest({operation:'resume',profileId:run.profileId,runId:run.id,decision:'invalid',executionAgent:{backend,model:'invalid model'}}));
 }
 assert.throws(()=>validateRequest({operation:'nativeModels',backend:'opencode'}));
 assert.deepEqual(validateRequest({operation:'nativeModels',backend:'codex'}),{operation:'nativeModels',backend:'codex'});
});
test('P3C executor selection is independent, validated and durable; history defaults to Codex',async()=>{
 const {data,project}=fixture();
 let execution:DecisionModels={available:true,reason:'',providers:[{id:'executor-provider',name:'LOCAL MOCK',models:[{id:'executor-model',name:'LOCAL MOCK tools',capabilities:{tools:true,structuredOutput:true}}]}]};
 const decision:DecisionModels={available:true,reason:'',providers:[{id:'decision-provider',name:'LOCAL MOCK',models:[{id:'decision-model',name:'LOCAL MOCK decision',capabilities:{tools:true,structuredOutput:true}}]}]};
 const service=new DesktopService(root,data,process.execPath,async()=>decision,async()=>execution);
 const executionAgent={backend:'opencode' as const,opencode:{providerID:'executor-provider',modelID:'executor-model'}},decisionAgent={backend:'opencode' as const,opencode:{providerID:'decision-provider',modelID:'decision-model'}};
 for(const invalid of [{backend:'unsupported'},[{backend:'codex'},executionAgent],{...executionAgent,opencode:{...executionAgent.opencode,executable:'untrusted.exe'}}])assert.throws(()=>validateRequest({operation:'createSession',projectPath:project,executionAgent:invalid}));
 const discovered=await service.dispatch({operation:'executionModels',projectPath:project}) as DecisionModels;assert.equal(discovered.providers[0].id,'executor-provider');
 const session=await service.dispatch({operation:'createSession',projectPath:project,mode:'mock',executionAgent,decisionAgent}) as Conversation;
 assert.deepEqual(session.settings.executionAgent,executionAgent);assert.deepEqual(session.settings.decisionAgent,decisionAgent);
 assert.deepEqual(new DesktopService(root,data,process.execPath,async()=>decision,async()=>execution).sessions.get(session.id).settings.executionAgent,executionAgent);
 execution={available:false,reason:'LOCAL MOCK native tools unavailable',providers:[]};await assert.rejects(service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'local test',directAcknowledged:true}),/执行不可用/);assert.equal(service.overview().runs.length,0);
 execution=discovered;await service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'retry local test',directAcknowledged:true});
 try{const run=await done(service,session.id);assert.equal(run.phase,'completed');assert.equal(run.mode,'mock');assert.deepEqual(run.executionAgent,executionAgent);assert.match(run.executionSession!.sessionId,/^mock-/);assert.equal(run.codexThreadId,null);const state=service.store(run.profileId,run.id).load();const messages=projectMessages(state,[{hash:'fixture',time:state.updatedAt,event:'native-result',data:{agent:'opencode',summary:'LOCAL MOCK execution',sessionId:run.executionSession!.sessionId}},{hash:'fixture-review',time:state.updatedAt,event:'review',data:{verdict:'pass',reason:'LOCAL MOCK review'}}],[]);assert.equal(messages[0].role,'opencode');assert.equal(messages[0].participantRole,'执行者');assert.ok(messages[0].text.includes(run.executionSession!.sessionId));assert.notEqual(messages[1].participantRole,'执行者');}finally{await service.stopOwned();}
});

test('Codex single/dual models and primary persist across Desktop restart; Mock routes locally with separate identity',async()=>{
 for(const dual of [false,true])for(const executor of ['codex','opencode'] as const){
  const {data,project}=fixture();
  const executionAgent=executor==='codex'?{backend:'codex' as const}:{backend:'opencode' as const,opencode:{providerID:'fixture-provider',modelID:'fixture-model'}};
  const service=new DesktopService(root,data,process.execPath,undefined,async()=>({available:true,reason:'LOCAL MOCK',providers:[{id:'fixture-provider',name:'LOCAL MOCK',models:[{id:'fixture-model',name:'LOCAL MOCK',capabilities:{tools:true,structuredOutput:true}}]}]}));
  const decisionAgent:DecisionAgent={backend:'codex',model:'fixture-model'};
  const decisionDiscussion=dual?{participants:[{id:'a' as const,agent:{backend:'codex' as const,model:'fixture-other'}},{id:'b' as const,agent:decisionAgent}],primary:'b' as const,rounds:0 as const}:undefined;
  const session=await service.dispatch({operation:'createSession',projectPath:project,mode:'mock',executionAgent,decisionAgent,...(decisionDiscussion?{decisionDiscussion}:{})}) as Conversation;
  assert.deepEqual(new DesktopService(root,data,process.execPath).sessions.get(session.id).settings.decisionAgent,decisionAgent);
  await service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'Codex local Mock fixture',directAcknowledged:true});
  try{
   const run=await done(service,session.id);assert.equal(run.phase,'completed',run.reason);assert.deepEqual(run.decisionAgent,decisionAgent);assert.deepEqual(run.executionAgent,executionAgent);assert.equal(run.claudeSessionId,null);assert.equal(run.decisionSession?.backend,'codex');assert.notEqual(run.decisionSession?.sessionId,run.codexThreadId);assert.notEqual(run.decisionSession?.sessionId,run.executionSession?.sessionId);
   const restored=new DesktopService(root,data,process.execPath).sessions.detail(session.id);assert.deepEqual(restored.session.settings.decisionAgent,decisionAgent);
   if(dual){assert.deepEqual(run.discussion?.config,decisionDiscussion);assert.notEqual(run.discussion!.participants[0].session!.sessionId,run.discussion!.participants[1].session!.sessionId);}
  }finally{await service.stopOwned();}
 }
 assert.throws(()=>validateRequest({operation:'createSession',projectPath:'D:/fixture',decisionAgent:{backend:'codex',model:'invalid model'}}));
 assert.throws(()=>validateRequest({operation:'createSession',projectPath:'D:/fixture',executionAgents:[{backend:'codex'},{backend:'codex'}]}));
});
test('decision backend: dynamic sanitized discovery, latest selection validation, immutable Run and restart persistence',async()=>{
 const {data,project}=fixture();
 let discovery:DecisionModels={available:true,reason:'',providers:[{id:'fixture-provider',name:'Fixture',models:[{id:'fixture-model',name:'Mock structured model',capabilities:{tools:true,structuredOutput:true}}]}]};
 const discover=async()=>({...discovery,password:'private-test-credential',providers:discovery.providers.map(p=>({...p,apiKey:'private-test-credential',models:p.models.map(m=>({...m,secret:'private-test-credential'}))}))});
 const service=new DesktopService(root,data,process.execPath,discover);
 const old=await service.dispatch({operation:'createSession',projectPath:project}) as Conversation;
 assert.deepEqual(old.settings.decisionAgent,{backend:'claude-code'});
 const dynamic=await service.dispatch({operation:'decisionModels',projectPath:project}) as DecisionModels;
 assert.equal(dynamic.providers[0].models[0].id,'fixture-model');
 assert.equal(JSON.stringify(dynamic).includes('private-test-credential'),false);
 assert.deepEqual(Object.keys(dynamic).sort(),['available','providers','reason']);
 const decisionAgent:DecisionAgent={backend:'opencode',opencode:{providerID:'fixture-provider',modelID:'fixture-model'}};
 assert.throws(()=>validateRequest({operation:'createSession',projectPath:project,decisionAgent:{backend:'opencode',opencode:{providerID:'fixture-provider'}}}));
 assert.throws(()=>validateRequest({operation:'createSession',projectPath:project,decisionAgent:{...decisionAgent,opencode:{...decisionAgent.opencode,executable:'untrusted.exe'}}}));
 await assert.rejects(service.dispatch({operation:'createSession',projectPath:project,decisionAgent:{backend:'opencode',opencode:{providerID:'stale-provider',modelID:'stale-model'}}}),/失效/);
 const session=await service.dispatch({operation:'createSession',projectPath:project,mode:'mock',decisionAgent}) as Conversation;
 assert.deepEqual(session.settings.decisionAgent,decisionAgent);
 const restart=new DesktopService(root,data,process.execPath,discover);
 assert.deepEqual(restart.sessions.get(session.id).settings.decisionAgent,decisionAgent);
 discovery={available:false,reason:'fixture server unavailable password=private-test-credential',providers:[]};
 assert.equal((await service.dispatch({operation:'decisionModels',projectPath:project}) as DecisionModels).providers[0].id,'fixture-provider','stored catalog served without rediscovery');
 const unavailable=await service.dispatch({operation:'decisionModels',projectPath:project,refresh:true}) as DecisionModels;
 assert.equal(unavailable.available,false);assert.match(unavailable.reason,/fixture server unavailable/);assert.equal(unavailable.reason.includes('private-test-credential'),false);
 assert.equal((await restart.dispatch({operation:'decisionModels'}) as DecisionModels).available,true,'failed refresh keeps stored catalog across restart and projects');
 await assert.rejects(service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'Mock backend requirement',directAcknowledged:true}),/不可用/);
 assert.equal(service.overview().runs.length,0);
 discovery={available:true,reason:'',providers:[{id:'fixture-provider',name:'Fixture',models:[{id:'fixture-model',name:'Mock structured model',capabilities:{tools:true,structuredOutput:true}}]}]};
 await service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'Mock backend requirement retry',directAcknowledged:true});
 try{
  const run=await done(service,session.id);assert.equal(run.phase,'completed');
  assert.deepEqual(run.decisionAgent,{backend:'opencode',providerID:'fixture-provider',modelID:'fixture-model'});
  const store=service.store(run.profileId,run.id),state=store.load();
  const events=[{hash:'fixture-plan',time:state.updatedAt,event:'plan',data:{tasks:[]}},{hash:'fixture-tool',time:state.updatedAt,event:'agent-activity',data:{agent:'opencode',kind:'tool',title:'Shell',text:'exit_code=0'}},{hash:'fixture-review',time:state.updatedAt,event:'review',data:{verdict:'pass',reason:'Mock'}}];
  assert.equal(projectMessages(state,events,[]).every(message=>message.role==='opencode'),true);
  assert.deepEqual(state.config.decisionAgent,decisionAgent);
  assert.equal(fs.readFileSync(store.file('desktop.config.json'),'utf8').includes('private-test-credential'),false);
  assert.deepEqual(new DesktopService(root,data,process.execPath,discover).inspectProject(project).settings.decisionAgent,decisionAgent);
  assert.deepEqual(service.publicRun({...state,config:{...state.config,decisionAgent:{backend:'claude-code'}}},run.profileId).decisionAgent,run.decisionAgent);
  assert.throws(()=>store.save({...state,decisionAgent:{backend:'claude-code'}}),/Immutable Decision Agent identity changed/);
  discovery={available:true,reason:'',providers:[{id:'other-live-provider',name:'Other',models:[{id:'other-live-model',name:'Other',capabilities:{tools:true,structuredOutput:true}}]}]};
  assert.equal((await service.decisionModels(project)).providers[0].id,'other-live-provider');
  await assert.rejects(service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'stale selection must fail'}),/失效/);
  assert.equal(service.sessions.get(session.id).runs.length,1);
 }finally{await service.stopOwned();}
});
test('dual decision session binds two identities and primary configuration; IPC refuses unsupported roles and executable injection',async()=>{
 const {service,data,project}=fixture();
 const decisionDiscussion={participants:[{id:'a' as const,agent:{backend:'claude-code' as const,model:'sonnet'}},{id:'b' as const,agent:{backend:'claude-code' as const,model:'opus'}}],primary:'b' as const,rounds:1 as const};
 const session=await service.dispatch({operation:'createSession',projectPath:project,mode:'mock',decisionDiscussion}) as Conversation;
 assert.equal(session.settings.decisionAgent?.backend,'claude-code');assert.deepEqual(session.settings.decisionAgent,decisionDiscussion.participants[1].agent);
 await service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'双决策本地夹具',directAcknowledged:true});
 try{
  const run=await done(service,session.id);assert.equal(run.phase,'completed',run.reason);assert.equal(run.mode,'mock');assert.equal(run.discussion?.participants.length,2);assert.equal(run.claudeCalls,7);assert.equal(run.loops,2);
  const messages=service.thread(run.profileId,run.id).messages.filter(m=>m.kind==='discussion');assert.deepEqual(messages.map(m=>[m.participantId,m.decisionStage]),[['a','draft'],['b','draft'],['a','discussion'],['b','discussion'],['b','synthesis']]);assert.ok(messages.every(m=>m.text.includes('Mock')));
  const restored=new DesktopService(root,data,process.execPath).sessions.detail(session.id);assert.deepEqual(restored.runs[0].discussion?.config,decisionDiscussion);
  const saved=service.sessions.get(session.id);saved.settings.decisionDiscussion!.rounds=0;service.sessions.update(saved);
  await assert.rejects(service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'拒绝篡改讨论配置'}),/讨论参与者已改变/);assert.equal(service.sessions.get(session.id).runs.length,1);
 }finally{await service.stopOwned();}
 for(const agent of [{backend:'unsupported'},{backend:'opencode',opencode:{providerID:'x',modelID:'y',executable:'untrusted.exe'}}])assert.throws(()=>validateRequest({operation:'createSession',projectPath:project,decisionDiscussion:{...decisionDiscussion,participants:[{id:'a',agent},{id:'b',agent:{backend:'claude-code'}}]}}));
});
function fixture(shortPath=false){const data=shortPath?path.resolve(process.platform==='win32'?'D:/pa-si':'.v03e-short',randomUUID().slice(0,8)):path.join(root,'.v03e-tests',randomUUID()),project=path.join(data,'project');fs.mkdirSync(project,{recursive:true});fs.writeFileSync(path.join(project,'user.txt'),'user data\n');return {data,project,service:new DesktopService(root,data,process.execPath)};}
async function done(service:DesktopService,sessionId:string){for(let i=0;i<250;i++){const detail=service.sessions.detail(sessionId),run=detail.runs.at(-1);if(run&&!run.active&&!['planning','execute','executing','applying','verify','review'].includes(run.phase))return completeFixtureRun(service,run.profileId,run.id);await new Promise(r=>setTimeout(r,60));}assert.fail('Controller timeout');}
test('ordinary folder session: two formal Mock runs, immutable project, state/context and audit persist',async()=>{
 const {service,data,project}=fixture();const session=await service.dispatch({operation:'createSession',projectPath:project,mode:'mock',maxLoops:8}) as Conversation;
 assert.equal(session.status,'idle');assert.equal(session.runs.length,0);assert.notEqual(session.id,project);assert.equal(service.overview().runs.length,0);
 await service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'第一轮：创建本地 Mock 标记',directAcknowledged:true});const first=await done(service,session.id);assert.equal(first.phase,'completed');
 await service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'第二轮：继续迭代此项目'});const second=await done(service,session.id);assert.equal(second.phase,'completed');assert.notEqual(first.id,second.id);assert.notEqual(first.id,session.id);assert.equal(first.source,second.source);assert.equal(second.source,project);assert.match(second.goal,/前轮项目状态/);assert.match(second.goal,/只规划本条新要求/);assert.equal(second.claudeCalls,0);
 const restored=new DesktopService(root,data,process.execPath),history=restored.sessions.detail(session.id);assert.equal(history.runs.length,2);assert.equal(history.session.messages.length,2);assert.equal(history.session.budget.loopsUsed,first.loops+second.loops);assert.equal(history.session.profileId,first.profileId);assert.equal(history.session.projectPath,project);assert.equal(fs.readFileSync(path.join(project,'user.txt'),'utf8'),'user data\n');
 for(const run of history.runs){const detail=restored.detail(run.profileId,run.id);assert.equal(detail.auditVerified,true);assert.ok(restored.thread(run.profileId,run.id).messages.length>0);assert.ok(restored.audit(restored.store(run.profileId,run.id)).some(e=>e.event==='desktop-session-link'&&e.data.sessionId===session.id));}
 assert.equal(restored.sessions.list().filter(s=>s.runs.some(r=>r.id===first.id)).length,1);
});
test('active messages persist without mid-turn injection; edit/cancel and automatic completion handoff',async()=>{
 const {service,data,project}=fixture();const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});const launch=service.launch;service.launch=store=>{service.children.set(store.id,{} as any);};
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'first requirement',directAcknowledged:true});const run=service.sessions.detail(session.id).runs[0],store=service.store(run.profileId,run.id),before=fs.readFileSync(store.file('state.json')),audit=fs.readFileSync(store.file('audit.jsonl'));const id=randomUUID();
 const pending=await service.dispatch({operation:'sendSession',sessionId:session.id,messageId:id,text:'补充需求'} ) as Conversation;assert.equal(pending.messages.at(-1)?.status,'pending');assert.deepEqual(fs.readFileSync(store.file('state.json')),before);assert.deepEqual(fs.readFileSync(store.file('audit.jsonl')),audit);
 await service.dispatch({operation:'editSessionMessage',sessionId:session.id,messageId:id,text:'修改后的补充要求'});assert.equal(new DesktopService(root,data,process.execPath).sessions.detail(session.id).session.messages.at(-1)?.text,'修改后的补充要求');
 await service.dispatch({operation:'cancelSessionMessage',sessionId:session.id,messageId:id});await assert.rejects(service.dispatch({operation:'processSessionMessage',sessionId:session.id,messageId:id}),/已处理或已取消/);
 const secondId=randomUUID();await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:secondId,text:'下一轮开发'});service.children.delete(run.id);service.launch=launch;
 await service.dispatch({operation:'resume',profileId:run.profileId,runId:run.id,decision:'continue'}); assert.equal((await done(service,session.id)).phase,'completed');
 for(let i=0;i<100&&service.sessions.get(session.id).runs.length<2;i++)await new Promise(r=>setTimeout(r,30));
 assert.equal((await done(service,session.id)).phase,'completed');assert.equal(service.sessions.get(session.id).messages.find(m=>m.id===secondId)?.status,'executed');assert.equal(service.sessions.detail(session.id).runs.length,2);
});
test('session continues after historical cumulative exhaustion and restart; old files stay unchanged',async()=>{
 const {service,project,data}=fixture();const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',maxLoops:2,maxClaudeCalls:1});
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'第一轮开发',directAcknowledged:true});const first=await done(service,session.id),store=service.store(first.profileId,first.id),before=fs.readFileSync(store.file('state.json')),audit=fs.readFileSync(store.file('audit.jsonl'));
 const ledger=path.join(data,'legacy-budget.json');fs.writeFileSync(ledger,'historical ledger');
 const restarted=new DesktopService(root,data,process.execPath);assert.equal(restarted.sessions.detail(session.id).session.budget.loopsRemaining,0);
 await restarted.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'第二轮开发'});const second=await done(restarted,session.id);assert.equal(second.phase,'completed');assert.equal(second.config.maxLoops,undefined);assert.equal(restarted.sessions.detail(session.id).session.budget.loopsUsed,4);
 assert.deepEqual(fs.readFileSync(store.file('state.json')),before);assert.deepEqual(fs.readFileSync(store.file('audit.jsonl')),audit);assert.equal(fs.readFileSync(ledger,'utf8'),'historical ledger');assert.equal(store.load().config.globalBudget,undefined);
 assert.equal(fs.readdirSync(data).some(name=>name.startsWith('session-budget-')),false);
});
test('removed budget authorization IPC cannot mutate a session or approve delivery',async()=>{
 const {service,project}=fixture();const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});const before=fs.readFileSync(service.sessions.file);
 await assert.rejects(service.dispatch({operation:'authorizeSessionBudget',sessionId:session.id,maxLoops:10,maxClaudeCalls:6,decision:'add'}),/Unknown desktop operation/);
 assert.deepEqual(fs.readFileSync(service.sessions.file),before);
});
test('stale project message locks recover safely after process exit; messages and budgets remain intact',async()=>{
 const {service,data,project}=fixture();const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});const lock=service.sessions.lockPath(service.sessions.get(session.id));fs.writeFileSync(lock,JSON.stringify({pid:2147483647}));const restarted=new DesktopService(root,data,process.execPath);await restarted.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'继续'});assert.equal(fs.existsSync(lock),false);assert.equal(restarted.sessions.detail(session.id).runs.length,0);assert.equal(restarted.sessions.detail(session.id).session.budget.loopsRemaining,8);
});
test('user credentials are redacted in session lists, detail and pending projections',async()=>{
 const {service,project}=fixture();const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});service.launch=()=>{};await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'first feature',directAcknowledged:true});await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'api_key=private123 secret=password123'});const publicText=JSON.stringify(service.sessions.list())+JSON.stringify(service.sessions.detail(session.id));assert.ok(!publicText.includes('private123'));assert.ok(!publicText.includes('password123'));
});
test('real session creates Run without paid authorization; direct project permission still required',async()=>{
 const {service,project}=fixture();service.launch=()=>{};
 const real=service.sessions.create({operation:'createSession',projectPath:project,mode:'real'});
 await assert.rejects(service.sessions.send({operation:'sendSession',sessionId:real.id,messageId:randomUUID(),text:'开发真实功能'}),/首次直接开发/);assert.equal(service.overview().runs.length,0);
 // A plain folder is refused for real development and the user is told to decide on a test branch.
 await service.sessions.send({operation:'sendSession',sessionId:real.id,messageId:randomUUID(),text:'开发真实功能',directAcknowledged:true});
 const refused=service.sessions.detail(real.id).runs[0];assert.equal(refused.phase,'failed');assert.match(refused.reason,/不是 Git 仓库/);assert.equal(fs.existsSync(path.join(project,'.git')),false);
 await git(project,['init','-b','main']);await git(project,['add','.']);await git(project,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','base']);await git(project,['branch','test']);
 await service.sessions.send({operation:'sendSession',sessionId:real.id,messageId:randomUUID(),text:'开发真实功能'});
 const run=service.sessions.detail(real.id).runs[1];assert.equal(run.mode,'real');assert.equal(run.phase,'interrupted');assert.equal(service.store(run.profileId,run.id).load().config.globalBudget,undefined);
});

test('chat continuation reaches the real Controller launcher and preserves the existing Run',async()=>{
 const {service,project}=fixture(),launch=service.launch;service.launch=()=>{};
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'初始本地测试任务',directAcknowledged:true});
 const ref=service.sessions.get(session.id).runs[0],store=service.store(ref.profileId,ref.id),state=store.load();state.phase='paused';state.nextPhase='planning';store.save(state);service.launch=launch;
 try{
  await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'继续'});
  const completed=await done(service,session.id);assert.equal(completed.phase,'completed');assert.equal(completed.id,ref.id);assert.equal(service.sessions.get(session.id).runs.length,1);
  assert.ok(service.audit(store).some(e=>e.event==='human-decision'&&e.data.decision==='继续'));
 }finally{await service.stopOwned();}
});
test('chat resumes the saved Run without changing limits or approving delivery',async()=>{
 const {service,project}=fixture();const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});service.launch=()=>{};await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'开发功能',directAcknowledged:true});const run=service.sessions.detail(session.id).runs[0],store=service.store(run.profileId,run.id),state=store.load();state.phase='paused';store.save(state);const before=fs.readFileSync(store.file('state.json')),audit=fs.readFileSync(store.file('audit.jsonl'));
 for(const text of ['好','继续','批准所有 Delivery','现在增加预算'])await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text});assert.deepEqual(fs.readFileSync(store.file('state.json')),before);assert.equal(service.sessions.detail(session.id).runs.length,1);assert.ok(service.sessions.detail(session.id).session.messages.slice(1).every(m=>m.status==='executed'));assert.ok(!service.audit(store).some(e=>e.event.startsWith('delivery-')));assert.equal(service.audit(store).filter(e=>e.event==='desktop-chat-dispatch').length,4);
 state.phase='completed';store.save(state);await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'继续'});assert.equal(service.sessions.detail(session.id).runs.length,1);assert.equal(service.sessions.detail(session.id).session.messages.at(-1)?.status,'recorded');
});
test('idempotent send, concurrent send and rename/search state do not duplicate a run',async()=>{
 const {service,project}=fixture();const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});const request={operation:'sendSession' as const,sessionId:session.id,messageId:randomUUID(),text:'first feature',directAcknowledged:true};const attempts=await Promise.allSettled([service.sessions.send(request),service.sessions.send(request)]);assert.ok(attempts.some(r=>r.status==='fulfilled'));await service.sessions.send(request);assert.equal(service.sessions.detail(session.id).runs.length,1);await assert.rejects(service.sessions.send({...request,text:'different'}),/different/);await done(service,session.id);
 service.sessions.rename(session.id,'手工会话名');await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'继续'});assert.equal(service.sessions.detail(session.id).session.title,'手工会话名');assert.equal(service.sessions.list()[0].id,session.id);
});
test('isolated rounds require formal application of previous result; history stays unchanged',async()=>{
 const {service,project}=fixture(true);await git(project,['init']);await git(project,['add','.']);await git(project,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Clean isolation fixture']);const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',projectMode:'isolated'});await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'隔离第一轮'});const run=await done(service,session.id);assert.equal(run.phase,'completed');assert.equal(fs.existsSync(path.join(project,'hello.txt')),false);await assert.rejects(service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'隔离第二轮'}),/尚未正式应用/);assert.equal(service.sessions.detail(session.id).runs.length,1);
});
test('historical Run is imported once with separate session ID; no automatic paid continuation',async()=>{
 const {service}=fixture();await service.prepareMock();const profile=service.overview().profiles[0];const run=await service.start({operation:'start',profileId:profile.id,repository:profile.repositories[0],goal:'历史 Mock',maxClaudeCalls:5,maxLoops:4,maxReworks:1});const first=service.sessions.list(),second=service.sessions.list();assert.deepEqual(first.map(s=>s.id),second.map(s=>s.id));const session=first.find(s=>s.runs.some(r=>r.id===run.id))!;assert.notEqual(session.id,run.id);assert.equal(session.legacy,true);await assert.rejects(service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'new feature'}),/历史会话/);await service.stopOwned();
});
test('new IPC schemas forbid project switching, budget override, approvals and malformed IDs in messages',()=>{
 const base={operation:'sendSession',sessionId:randomUUID(),messageId:randomUUID(),text:'开发功能'};for(const extra of [{projectPath:'D:/other'},{maxLoops:100},{decision:'approved'},{sessionId:'../../secret'}])assert.throws(()=>validateRequest({...base,...extra}));
});
const message=(index:number,extra:Partial<ChatMessage>={}):ChatMessage=>({id:'audit:'+index,time:`2026-10-09T00:00:${String(index%60).padStart(2,'0')}Z`,role:'codex',title:'Codex 执行事件',text:'node test.cjs\ncompleted · exit_code=0\nPASS',kind:'tool',status:'success',category:'commands',timelineIndex:index,runId:'run-1',taskId:'task',loop:1,scope:'execute:1',source:'audit.jsonl:'+index,...extra});

test('formal new session ignores stale Mock project settings and dispatches a fresh real configuration without launching paid agents',async()=>{
 const {service,project}=fixture();service.launch=()=>{};
 const mock=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 await service.sessions.send({operation:'sendSession',sessionId:mock.id,messageId:randomUUID(),text:'Mock local fixture',directAcknowledged:true});
 const old=service.sessions.detail(mock.id).runs[0],store=service.store(old.profileId,old.id);const state=store.load();state.phase='completed';store.save(state);
 assert.equal(service.registry().recentProjects![0].settings.mode,'mock');assert.equal(service.inspectProject(project).settings.mode,'real');
 const real=service.sessions.create({operation:'createSession',projectPath:project});assert.equal(real.settings.mode,'real');
 await service.sessions.send({operation:'sendSession',sessionId:real.id,messageId:randomUUID(),text:'New formal task'});
 const detail=service.sessions.detail(real.id),run=detail.runs[0];assert.equal(run.mode,'real');assert.notEqual(run.id,old.id);assert.notEqual(run.profileId,old.profileId);assert.equal(run.tasks.length,0);assert.equal(run.claudeSessionId,null);assert.equal(run.codexThreadId,null);
 assert.equal(detail.session.runs[0].runtimeDir,service.config(run.profileId).config.runtimeDir);
 assert.equal(service.store(run.profileId,run.id).load().config.mode,'real');assert.equal(service.children.size,0);
});
test('session reads original profile/runtime through restart and unrelated project/profile changes; no cross-runtime UUID fallback',async()=>{
 const {service,project,data}=fixture();service.launch=()=>{};const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'Bound fixture',directAcknowledged:true});const run=service.sessions.detail(session.id).runs[0];
 await service.prepareMock();const unrelated=service.overview().profiles.find(p=>p.id!==run.profileId)!;
 assert.throws(()=>service.store(unrelated.id,run.id),/所属 runtime/);
 const restarted=new DesktopService(root,data,process.execPath);assert.equal(restarted.sessions.detail(session.id).runs[0].profileId,run.profileId);
 const empty=randomUUID();fs.mkdirSync(path.join(service.config(unrelated.id).config.runtimeDir,'runs',empty),{recursive:true});
 const saved=service.sessions.get(session.id);saved.runs.push({id:empty,profileId:run.profileId,runtimeDir:service.config(run.profileId).config.runtimeDir});service.sessions.update(saved);
 const before=fs.readFileSync(service.sessions.file);const detail=service.sessions.detail(session.id);assert.equal(detail.session.status,'unavailable');assert.equal(detail.runs.length,1);assert.equal(detail.session.unavailableRuns![0].id,empty);assert.match(detail.session.unavailableRuns![0].reason,/不存在此 Run/);assert.deepEqual(fs.readFileSync(service.sessions.file),before);
 assert.equal(service.overview().warnings.length,0);assert.match(service.overview().unavailableRuns![0].reason,/未保存 state.json/);
});
test('changed profile runtime recovers only through registered read-only original provenance, preserves references and blocks writes',async()=>{
 const {service,project}=fixture();service.launch=()=>{};const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'Original runtime fixture',directAcknowledged:true});const run=service.sessions.detail(session.id).runs[0],{entry,config}=service.config(run.profileId);
 const history=entry.file+'.history.json';fs.writeFileSync(history,JSON.stringify(config));service.register(history,true);const readonly=service.registry().profiles.find(p=>p.file===history)!;
 fs.writeFileSync(entry.file,JSON.stringify({...config,runtimeDir:path.join(service.data,'changed-runtime')}));service.register(entry.file);
 const before=fs.readFileSync(service.sessions.file);const detail=service.sessions.detail(session.id);assert.equal(detail.runs[0].profileId,readonly.id);assert.equal(detail.session.runs[0].profileId,readonly.id);assert.deepEqual(fs.readFileSync(service.sessions.file),before);
 await assert.rejects(service.dispatch({operation:'stop',profileId:readonly.id,runId:run.id}),/只读/);
 assert.throws(()=>service.store(run.profileId,run.id),/不存在此 Run/);
 const legacy=service.sessions.get(session.id);delete legacy.runs[0].runtimeDir;service.sessions.update(legacy);assert.equal(service.sessions.detail(session.id).runs[0].profileId,readonly.id);
});
test('prepare failure remains durable, linked to the exact message, and never starts agents',async()=>{
 const {service,project}=fixture();let launches=0;service.launch=()=>{launches++;};
 fs.writeFileSync(path.join(project,'link-source.bin'),'unsafe hardlink fixture');fs.linkSync(path.join(project,'link-source.bin'),path.join(project,'unsafe-link.bin'));
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',projectMode:'isolated'}),messageId=randomUUID();
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId,text:'Preparation failure fixture'});
 const {session:saved,runs}=service.sessions.detail(session.id);assert.equal(runs.length,1);assert.equal(runs[0].phase,'failed');assert.match(runs[0].reason,/no longer automatic/);assert.equal(saved.messages[0].runId,runs[0].id);assert.equal(saved.messages[0].status,'failed');assert.equal(launches,0);assert.equal(service.overview().unavailableRuns!.length,0);
 const store=service.store(runs[0].profileId,runs[0].id);assert.equal(store.load().failure!.stage,'prepare');assert.equal(store.load().failure!.recoverable,false);assert.ok(service.audit(store).some(e=>e.event==='desktop-session-link'&&e.data.messageId===messageId));
});
test('large project session preparation preserves original runtime provenance without paid agents',async()=>{
 const {service,project}=fixture();let launches=0;service.launch=()=>{launches++;};
 const fd=fs.openSync(path.join(project,'large.bin'),'w');fs.ftruncateSync(fd,101*1024*1024);fs.closeSync(fd);
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'}),messageId=randomUUID();
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId,text:'Large preparation fixture',directAcknowledged:true});
 const {session:saved,runs}=service.sessions.detail(session.id);assert.equal(runs.length,1);assert.equal(runs[0].phase,'interrupted');assert.equal(launches,1);assert.equal(saved.messages[0].runId,runs[0].id);
 const store=service.store(runs[0].profileId,runs[0].id);assert.equal(saved.runs[0].runtimeDir,store.load().config.runtimeDir);assert.equal(store.load().source,fs.realpathSync(project));assert.equal(store.load().failure,undefined);
 assert.equal(store.load().snapshotPolicy,'none');assert.equal(fs.existsSync(store.file('project-baseline.json')),false);assert.equal(fs.existsSync(store.file('snapshot-objects')),false);
});
test('Mock completion projection explicitly denies completion of the real development goal',()=>{
 const state={id:'fixture',goal:'real development goal',config:{mode:'mock'},tasks:[]} as unknown as State;
 const messages=projectMessages(state,[{hash:'fixture',time:'now',event:'transition',data:{phase:'completed',reason:'checks passed'}}],[]);
 assert.match(messages[0].title,/Mock 演练完成/);assert.match(messages[0].title,/未完成真实开发目标/);
});
test('old implicit Mock sessions cannot dispatch new development tasks; explicit real cannot use a Mock profile',async()=>{
 const {service,project}=fixture();service.launch=()=>{};const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'}),saved=service.sessions.get(session.id);delete saved.mockExplicit;service.sessions.update(saved);
 const result=await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'Formal development goal',directAcknowledged:true});assert.equal(result.messages[0].status,'failed');assert.match(result.messages[0].error!,/未记录明确/);assert.equal(service.overview().runs.length,0);
 await service.prepareMock();const profile=service.overview().profiles[0];await assert.rejects(service.start({operation:'start',profileId:profile.id,mode:'real',repository:profile.repositories[0],goal:'Formal task'}),/模式与 Profile 不一致/);assert.equal(service.children.size,0);
});
test('same agent/category/run/task/round consecutive events group and retain originals',()=>{const raw=[message(0),message(1),message(2)],groups=groupMessages(raw);assert.equal(groups.length,1);assert.equal(groups[0].messages.length,3);assert.equal(groups[0].id,'group:audit:0');assert.deepEqual(groups.flatMap(g=>g.messages),raw);assert.equal(groups[0].firstTime,raw[0].time);assert.equal(groups[0].lastTime,raw[2].time);});
for(const [name,extra] of Object.entries({category:{category:'files'},agent:{role:'claude'},run:{runId:'run-2'},task:{taskId:'other'},round:{loop:2},dispatch:{scope:'execute:2'},invisibleBoundary:{timelineIndex:4},error:{kind:'error',status:'fail'},decision:{role:'controller',kind:'review',status:'human'}}))test('group boundary: '+name,()=>{assert.equal(groupMessages([message(0),message(1,extra as Partial<ChatMessage>)]).length,2);});
test('commands never merge across intervening changes or important events, even after role filtering',()=>{const raw=[message(0),message(1),message(2,{category:'files'}),message(3),message(4,{role:'controller',kind:'tests',category:undefined}),message(5,{role:'claude',kind:'review',category:undefined})];assert.deepEqual(groupMessages(raw).map(g=>g.messages.length),[2,1,1,1,1]);assert.deepEqual(groupMessages(raw).filter(g=>g.messages[0].role==='codex').map(g=>g.messages.length),[2,1,1]);});
test('incremental append, replay and stable first ID preserve every event without duplicates',()=>{const raw=Array.from({length:500},(_,i)=>message(i));const initial=groupMessages(raw.slice(0,200)),full=groupMessages(raw);assert.equal(initial[0].id,full[0].id);assert.deepEqual(full,groupMessages(JSON.parse(JSON.stringify(raw))));assert.equal(new Set(full.flatMap(g=>g.messages.map(m=>m.id))).size,500);});
test('10000 events with long outputs group in linear time without losing output',()=>{const text='actual stdout\n'.repeat(10000),raw=Array.from({length:10000},(_,i)=>message(i,{text}));const start=performance.now(),groups=groupMessages(raw);assert.ok(performance.now()-start<2000);assert.equal(groups[0].messages.length,10000);assert.equal(groups[0].messages[9999].text,text);});
test('projection distinguishes files/tools and running/failure, preserves same-time audit order',()=>{const state={id:'run',goal:'goal',tasks:[]} as unknown as State,events=[{hash:'z',time:'now',event:'agent-activity',data:{agent:'codex',source:'codex-sdk-runStreamed',kind:'tool',title:'Codex 执行事件',text:'node\nin_progress · exit_code=pending',scope:'a'}},{hash:'a',time:'now',event:'agent-activity',data:{agent:'codex',source:'codex-sdk-runStreamed',kind:'tool',title:'Codex 文件操作',text:'completed',scope:'a'}},{hash:'b',time:'now',event:'agent-activity',data:{agent:'codex',source:'codex-sdk-runStreamed',kind:'tool',title:'Codex 执行事件',text:'node\nfailed · exit_code=1',scope:'a'}}];const result=projectMessages(state,events,[]);assert.deepEqual(result.map(m=>m.id),['audit:z','audit:a','audit:b']);assert.deepEqual(result.map(m=>m.category),['commands','files','commands']);assert.equal(result[0].status,'running');assert.equal(result[2].status,'fail');assert.equal(groupMessages(result).length,3);});
test('complete long output is fetched by stable event ID and verified against audit hash',async()=>{
 const {service}=fixture();await service.prepareMock();const profile=service.overview().profiles[0],run=await service.start({operation:'start',profileId:profile.id,repository:profile.repositories[0],goal:'evidence',maxClaudeCalls:5,maxLoops:4,maxReworks:1});for(let i=0;i<250;i++){if(!service.detail(profile.id,run.id).run.active)break;await new Promise(r=>setTimeout(r,60));}
 const store=service.store(profile.id,run.id);const {activityRecorder}=await import('../../dist/src/telemetry.js');const full='stdout\n'.repeat(15000);activityRecorder(store.load(),store,'codex','output-proof')({key:'long',kind:'tool',title:'Codex 执行事件',text:full});const event=service.audit(store).at(-1);assert.equal(event.data.text.length,6000);const evidence=service.messageEvidence(profile.id,run.id,'audit:'+event.hash);assert.equal(evidence.text,full);fs.appendFileSync(store.file(event.data.fullTextFile),'tampered');assert.throws(()=>service.messageEvidence(profile.id,run.id,'audit:'+event.hash),/hash mismatch/);assert.throws(()=>validateRequest({operation:'messageEvidence',profileId:profile.id,runId:run.id,messageId:'../../password'}));
});
test('thread projection cache avoids re-reading unchanged audit and invalidates on append or tampering',async()=>{
 const {service}=fixture();await service.prepareMock();const profile=service.overview().profiles[0];service.launch=()=>{};const run=await service.start({operation:'start',profileId:profile.id,repository:profile.repositories[0],goal:'cache proof',maxClaudeCalls:5,maxLoops:4,maxReworks:1});let reads=0;const original=service.audit.bind(service);service.audit=store=>{reads++;return original(store);};const initial=service.thread(profile.id,run.id);service.thread(profile.id,run.id);assert.equal(reads,1);const store=service.store(profile.id,run.id);store.audit('agent-activity',{agent:'codex',kind:'summary',title:'progress',text:'actual fixture event'});assert.equal(service.thread(profile.id,run.id).total,initial.total+1);assert.equal(reads,2);fs.appendFileSync(store.file('audit.jsonl'),'{}\n');assert.throws(()=>service.thread(profile.id,run.id),/integrity/);
});

test('promote queued input with image/file into the owned Run without touching Controller state/audit; cancel before claim',async()=>{
 const {service,project,data}=fixture();service.launch=()=>{};
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'first task',directAcknowledged:true});
 const run=service.sessions.detail(session.id).runs[0],store=service.store(run.profileId,run.id);
 service.children.set(run.id,{} as any);
 try{
  const id=randomUUID(),png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=';
  const attachments=[{name:'pixel.png',mimeType:'image/png',size:Buffer.from(png,'base64').length,dataUrl:'data:image/png;base64,'+png},{name:'requirements.md',mimeType:'text/plain',size:5,content:'later'}];
  await service.dispatch({operation:'sendSession',sessionId:session.id,messageId:id,text:'adjust with attachments',attachments});
  const before=fs.readFileSync(store.file('state.json')),audit=fs.readFileSync(store.file('audit.jsonl'));
  const promoted=await service.dispatch({operation:'steerSessionMessage',sessionId:session.id,messageId:id}) as Conversation;
  assert.equal(promoted.messages.at(-1)?.status,'steering');assert.equal(promoted.runs.length,1);assert.equal(pendingGuidance(store)[0].attachments.length,2);
  assert.deepEqual(fs.readFileSync(store.file('state.json')),before);assert.deepEqual(fs.readFileSync(store.file('audit.jsonl')),audit);
  await service.dispatch({operation:'steerSessionMessage',sessionId:session.id,messageId:id});assert.equal(pendingGuidance(store).length,1);
  const restarted=new DesktopService(root,data,process.execPath);assert.equal(restarted.sessions.detail(session.id).session.messages.at(-1)?.status,'steering');
  const image=await service.dispatch({operation:'sessionAttachment',sessionId:session.id,messageId:id,digest:promoted.messages.at(-1)!.attachments![0].sha256}) as {dataUrl:string};assert.equal(image.dataUrl,'data:image/png;base64,'+png);
  assert.throws(()=>service.sessions.attachment({operation:'sessionAttachment',sessionId:session.id,messageId:randomUUID(),digest:promoted.messages.at(-1)!.attachments![0].sha256}),/不存在/);
  await service.dispatch({operation:'cancelSessionMessage',sessionId:session.id,messageId:id});assert.equal(guidanceStatus(store,id),'cancelled');assert.equal(pendingGuidance(store).length,0);
  assert.deepEqual(fs.readFileSync(store.file('state.json')),before);
 }finally{service.children.delete(run.id);}
});

test('claimed guidance rejects deletion/edit and projects adjusting; accepted guidance projects executed',async()=>{
 const {service,project}=fixture();service.launch=()=>{};
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'first',directAcknowledged:true});
 const run=service.sessions.detail(session.id).runs[0],store=service.store(run.profileId,run.id);service.children.set(run.id,{} as any);
 try{
  const id=randomUUID();await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:id,text:'change next'});await service.sessions.steer({operation:'steerSessionMessage',sessionId:session.id,messageId:id});
  const input=claimGuidance(store)!;assert.equal(service.sessions.detail(session.id).session.messages.at(-1)?.status,'adjusting');
  await assert.rejects(service.dispatch({operation:'cancelSessionMessage',sessionId:session.id,messageId:id}),/已接收/);
  await assert.rejects(service.dispatch({operation:'editSessionMessage',sessionId:session.id,messageId:id,text:'replacement'}),/已接收/);
  const state=store.load();state.guidanceHistory=[input];store.save(state);
  assert.equal(service.sessions.detail(session.id).session.messages.at(-1)?.status,'executed');assert.equal(runAttachments(state,store).length,0);
 }finally{service.children.delete(run.id);}
});

test('editing promoted but unclaimed message withdraws its old content before requeue',async()=>{
 const {service,project}=fixture();service.launch=()=>{};
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'first',directAcknowledged:true});
 const run=service.sessions.detail(session.id).runs[0],store=service.store(run.profileId,run.id);service.children.set(run.id,{} as any);
 try{
  const id=randomUUID();await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:id,text:'old request'});await service.sessions.steer({operation:'steerSessionMessage',sessionId:session.id,messageId:id});
  const edited=service.sessions.edit({operation:'editSessionMessage',sessionId:session.id,messageId:id,text:'new request'});assert.equal(edited.messages.at(-1)?.status,'pending');assert.equal(pendingGuidance(store).length,0);
  await service.sessions.steer({operation:'steerSessionMessage',sessionId:session.id,messageId:id});assert.equal(pendingGuidance(store)[0].text,'new request');
 }finally{service.children.delete(run.id);}
});
