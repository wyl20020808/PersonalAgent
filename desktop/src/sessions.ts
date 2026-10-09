import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {atomicJson} from '../../dist/src/store.js';
import {redact} from '../../dist/src/telemetry.js';
import type {DesktopService} from './service.js';
import type {Conversation,Request,Run} from './types.js';

type Saved=Omit<Conversation,'budget'|'status'|'lastMessage'>;
const active=['planning','execute','executing','applying','verify','review'];
const acknowledgement=/^(好[的]?|继续|可以|ok|yes|批准[。！!]?|同意[。！!]?)[。！!\s]*$/i;
export class SessionStore {
 readonly inFlight=new Set<string>();
 readonly file:string;
 constructor(readonly service:DesktopService){this.file=path.join(service.data,'sessions.json');}
 lockPath(session:Saved){return path.join(this.service.data,'session-project-'+createHash('sha256').update(session.projectPath.toLowerCase()).digest('hex')+'.lock');}
 lockAlive(file:string){if(!fs.existsSync(file))return false;try{const pid=JSON.parse(fs.readFileSync(file,'utf8')).pid;if(!Number.isInteger(pid)||pid<1)return true;try{process.kill(pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException).code!=='ESRCH';}}catch{return true;}}
 acquire(session:Saved){const file=this.lockPath(session);if(fs.existsSync(file)&&!this.lockAlive(file))fs.unlinkSync(file);let descriptor:number;try{descriptor=fs.openSync(file,'wx');}catch{throw Error('此项目正在处理消息，请稍后重试；未重复启动');}fs.writeFileSync(descriptor,JSON.stringify({pid:process.pid,sessionId:session.id}));fs.fsyncSync(descriptor);return ()=>{fs.closeSync(descriptor);fs.unlinkSync(file);};}
 read():Saved[]{const items:Saved[]=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):[];return items.map(s=>({...s,settings:{...s.settings,decisionAgent:s.settings.decisionAgent??{backend:'claude-code'}}}));}
 save(items:Saved[]){atomicJson(this.file,items);}
 get(id:string){const session=this.read().find(s=>s.id===id);if(!session)throw Error('会话不存在');return session;}
 update(session:Saved){const items=this.read(),index=items.findIndex(s=>s.id===session.id);if(index<0)throw Error('会话不存在');items[index]=session;this.save(items);}
 create(r:Request):Conversation {
  const project=this.service.inspectProject(r.projectPath!);
  const session:Saved={id:randomUUID(),title:'新会话',manualTitle:false,projectPath:project.path,projectName:project.name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),settings:{decisionAgent:r.decisionAgent??{backend:'claude-code'},mode:r.mode??'mock',projectMode:r.projectMode??'direct',maxClaudeCalls:r.maxClaudeCalls??5,maxLoops:r.maxLoops??8,maxReworks:r.maxReworks??1},selectedTests:r.selectedTests??[],directAuthorized:project.directAuthorized,runs:[],messages:[]};
  if(session.selectedTests.some(t=>!project.testCommands.includes(t)))throw Error('测试命令与项目检测不匹配');
  const items=this.read();items.push(session);this.save(items);return this.public(session);
 }
 importHistory(){
  const items=this.read(),known=new Set(items.flatMap(s=>s.runs.map(r=>r.id)));let changed=false;
  for(const run of this.service.overview().runs){if(known.has(run.id))continue;
   // Historical runs remain separate, inspectable records; no implicit continuation authorization.
   items.push({id:randomUUID(),title:run.goal.slice(0,32),manualTitle:false,projectPath:run.source,projectName:path.basename(run.source),createdAt:run.updatedAt,updatedAt:run.updatedAt,settings:{decisionAgent:run.decisionAgent?.backend==='opencode'?{backend:'opencode',opencode:{providerID:run.decisionAgent.providerID!,modelID:run.decisionAgent.modelID!}}:{backend:'claude-code'},mode:run.mode as 'mock'|'real',projectMode:run.projectMode??'isolated',...run.config},selectedTests:[],directAuthorized:false,profileId:run.profileId,runs:[{id:run.id,profileId:run.profileId}],messages:[],legacy:true});changed=true;
  }if(changed)this.save(items);
 }
 run(ref:{id:string;profileId:string}){return this.service.publicRun(this.service.store(ref.profileId,ref.id).load(),ref.profileId);}
 public(session:Saved):Conversation {
  const runs=session.runs.map(r=>this.run(r)),last=runs.at(-1);
  const claudeUsed=runs.reduce((n,r)=>n+r.claudeCalls,0),loopsUsed=runs.reduce((n,r)=>n+r.loops,0);
  // An interrupted launch is never silently retried: locate its durable Controller link.
  let changed=false;
  for(const message of session.messages){if(message.status==='starting'&&message.runId){message.status='executed';changed=true;}else if(message.status==='starting'&&!this.inFlight.has(session.id)&&!this.lockAlive(this.lockPath(session))){message.status='failed';message.error='启动中断；请检查运行记录后明确重试。';changed=true;}}
  if(changed)this.update(session);
  return {...session,title:redact(session.title),messages:session.messages.map(m=>({...m,text:redact(m.text),error:m.error?redact(m.error):undefined})),budget:{claudeUsed,loopsUsed,claudeRemaining:Math.max(0,session.settings.maxClaudeCalls-claudeUsed),loopsRemaining:Math.max(0,session.settings.maxLoops-loopsUsed)},status:last?.phase??'idle',updatedAt:[session.updatedAt,...runs.map(r=>r.updatedAt)].sort().at(-1)!,lastMessage:redact(session.messages.at(-1)?.text??last?.goal??'选择项目后，在群聊发送开发要求')};
 }
 list(){this.importHistory();return this.read().map(s=>this.public(s)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));}
 detail(id:string){const session=this.public(this.get(id));return {session,runs:session.runs.map(r=>this.run(r))};}
 rename(id:string,title:string){const session=this.get(id),release=this.acquire(session);try{session.title=title.trim();if(!session.title)throw Error('会话名称不能为空');session.manualTitle=true;session.updatedAt=new Date().toISOString();this.update(session);return this.public(session);}finally{release();}}
 edit(r:Request,cancel=false){const session=this.get(r.sessionId!),release=this.acquire(session);try{const message=session.messages.find(m=>m.id===r.messageId);if(!message||!['pending','failed'].includes(message.status))throw Error('仅可修改或取消尚未生效的需求');if(cancel)message.status='cancelled';else{message.text=r.text!.trim();if(!message.text)throw Error('消息不能为空');message.error=undefined;message.status='pending';}session.updatedAt=new Date().toISOString();this.update(session);return this.public(session);}finally{release();}}
 async send(r:Request,process=false){
  const session=this.get(r.sessionId!);
  const release=this.acquire(session);
  this.inFlight.add(session.id);
  try{return await this.sendLocked(r,process);}finally{this.inFlight.delete(session.id);release();}
 }
 private async sendLocked(r:Request,process:boolean){
  const session=this.get(r.sessionId!);if(session.legacy)throw Error('历史会话只供回放；请新建会话并明确授权项目');
  let message=session.messages.find(m=>m.id===r.messageId);
  if(!process&&message){if(message.text!==r.text!.trim())throw Error('Message ID reused with different content');return this.public(session);}
  if(process&&(!message||!['pending','failed'].includes(message.status)))throw Error('需求已处理或已取消');
  if(!message){if(session.messages.length>=1000)throw Error('会话消息已达上限');message={id:r.messageId!,time:new Date().toISOString(),text:r.text!.trim(),status:'pending'};if(!message.text)throw Error('消息不能为空');session.messages.push(message);if(!session.manualTitle&&session.messages.length===1)session.title=message.text.replace(/\s+/g,' ').slice(0,32);}
  session.updatedAt=new Date().toISOString();this.update(session);
  const current=session.runs.map(ref=>this.run(ref)),last=current.at(-1);
  const projectRuns=this.service.overview().runs.filter(run=>run.source.toLowerCase()===session.projectPath.toLowerCase());
  if(projectRuns.some(run=>run.active||active.includes(run.phase))||last&&last.phase!=='completed'){message.status='pending';this.update(session);return this.public(session);}
  if(acknowledgement.test(message.text)){message.status='recorded';this.update(session);return this.public(session);}
  try{
   if(last?.projectMode==='isolated'){
    const deliveries=await this.service.deliveries(last.profileId,last.id);
    if(!deliveries.some(d=>d.phase==='applied'))throw Error('前轮隔离成果尚未正式应用；请先完成具体交付审批与应用');
   }
   // Every run gets fresh task/session state and current project snapshot. Prior tasks are context only.
   let goal=message.text;
   if(last)goal+='\n\n[前轮项目状态，仅供上下文，不重复执行历史任务]\n'+JSON.stringify({runId:last.id,goal:session.messages.find(m=>m.runId===last.id)?.text??last.goal.slice(0,5000),completedTaskIds:last.completedTaskIds,reason:last.reason.slice(0,2000),evidence:last.evidence?{passed:last.evidence.passed,issues:last.evidence.issues.slice(0,20)}:null})+'\n请读取当前项目文件，只规划本条新要求。';
   message.status='starting';this.update(session);
   const linked=(run:Run)=>{session.profileId=run.profileId;session.runs.push({id:run.id,profileId:run.profileId});message!.runId=run.id;message!.status='executed';session.directAuthorized=true;this.update(session);this.service.store(run.profileId,run.id).audit('desktop-session-link',{sessionId:session.id,messageId:message!.id});};
   if(!session.profileId){
    await this.service.startProject({operation:'startProject',projectPath:session.projectPath,goal,...session.settings,maxLoops:session.settings.maxLoops,selectedTests:session.selectedTests,directAcknowledged:r.directAcknowledged===true||session.directAuthorized,realAcknowledged:r.realAcknowledged},linked);
   }else{
    // Revalidate immutable, hashed config and project identity before launching another run.
    const {config}=this.service.config(session.profileId);
    if(JSON.stringify(config.decisionAgent??{backend:'claude-code'})!==JSON.stringify(session.settings.decisionAgent??{backend:'claude-code'}))throw Error('会话决策后端已改变，拒绝启动');
    if(config.mode!==session.settings.mode||config.projectMode!==session.settings.projectMode||config.allowedRepositories.length!==1||config.allowedRepositories[0].toLowerCase()!==session.projectPath.toLowerCase())throw Error('会话项目授权已改变，拒绝启动');
    await this.service.start({operation:'start',profileId:session.profileId,repository:session.projectPath,goal,maxLoops:session.settings.maxLoops,maxReworks:session.settings.maxReworks,realAcknowledged:r.realAcknowledged},linked);
   }
  }catch(error){if(!message.runId){message.status='failed';message.error=(error as Error).message;this.update(session);}throw error;}
  return this.public(session);
 }
}
