import {MAX_ATTACHMENT_BYTES} from '../../dist/src/attachment-types.js';
import {discoverOpencodeExecutionModels,switchExecutionAgent} from '../../dist/src/opencode-execution-agent.js';
import {discoverOpencodeModels} from '../../dist/src/opencode-decision-agent.js';
import { runUsage } from "../../dist/src/call-observation.js";
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {createRun as runtimeCreateRun} from '../../dist/src/controller.js';
import {Store as RuntimeStore,assertD,atomicJson} from '../../dist/src/store.js';
import type {State} from '../../src/store.js';
import {configSchema,validate as runtimeValidate} from '../../dist/src/schema.js';
import type {Config} from '../../src/schema.js';
import {previewDelivery as runtimePreview,approveDelivery as runtimeApprove,applyDelivery as runtimeApply,deliveryStatus as runtimeStatus} from '../../dist/src/delivery.js';
import {git,controlledEnv,nativeAgentEnv} from '../../dist/src/workspace.js';
import {acceptManual,manualAcceptanceDigest} from '../../dist/src/manual-acceptance.js';
import {decideContextConfirmation,pendingContextConfirmations} from '../../dist/src/context-confirmation.js';
import {FlowError} from '../../dist/src/failure.js';
import {instanceId,sharedRuntime} from '../../dist/src/instance-runtime.js';
import {projectMessages,messagePage} from './thread.js';
import {SessionStore} from './sessions.js';
import {collectScreenshots,screenshotBytes} from '../../dist/src/screenshots.js';
import {projectTarget} from '../../dist/src/project-files.js';
import type {Screenshot} from '../../src/screenshots.js';
import type {Note,Request,Profile,Run,Delivery,Overview,Activity,Project,DecisionAgent,DecisionModels} from './types.js';
const Store=RuntimeStore as typeof import('../../src/store.js').Store;
type Store=import('../../src/store.js').Store;
const validate=runtimeValidate as typeof import('../../src/schema.js').validate;
const createRun=runtimeCreateRun as typeof import('../../src/controller.js').createRun;
const previewDelivery=runtimePreview as typeof import('../../src/delivery.js').previewDelivery;
const approveDelivery=runtimeApprove as typeof import('../../src/delivery.js').approveDelivery;
const applyDelivery=runtimeApply as typeof import('../../src/delivery.js').applyDelivery;
const deliveryStatus=runtimeStatus as typeof import('../../src/delivery.js').deliveryStatus;

// A thin trusted adapter. Scheduling, checks, flow limits and delivery remain Controller-owned.
type Registered={id:string;file:string;hash:string;readOnly:boolean};
type Registry={profiles:Registered[];reducedMotion:boolean;recentProjects?:Project[]};
type ProjectConfig=Config&{projectMode?:'direct'|'isolated';directAuthorization?:{projectPath:string;acknowledgedAt:string}};
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const uuid={type:'string',pattern:'^[0-9a-f-]{36}$'},str={type:'string',minLength:1,maxLength:10000};
const attachment={type:'object',additionalProperties:false,required:['name','mimeType','size'],properties:{name:{type:'string',minLength:1,maxLength:240},mimeType:{type:'string',maxLength:120},size:{type:'integer',minimum:0,maximum:MAX_ATTACHMENT_BYTES},content:{type:'string',maxLength:MAX_ATTACHMENT_BYTES},dataUrl:{type:'string',maxLength:Math.ceil(MAX_ATTACHMENT_BYTES/3)*4+64}}};
const desktopDecisionSchema={oneOf:[{type:'object',additionalProperties:false,required:['backend'],properties:{backend:{const:'codex'},model:{type:'string',pattern:'^[a-zA-Z0-9._:/-]{1,200}$'}}},{type:'object',additionalProperties:false,required:['backend'],properties:{backend:{const:'claude-code'},model:{type:'string',pattern:'^[a-zA-Z0-9._:/-]{1,200}$'}}},{type:'object',additionalProperties:false,required:['backend','opencode'],properties:{backend:{const:'opencode'},opencode:{type:'object',additionalProperties:false,required:['providerID','modelID'],properties:{providerID:str,modelID:str}}}}]};
const desktopExecutionSchema={oneOf:[{type:'object',additionalProperties:false,required:['backend'],properties:{backend:{const:'codex'}}},desktopDecisionSchema.oneOf[2]]};
const desktopDiscussionSchema={type:'object',additionalProperties:false,required:['participants','primary','rounds'],properties:{
 participants:{type:'array',minItems:2,maxItems:2,items:{type:'object',additionalProperties:false,required:['id','agent'],properties:{id:{enum:['a','b']},agent:desktopDecisionSchema}}},
 primary:{enum:['a','b']},rounds:{enum:[0,1]}
}};
const schemas:Record<string,object>=Object.create(null);
const schema=(operation:string,properties:Record<string,object>={},required:string[]=Object.keys(properties))=>schemas[operation]={type:'object',additionalProperties:false,required:['operation',...required],properties:{operation:{const:operation},...properties}};
schema('overview');schema('prepareMock');schema('importProfile',{file:{type:'string',minLength:1,maxLength:4096,pattern:'^[dD]:[\\\\/]'}},[]);
schema('decisionModels',{projectPath:str},[]);schema('executionModels',{projectPath:str},[]);schema('chooseProject');schema('inspectProject',{projectPath:str});
schema('sessions');schema('sessionDetail',{sessionId:uuid});
schema('createSession',{executionAgent:desktopExecutionSchema,decisionAgent:desktopDecisionSchema,decisionDiscussion:desktopDiscussionSchema,projectPath:str,mode:{enum:['mock','real']},projectMode:{enum:['direct','isolated']},maxClaudeCalls:{type:'integer',minimum:1,maximum:100},maxLoops:{type:'integer',minimum:1,maximum:100},maxReworks:{type:'integer',minimum:0,maximum:20},selectedTests:{type:'array',uniqueItems:true,maxItems:20,items:str}},['projectPath']);
schema('renameSession',{sessionId:uuid,title:{...str,maxLength:80}});
 schema('sendSession',{sessionId:uuid,messageId:uuid,text:{...str,maxLength:5000},attachments:{type:'array',maxItems:8,items:attachment},directAcknowledged:{type:'boolean'},realAcknowledged:{type:'boolean'}},['sessionId','messageId','text']);
 schema('listProjectFiles',{projectPath:str,file:{type:'string',maxLength:1000}},['projectPath','file']);
 schema('readProjectFile',{projectPath:str,file:{type:'string',minLength:1,maxLength:1000}},['projectPath','file']);
schema('processSessionMessage',{sessionId:uuid,messageId:uuid,directAcknowledged:{type:'boolean'},realAcknowledged:{type:'boolean'}},['sessionId','messageId']);
schema('editSessionMessage',{sessionId:uuid,messageId:uuid,text:{...str,maxLength:5000}});
schema('cancelSessionMessage',{sessionId:uuid,messageId:uuid});
schema('startProject',{executionAgent:desktopExecutionSchema,decisionAgent:desktopDecisionSchema,decisionDiscussion:desktopDiscussionSchema,selectedTests:{type:'array',uniqueItems:true,maxItems:20,items:str},projectPath:str,goal:{...str,maxLength:20000},projectMode:{enum:['direct','isolated']},workspaceMode:{enum:['direct','isolated']},mode:{enum:['mock','real']},maxClaudeCalls:{type:'integer',minimum:1,maximum:100},maxLoops:{type:'integer',minimum:1,maximum:100},maxReworks:{type:'integer',minimum:0,maximum:20},scenario:{enum:['pass','rework','human','fail','timeout']},directAcknowledged:{type:'boolean'},realAcknowledged:{type:'boolean'}},['projectPath','goal','mode']);
schema('start',{profileId:uuid,mode:{enum:['mock','real']},goal:{...str,maxLength:20000},repository:str,maxClaudeCalls:{type:'integer',minimum:1,maximum:100},maxLoops:{type:'integer',minimum:1,maximum:100},maxReworks:{type:'integer',minimum:0,maximum:20},scenario:{enum:['pass','rework','human','fail','timeout']},realAcknowledged:{type:'boolean'}},['profileId','goal','repository']);

const runProps={profileId:uuid,runId:uuid};
schema('messageEvidence',{...runProps,messageId:{type:'string',pattern:'^audit:[a-f0-9]{64}$'}});
schema('thread',{...runProps,after:{type:'string',maxLength:100,pattern:'^[a-zA-Z0-9:-]+$'}},['profileId','runId']);
schema('pictures',runProps);schema('note',{...runProps,messageId:uuid,text:{type:'string',minLength:1,maxLength:5000}});
schema('detail',runProps);schema('stop',runProps);
schema('resume',{...runProps,executionAgent:desktopExecutionSchema,decision:str,maxReworks:{type:'integer',minimum:0,maximum:20},intent:{enum:['resume','visual','rework']},pictureIds:{type:'array',uniqueItems:true,maxItems:12,items:{type:'string',pattern:'^[a-f0-9]{64}$'}}},['profileId','runId','decision']);
schema('contextDecide',{...runProps,requestId:uuid,digest:{type:'string',pattern:'^[0-9a-f]{64}$'},decision:str,cancel:{type:'boolean'},contextAction:{enum:['accepted','rejected']}},['profileId','runId','requestId','digest','decision']);
schema('deliveries',runProps);schema('manualAccept',{...runProps,digest:{type:'string',pattern:'^[0-9a-f]{64}$'},decision:str});
schema('preview',{...runProps,target:str,branch:{...str,maxLength:240}});
schema('approve',{...runProps,deliveryId:uuid,digest:{type:'string',pattern:'^[0-9a-f]{64}$'},decision:str});
schema('apply',{...runProps,deliveryId:uuid,resume:{type:'boolean'}},['profileId','runId','deliveryId']);schema('preferences',{reducedMotion:{type:'boolean'}});
export function validateRequest(request:unknown):Request {
 const operation=(request as Request)?.operation;if(!operation||!schemas[operation])throw Error('Unknown desktop operation');const r=validate<Request>(schemas[operation],request);if(operation==='startProject'){if(r.projectMode&&r.workspaceMode&&r.projectMode!==r.workspaceMode)throw Error('Conflicting projectMode and workspaceMode');const {workspaceMode,...canonical}=r;return {...canonical,projectMode:r.projectMode??workspaceMode??'direct'};}return r;
}
export function redact(text:string):string {return text.replace(/\b(?:sk-[\w-]{8,}|gh[pousr]_[\w]{12,})\b/g,'[已隐藏凭据]').replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)\s*["']?\s*[:=]\s*["']?)[^\s,"'\r\n}]+/gi,'$1[已隐藏凭据]').replace(/Bearer\s+[\w.\/-]+/gi,'Bearer [已隐藏凭据]');}
export class DesktopService {
 readonly sessions:SessionStore;
 private readonly previewRoots=new Set<string>();
 private readonly threadCache=new Map<string,{fingerprint:string;messages:import('./types.js').ChatMessage[];capabilities:import('./types.js').ThreadPage['capabilities']}>();
 readonly children=new Map<string,ChildProcess>();readonly registryFile:string;
 private readonly deliveryQueues=new Map<string,Promise<unknown>>();
 private async serializeDelivery<T>(id:string,operation:()=>Promise<T>):Promise<T>{
  const previous=this.deliveryQueues.get(id)??Promise.resolve();
  const pending=previous.catch(()=>{}).then(operation);this.deliveryQueues.set(id,pending);
  try{return await pending;}finally{if(this.deliveryQueues.get(id)===pending)this.deliveryQueues.delete(id);}
 }
 constructor(readonly root:string,readonly data:string,readonly node:string,readonly discover:(executable?:string,directory?:string)=>Promise<DecisionModels>=discoverOpencodeModels,readonly discoverExecution:typeof discoverOpencodeModels=discoverOpencodeExecutionModels){assertD(root);assertD(data);if(!path.isAbsolute(node)||!fs.existsSync(node))throw Error('Native Node executable required');fs.mkdirSync(data,{recursive:true});this.registryFile=path.join(data,'profiles.json');if(!fs.existsSync(this.registryFile))atomicJson(this.registryFile,{profiles:[],reducedMotion:false});this.sessions=new SessionStore(this);}
 async decisionModels(projectPath?:string,executable?:string,execution=false):Promise<DecisionModels>{
  try{
   const directory=projectPath?this.inspectProject(projectPath).path:this.root;
   const result:DecisionModels=await (execution?this.discoverExecution:this.discover)(executable,directory);
   const clean=(value:string)=>redact(value).slice(0,240);
   const capability=(value:unknown):boolean|'unknown'=>typeof value==='boolean'?value:'unknown';
   const providers=result.providers.map(p=>({id:clean(p.id),name:clean(p.name),models:p.models.map(m=>({id:clean(m.id),name:clean(m.name),capabilities:{tools:capability(m.capabilities.tools),structuredOutput:capability(m.capabilities.structuredOutput)}}))}));
   const available=result.available&&providers.some(p=>p.models.some(m=>m.capabilities.tools===true&&m.capabilities.structuredOutput===true));
   return {available,reason:available?'':clean(result.reason||'无已连接且支持原生工具与结构化输出的模型'),providers};
  }catch(error){return {available:false,reason:redact((error as Error).message).slice(0,500),providers:[]};}
 }
 async validateExecution(selection:Config["executionAgent"],projectPath:string){
  const choice=validate<NonNullable<Config["executionAgent"]>>(configSchema.properties.executionAgent,selection??{backend:"codex"});
  if(choice.backend==="opencode"){const discovery=await this.decisionModels(projectPath,choice.opencode.executable,true),model=discovery.providers.find(p=>p.id===choice.opencode.providerID)?.models.find(m=>m.id===choice.opencode.modelID);if(!discovery.available||model?.capabilities.tools!==true||model.capabilities.structuredOutput!==true)throw Error("OpenCode 执行不可用："+discovery.reason);}
  return choice;
 }
 async validateDecision(selection:DecisionAgent|undefined,projectPath:string):Promise<DecisionAgent>{
  const decisionAgent=validate<DecisionAgent>(configSchema.properties.decisionAgent,selection??{backend:'claude-code'});
  if(decisionAgent.backend==='opencode'){
   const discovery=await this.decisionModels(projectPath,decisionAgent.opencode.executable);
   const model=discovery.providers.find(p=>p.id===decisionAgent.opencode.providerID)?.models.find(m=>m.id===decisionAgent.opencode.modelID);
   if(!discovery.available)throw Error('OpenCode 不可用：'+discovery.reason);
   if(!model||model.capabilities.tools!==true||model.capabilities.structuredOutput!==true)throw Error('OpenCode Provider/Model 已失效或能力不足，请重新选择');
  }
  return decisionAgent;
 }
 registry():Registry{return JSON.parse(fs.readFileSync(this.registryFile,'utf8'));}
 private assertRuntimeOwnership(config:Config,readOnly=false){
  if(readOnly)return;
  // Existing external MAIN profiles remain valid, but another claimed instance is never writable.
  let runtime=path.resolve(config.runtimeDir),parent=runtime;
  while(!fs.existsSync(parent))parent=path.dirname(parent);
  runtime=path.resolve(fs.realpathSync(parent),path.relative(parent,runtime));
  let ownerPath=runtime;
  while(true){const marker=path.join(ownerPath,'instance.json');if(fs.existsSync(marker)){const owner=JSON.parse(fs.readFileSync(marker,'utf8'));if(owner.version!==1||owner.instanceId!==instanceId())throw Error('Controller runtime belongs to another instance; import history as read-only');break;}const parent=path.dirname(ownerPath);if(parent===ownerPath)break;ownerPath=parent;}
  if(instanceId()==='main')return;
  const data=fs.realpathSync(this.data).toLowerCase();
  if(!runtime.toLowerCase().startsWith(data+path.sep))throw Error('DEV writable Controller runtime must stay inside DEV data directory; import history as read-only');
 }
 inspectProject(input:string):Project {
  if(!path.isAbsolute(input))throw Error('请选择绝对项目目录');const projectPath=fs.realpathSync(input);if(!fs.statSync(projectPath).isDirectory())throw Error('项目必须是文件夹');
  this.previewRoots.add(projectPath.toLowerCase());if(this.previewRoots.size>20)this.previewRoots.delete(this.previewRoots.values().next().value!);
  const files=fs.readdirSync(projectPath).slice(0,100),previous=this.registry().recentProjects?.find(p=>p.path.toLowerCase()===projectPath.toLowerCase());
  let scripts:Record<string,string>={};try{scripts=JSON.parse(fs.readFileSync(path.join(projectPath,'package.json'),'utf8')).scripts??{};}catch{}
  const commands=(name:string)=>Object.keys(scripts).filter(s=>s===name||s.startsWith(name+':')).map(s=>'npm run '+s);
  return {path:projectPath,name:path.basename(projectPath),kind:files.includes('package.json')?'Node.js':files.includes('pyproject.toml')?'Python':files.includes('Cargo.toml')?'Rust':files.includes('CMakeLists.txt')?'C++':files.length?'普通项目':'空项目',files,git:fs.existsSync(path.join(projectPath,'.git')),testCommands:files.includes('Cargo.toml')?['cargo test']:files.includes('pyproject.toml')?['python -m pytest']:commands('test'),buildCommands:files.includes('Cargo.toml')?['cargo build']:commands('build'),directAuthorized:previous?.directAuthorized??false,settings:previous?{decisionAgent:previous.settings.decisionAgent??{backend:'claude-code'},mode:'real',projectMode:validate<Config>(configSchema,{...previous.settings,allowedRepositories:[projectPath],runtimeDir:this.data,claudeExecutable:'unused',timeoutMs:30000,tests:[],mockScenario:'pass'}).projectMode??'direct',maxClaudeCalls:previous.settings.maxClaudeCalls,maxLoops:previous.settings.maxLoops,maxReworks:previous.settings.maxReworks}:{decisionAgent:{backend:'claude-code'},mode:'real',projectMode:'direct',maxClaudeCalls:5,maxLoops:4,maxReworks:1},lastOpened:previous?.lastOpened??''};

 }
 validateProjectStart(r:Request){const project=this.inspectProject(r.projectPath!);if(!r.goal?.trim())throw Error('请输入开发目标');if(r.projectMode==='direct'&&!project.directAuthorized&&!r.directAcknowledged)throw Error('首次直接开发需明确授权修改所选目录');return project;}
 async validateDiscussion(selection:Config['decisionDiscussion'],projectPath:string){
  if(!selection)return undefined;
  const discussion=validate<NonNullable<Config['decisionDiscussion']>>(desktopDiscussionSchema,selection);
  if(new Set(discussion.participants.map(p=>p.id)).size!==2)throw Error('两个决策者必须拥有独立身份');
  for(const participant of discussion.participants)await this.validateDecision(participant.agent,projectPath);
  return discussion;
 }
 async startProject(r:Request,onCreated?:(run:Run)=>void){const project=this.validateProjectStart(r),decisionAgent=await this.validateDecision(r.decisionAgent??r.decisionDiscussion?.participants.find(p=>p.id===r.decisionDiscussion?.primary)?.agent,project.path),key=sha(project.path.toLowerCase()).slice(0,32),folder=path.join(this.data,'projects',key);fs.mkdirSync(folder,{recursive:true});
  const decisionDiscussion=await this.validateDiscussion(r.decisionDiscussion,project.path);
  if(decisionDiscussion&&JSON.stringify(decisionAgent)!==JSON.stringify(decisionDiscussion.participants.find(p=>p.id===decisionDiscussion.primary)!.agent))throw Error('主决策者配置不匹配');
  const executionAgent=await this.validateExecution(r.executionAgent,project.path);
  const settings={executionAgent,decisionAgent,...(decisionDiscussion?{decisionDiscussion}:{}),mode:r.mode!,projectMode:r.projectMode!,maxClaudeCalls:r.maxClaudeCalls??5,maxLoops:r.maxLoops??4,maxReworks:r.maxReworks??1};
  const tests:Config['tests']=[];
  if(r.mode==='mock')for(const marker of ['hello','done']){const file=path.join(project.path,marker+'.txt');if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')!==marker+'\n')throw Error('Mock 标记文件已存在且内容不同，拒绝覆盖：'+file);}
  if(r.mode==='real')for(const command of r.selectedTests??[]){if(!project.testCommands.includes(command))throw Error('测试命令与项目检测不匹配');if(command.startsWith('npm run ')){const cli=path.join(path.dirname(this.node),'node_modules/npm/bin/npm-cli.js');if(!fs.existsSync(cli))throw Error('未找到本机 npm CLI');tests.push({executable:this.node,args:[cli,'run',command.slice(8)]});}else{const tool=command.startsWith('cargo ')?'cargo.exe':'python.exe',executable=(process.env.PATH??'').split(path.delimiter).map(p=>path.join(p,tool)).find(p=>fs.existsSync(p));if(!executable)throw Error('本机未安装所选测试工具：'+tool);tests.push({executable,args:command.startsWith('cargo ')?['test']:['-m','pytest']});}}
  if(r.mode==='mock'){const test=path.join(folder,'mock-marker-acceptance.cjs');fs.writeFileSync(test,"const fs=require('fs');const id=process.env.PERSONAL_AGENT_TASK_ID;if(!['hello','done'].includes(id))process.exit(1);for(const task of id==='hello'?['hello']:['hello','done'])if(fs.readFileSync(task+'.txt','utf8')!==task+'\\n')process.exit(1);console.log('Mock marker checks passed; not project tests');\n");tests.push({executable:this.node,args:[test]});}
  // Only explicitly selected, freshly detected commands enter independent acceptance.
  const config:ProjectConfig={executionAgent,decisionAgent,...(decisionDiscussion?{decisionDiscussion}:{}),allowedRepositories:[project.path],runtimeDir:path.join(folder,'runtimes',randomUUID().replaceAll('-','').slice(0,16)),executionMode:'native',claudeExecutable:'C:/Users/WYL20/.local/bin/claude.exe',timeoutMs:r.mode==='mock'?30000:0,mode:settings.mode,projectMode:settings.projectMode,claudeStreaming:true,tests,mockScenario:(r.scenario??'pass') as Config['mockScenario'],...(r.projectMode==='direct'?{directAuthorization:{projectPath:project.path,acknowledgedAt:new Date().toISOString()}}:{})};
  validate(configSchema,config);const file=path.join(folder,`config-${randomUUID()}.json`);atomicJson(file,config);this.register(file);const entry=this.registry().profiles.find(p=>p.file===path.resolve(file))!;
  const result=await this.start({...r,operation:'start',profileId:entry.id,repository:project.path,...(r.mode==='real'?{scenario:undefined}:{})},onCreated);
  const registry=this.registry();registry.recentProjects=[{...project,directAuthorized:project.directAuthorized||(r.projectMode==='direct'&&r.directAcknowledged===true),settings,lastOpened:new Date().toISOString()},...(registry.recentProjects??[]).filter(p=>p.path.toLowerCase()!==project.path.toLowerCase())].slice(0,20);atomicJson(this.registryFile,registry);return result;
 }
 config(id:string){const entry=this.registry().profiles.find(p=>p.id===id);if(!entry)throw Error('Profile is not registered');const bytes=fs.readFileSync(entry.file);if(sha(bytes)!==entry.hash)throw Error('配置已改变，请通过设置重新导入，旧授权配置不再可用');const config=validate<Config>(configSchema,JSON.parse(bytes.toString()));assertD(config.runtimeDir);this.assertRuntimeOwnership(config,entry.readOnly);return {entry,config};}
 register(file:string,readOnly=false){assertD(file);const bytes=fs.readFileSync(file);const config=validate<Config>(configSchema,JSON.parse(bytes.toString()));assertD(config.runtimeDir);this.assertRuntimeOwnership(config,readOnly);const registry=this.registry();const previous=registry.profiles.find(p=>p.file===path.resolve(file));if(previous){previous.hash=sha(bytes);previous.readOnly=readOnly;}else registry.profiles.push({id:randomUUID(),file:path.resolve(file),hash:sha(bytes),readOnly});atomicJson(this.registryFile,registry);return this.overview();}
 profile(id:string):Profile {const {entry,config:c}=this.config(id);let budget:Profile['globalBudget']=null;if(c.globalBudget)try{const ledger=JSON.parse(fs.readFileSync(c.globalBudget.file,'utf8'));budget={limit:ledger.limit,used:ledger.used,remaining:Math.max(0,ledger.limit-ledger.used),reservations:ledger.reservations};}catch{/* Missing legacy ledgers never block runs or history. */}
 return {id,name:c.mode==='mock'?'Mock 工作区 · '+id.slice(0,8):path.basename(path.dirname(entry.file)),hash:entry.hash,mode:c.mode,runtimeDir:c.runtimeDir,repositories:c.allowedRepositories,maxClaudeCalls:c.maxClaudeCalls??100,maxLoops:c.maxLoops,maxReworks:c.maxReworks,timeoutMs:c.timeoutMs,readOnly:entry.readOnly,globalBudget:budget,tests:c.tests.map(t=>redact(`${path.basename(t.executable)} ${t.args.map(a=>path.basename(a)).join(' ')}`)),availability:{claude:fs.existsSync(c.claudeExecutable),codex:fs.existsSync(path.join(this.root,'node_modules/@openai/codex-sdk')),note:c.mode==='mock'?'Mock 不需要服务认证':'仅检查本地安装；认证与服务额度需真实调用时验证'}};}
 store(profileId:string,id:string){const {config}=this.config(profileId);const file=path.join(config.runtimeDir,'runs',id,'state.json');if(!fs.existsSync(file))throw Error(fs.existsSync(path.dirname(file))?'历史记录不可用：该 runtime 的 Run 目录存在，但未保存 state.json（启动准备中断或失败）；未读取其他实例数据':'历史记录不可用：所属 runtime 中不存在此 Run；未读取其他实例数据');const store=new Store(config.runtimeDir,id);const state=store.load();if(state.id!==id)throw Error('Run identity mismatch');if(path.resolve(state.workspace).toLowerCase()!==path.resolve((state.config as ProjectConfig).projectMode==='direct'?state.source:store.file('workspace')).toLowerCase())throw Error('Run workspace mismatch');assertD(state.config.runtimeDir);if(path.resolve(state.config.runtimeDir).toLowerCase()!==path.resolve(config.runtimeDir).toLowerCase())throw Error('Run runtime mismatch');return store;}
 publicRun(s:State,profileId:string):Run{return {decisionSession:s.decisionSession,executionAgent:s.config.executionAgent??{backend:"codex"},executionSession:s.executionSession,...(s.discussion?{discussion:JSON.parse(redact(JSON.stringify(s.discussion)))}:{}),decisionAgent:s.decisionAgent??{backend:'claude-code'},contextConfirmations:pendingContextConfirmations(new Store(s.config.runtimeDir,s.id)),manualAcceptanceDigest:manualAcceptanceDigest(s),manualAccepted:s.phase==='completed'&&!s.config.tests.length&&s.reason.startsWith('人工验收'),deliveryRequiresBranch:s.config.projectMode===undefined,projectMode:(s.config as ProjectConfig).projectMode??'isolated',id:s.id,profileId,goal:redact(s.goal),source:s.source,workspace:s.workspace,phase:s.phase,reason:redact(s.reason),updatedAt:s.updatedAt,mode:s.config.mode,tasks:s.tasks.map(t=>({...t,instruction:redact(t.instruction),acceptance:t.acceptance.map(redact)})),executorExitCode:s.executorExitCode,taskIndex:s.taskIndex,completedTaskIds:s.completedTaskIds??[],loops:s.loops,claudeCalls:s.claudeCalls??0,totalReworks:s.totalReworks??0,reworks:s.reworks,reworkPending:s.reworkPending??false,claudeSessionId:s.claudeSessionId,codexThreadId:s.codexThreadId,config:{maxClaudeCalls:s.config.maxClaudeCalls??100,maxLoops:s.config.maxLoops,maxReworks:s.config.maxReworks},evidence:s.evidence?{verificationScope:s.evidence.verificationScope,contextReport:s.evidence.contextReport,passed:s.evidence.passed,issues:s.evidence.issues.map(redact),tests:s.evidence.tests.map(t=>({...t,stdout:redact(t.stdout).slice(0,80000),stderr:redact(t.stderr).slice(0,10000)})),diff:redact(s.evidence.diff),acceptanceRulesHash:s.evidence.acceptanceRulesHash}:null,failure:s.failure?{kind:s.failure.kind,message:redact(s.failure.message),recoverable:s.failure.recoverable}:null,active:this.children.has(s.id)};}
 overview():Overview {const profiles:Profile[]=[],runs:Run[]=[],warnings:string[]=[],unavailableRuns:NonNullable<Overview['unavailableRuns']>=[];const registry=this.registry();for(const p of registry.profiles)try{profiles.push(this.profile(p.id));const {config}=this.config(p.id);const folder=path.join(config.runtimeDir,'runs');if(fs.existsSync(folder))for(const id of fs.readdirSync(folder).filter(x=>/^[0-9a-f-]{36}$/.test(x)))try{runs.push(this.publicRun(this.store(p.id,id).load(),p.id));}catch(e){unavailableRuns.push({id,profileId:p.id,runtimeDir:config.runtimeDir,reason:redact((e as Error).message)});}}catch(e){warnings.push(`${p.file}: ${(e as Error).message}`);}runs.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));return {unavailableRuns,recentProjects:registry.recentProjects??[],profiles,runs,warnings:warnings.map(redact),paths:{controller:this.root,data:this.data,node:this.node,instanceId:instanceId(),sharedRuntime},reducedMotion:registry.reducedMotion};}

 detail(profileId:string,id:string){const store=this.store(profileId,id);const events=this.audit(store);const activity:Activity[]=events.slice(-100).map(e=>({time:e.time,event:e.event,phase:e.data?.phase,verdict:e.data?.verdict,passed:e.data?.passed,message:redact(e.data?.reason??e.data?.summary??e.data?.message??(e.event==='claude-call-start'?`${e.data.role} · 预约 ${e.data.call}`:e.event==='codex-thread'?e.data.id:''))}));return {run:{...this.publicRun(store.load(),profileId),usage:runUsage(store)},activity,auditCount:events.length,auditVerified:true};}
 audit(store:Store):any[]{const file=store.file('audit.jsonl');if(!fs.existsSync(file))return [];let previous='';const events=fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));for(const {hash,...e} of events){if(e.previousHash!==previous||sha(JSON.stringify(e))!==hash)throw Error('Audit integrity failure');previous=hash;}return events;}
 async prepareMock(){const folder=path.join(this.data,'mock',randomUUID()),repo=path.join(folder,'repository');fs.mkdirSync(repo,{recursive:true});fs.writeFileSync(path.join(repo,'README.md'),'# PersonalAgent desktop Mock sandbox\nOnly hello/done markers are generated. No real Agent calls.\n');fs.writeFileSync(path.join(repo,'.gitattributes'),'* text=auto eol=lf\n');await git(repo,['init','-b','desktop-delivery']);await git(repo,['add','.']);await git(repo,['-c','user.name=PersonalAgent Mock','-c','user.email=mock@example.invalid','commit','-m','Initialize isolated desktop Mock requirements']);const test=path.join(folder,'acceptance.cjs');fs.writeFileSync(test,"const fs=require('fs');const id=process.env.PERSONAL_AGENT_TASK_ID;if(!['hello','done'].includes(id))process.exit(1);for(const task of id==='hello'?['hello']:['hello','done'])if(fs.readFileSync(task+'.txt','utf8')!==task+'\\n')process.exit(1);console.log(JSON.stringify({passed:true,task:id}));\n");const config:Config={allowedRepositories:[repo],runtimeDir:path.join(folder,'runtime'),mode:'mock',claudeExecutable:'C:/Users/WYL20/.local/bin/claude.exe',timeoutMs:30000,maxLoops:4,maxReworks:1,claudeStreaming:true,tests:[{executable:this.node,args:[test]}],mockScenario:'pass'};const file=path.join(folder,'config.json');atomicJson(file,config);return this.register(file);}
 launch(store:Store,configFile:string,decision?:string,maxReworks?:number,intent:Request['intent']='resume'){if(this.children.has(store.id))throw Error('Run already active');const args=[path.join(this.root,'dist/src/cli.js'),'resume','--config',configFile,'--id',store.id];if(decision)args.push('--decision',decision);if(decision)args.push('--intent',intent);if(decision&&store.load().config.mode==='real'&&store.load().config.timeoutMs!==0)args.push('--timeout-ms','0');if(maxReworks!==undefined)args.push('--max-reworks',String(maxReworks));const env:NodeJS.ProcessEnv=store.load().config.mode==='real'?nativeAgentEnv():controlledEnv(store.load().config.runtimeDir);delete env.NODE_OPTIONS;delete env.ELECTRON_RUN_AS_NODE;const child=spawn(this.node,args,{cwd:this.root,env,windowsHide:true,stdio:['ignore','pipe','pipe'],shell:false});this.children.set(store.id,child);const log=fs.createWriteStream(store.file(`desktop-process-${Date.now()}.log`),{flags:'wx'});child.stdout?.pipe(log,{end:false});child.stderr?.pipe(log,{end:false});let finished=false;const finish=(error?:Error)=>{if(finished)return;finished=true;this.children.delete(store.id);if(error)log.write(redact(error.message));log.end();};child.once('error',finish);child.once('close',(code)=>{finish();if(code===0&&!this.closing&&!fs.existsSync(store.file('stop.request')))void this.sessions.drainCompleted(store.id).catch(error=>{try{store.audit('desktop-chat-queue-error',{message:redact(String(error))});}catch{/* Preserve the original Run if audit storage itself is unavailable. */}});});}
 validateStart(request:Request){const {entry,config:original}=this.config(request.profileId!);if(entry.readOnly)throw Error('历史配置只读，不能创建或恢复任务');if(request.mode&&request.mode!==original.mode)throw Error('正式任务模式与 Profile 不一致，拒绝派发');if(!original.allowedRepositories.includes(request.repository!))throw Error('Repository not authorized');if(!request.goal?.trim())throw Error('Goal required');if(original.mode==='real'&&request.scenario)throw Error('Mock scenario forbidden in real mode');return {entry,original};}
 async start(request:Request,onCreated?:(run:Run)=>void){const {entry,original}=this.validateStart(request);await this.validateDecision(original.decisionAgent,request.repository!);await this.validateDiscussion(original.decisionDiscussion,request.repository!);// Desktop Runs carry no loop or rework limit; the user steers and stops them from chat.
  const {maxLoops:_maxLoops,maxReworks:_maxReworks,...unlimited}=original;const config={...unlimited,...(original.mode==='real'?{timeoutMs:0}:{}),maxClaudeCalls:request.maxClaudeCalls??original.maxClaudeCalls,...(original.mode==='mock'?{mockScenario:(request.scenario??'pass') as Config['mockScenario']}: {})};validate(configSchema,config);

  let store:Store;
  try{store=await createRun(config,request.repository!,request.goal!);}catch(error){
   if(error instanceof FlowError && error.runId){const failed=this.publicRun(new Store(config.runtimeDir,error.runId).load(),entry.id);onCreated?.(failed);return failed;}
   throw error;
  }
  const file=store.file('desktop.config.json');atomicJson(file,config);store.audit('desktop-user-start',{mode:config.mode});onCreated?.(this.publicRun(store.load(),entry.id));this.launch(store,file);return this.publicRun(store.load(),entry.id);}
 writable(profileId:string){if(this.config(profileId).entry.readOnly)throw Error('历史配置只读');}
 async deliveries(profileId:string,id:string):Promise<Delivery[]>{return this.serializeDelivery(id,()=>this.readDeliveries(profileId,id));}
 private async readDeliveries(profileId:string,id:string):Promise<Delivery[]>{const store=this.store(profileId,id);const folder=store.file('deliveries');if(!fs.existsSync(folder))return [];const items:Delivery[]=[];for(const deliveryId of fs.readdirSync(folder).filter(x=>/^[0-9a-f-]{36}$/.test(x))){const state=await deliveryStatus(store,deliveryId);const manifest=JSON.parse(fs.readFileSync(path.join(folder,deliveryId,'manifest.json'),'utf8'));items.push({...state,kind:manifest.kind,runId:id,target:manifest.target,branch:manifest.branch,head:manifest.head,rulesHash:manifest.rulesHash,workspaceSnapshot:manifest.workspaceSnapshot,changes:manifest.changes.map(({path,before,after}:any)=>({path,before,after})),diff:redact(manifest.diff),tests:store.load().evidence?.tests.map(t=>({...t,stdout:redact(t.stdout),stderr:redact(t.stderr)}))??[],issues:store.load().evidence?.issues.map(redact)??[],preview:fs.readFileSync(path.join(folder,deliveryId,'preview.md'),'utf8')});}return items.sort((a,b)=>fs.statSync(path.join(folder,a.id,'manifest.json')).mtimeMs-fs.statSync(path.join(folder,b.id,'manifest.json')).mtimeMs);}

 notes(id:string):Note[]{const file=path.join(this.data,'notes',id+'.json');return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];}
 messageEvidence(profileId:string,id:string,messageId:string){
  const store=this.store(profileId,id),event=this.audit(store).find(e=>'audit:'+e.hash===messageId);if(!event)throw Error('原始事件不存在');
  const data=event.data??{};let text=data.text??'';
  if(data.fullTextFile){if(!/^activity-[a-f0-9]{64}\.txt$/.test(data.fullTextFile))throw Error('Invalid activity evidence path');const bytes=fs.readFileSync(store.file(data.fullTextFile));if(sha(bytes)!==data.fullTextHash)throw Error('Activity evidence hash mismatch');text=bytes.toString('utf8');}
  return {event:JSON.parse(redact(JSON.stringify(event))),text:redact(text)};
 }
 readProjectFile(projectPath:string,fileName:string){
  const root=this.previewRoot(projectPath),target=projectTarget(root,fileName),stat=fs.statSync(target);
  if(!stat.isFile()||stat.size>2*1024*1024)throw Error('只能预览存在的普通文件，大小上限为 2 MiB');
  const ext=path.extname(fileName).toLowerCase(),mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'};
  const type=mime[ext]??'text/plain',fd=fs.openSync(target,'r');let bytes:Buffer;
  try{const before=fs.fstatSync(fd);if(!before.isFile()||before.nlink>1||before.size>2*1024*1024||before.ino!==stat.ino)throw Error('文件已改变，请重试');bytes=Buffer.alloc(before.size);let offset=0;while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(!n)throw Error('文件已改变，请重试');offset+=n;}const after=fs.fstatSync(fd),live=fs.lstatSync(projectTarget(root,fileName));if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||live.ino!==before.ino)throw Error('文件已改变，请重试');}finally{fs.closeSync(fd);}
  if(type.startsWith('image/'))return {path:fileName,size:bytes.length,mimeType:type,dataUrl:`data:${type};base64,${bytes.toString('base64')}`,truncated:false};
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.includes('\0'))throw Error();}catch{throw Error('此二进制或非 UTF-8 文件不支持文本预览');}
  text=redact(text);const truncated=text.length>200000;
  return {path:fileName,size:bytes.length,mimeType:type,text:text.slice(0,200000),truncated};
 }
 private previewRoot(projectPath:string){
  const root=fs.realpathSync(projectPath),known=new Set([...this.previewRoots,...(this.registry().recentProjects??[]).map(p=>p.path.toLowerCase()),...this.sessions.read().map(s=>s.projectPath.toLowerCase())]);
  for(const profile of this.registry().profiles)try{for(const repo of this.config(profile.id).config.allowedRepositories)known.add(fs.realpathSync(repo).toLowerCase());}catch{}
  if(!known.has(root.toLowerCase()))throw Error('只读预览仅允许已选择或登记的项目目录');return root;
 }
 listProjectFiles(projectPath:string,directory:string){
  const root=this.previewRoot(projectPath),target=directory?projectTarget(root,directory):root;
  const entries=[];let truncated=false;
  for(const entry of fs.readdirSync(target,{withFileTypes:true}).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name))){
   if(entry.isSymbolicLink()||['.git','node_modules'].includes(entry.name)||!entry.isFile()&&!entry.isDirectory())continue;
   if(entries.length===1000){truncated=true;break;}entries.push({name:entry.name,directory:entry.isDirectory()});
  }
  return {entries,truncated};
 }
 thread(profileId:string,id:string,after?:string){
  const store=this.store(profileId,id),state=store.load(),key=profileId+':'+id;
  const stamp=(file:string)=>{if(!fs.existsSync(file))return 'missing';const stat=fs.statSync(file,{bigint:true});return `${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;};
  const fingerprint=state.updatedAt+':'+stamp(store.file('state.json'))+':'+stamp(store.file('audit.jsonl'))+':'+stamp(path.join(this.data,'notes',id+'.json'));
  let cached=this.threadCache.get(key);
  if(!cached||cached.fingerprint!==fingerprint){const events=this.audit(store);cached={fingerprint,messages:projectMessages(state,events,this.notes(id)),capabilities:{claudeStreaming:state.config.claudeStreaming!==false,codexPublicEvents:events.some(e=>e.event==='agent-activity'&&e.data.agent==='codex'),imagesToClaude:false}};this.threadCache.set(key,cached);if(this.threadCache.size>20)this.threadCache.delete(this.threadCache.keys().next().value!);}
  return {...messagePage(cached.messages,after),lastActivity:cached.messages.at(-1)?.time??null,capabilities:cached.capabilities};
 }
 note(profileId:string,id:string,messageId:string,text:string){const state=this.store(profileId,id).load();const notes=this.notes(id),clean=redact(text.trim());if(!clean)throw Error('Message required');const previous=notes.find(n=>n.id===messageId);if(previous){if(previous.text!==clean)throw Error('Message ID reused with different content');return previous;}if(notes.length>=1000)throw Error('Message limit reached');const note:Note={id:messageId,time:new Date().toISOString(),text:clean,taskId:state.tasks[state.taskIndex]?.id??null,loop:state.loops};notes.push(note);fs.mkdirSync(path.join(this.data,'notes'),{recursive:true});atomicJson(path.join(this.data,'notes',id+'.json'),notes);return note;}
 imageManifest(profileId:string,id:string):Screenshot[]{const store=this.store(profileId,id),state=store.load(),events=this.audit(store),images:Screenshot[]=[];let taskIndex=0,loop=0;
    const cacheFile=path.join(this.data,'evidence',id+'.json');
    const cache:Record<string,Screenshot[]>=fs.existsSync(cacheFile)?JSON.parse(fs.readFileSync(cacheFile,'utf8')):{};let changed=false;
    for(const e of events){if(Number.isInteger(e.data?.taskIndex))taskIndex=e.data.taskIndex;if(Number.isInteger(e.data?.loops))loop=e.data.loops;
     if(e.event==='independent-check'){
      if(Array.isArray(e.data.screenshots))images.push(...e.data.screenshots);
      else{if(!cache[e.hash]){cache[e.hash]=collectScreenshots({...state,taskIndex,loops:loop},e.data.tests??[],e.time).map(i=>({...i,source:'historical-import:'+i.source}));changed=true;}images.push(...cache[e.hash]!);}
     }}
    if(changed){fs.mkdirSync(path.dirname(cacheFile),{recursive:true});atomicJson(cacheFile,cache);}
    const manifest=[...new Map(images.map(i=>[i.id,i])).values()].slice(-120);return manifest;}
 pictures(profileId:string,id:string){return this.imageManifest(profileId,id).map(({path:_path,runId:_runId,testIndex:_testIndex,...i})=>({...i,url:'personalagent://app/evidence/'+profileId+'/'+id+'/'+i.id+'.png'}));}
 image(profileId:string,id:string,imageId:string){const store=this.store(profileId,id),image=this.imageManifest(profileId,id).find(i=>i.id===imageId);if(!image)throw Error('Untrusted screenshot');return screenshotBytes(store.load(),image);}
 validateResume(request:Request){this.writable(request.profileId!);const state=this.store(request.profileId!,request.runId!).load();if(!['paused','failed','stopped'].includes(state.phase))throw Error('仅暂停、失败、停止的 Run 可以恢复');if(state.failure&&!state.failure.recoverable)throw Error('该失败不可自动恢复');if(!request.decision?.trim())throw Error('User decision required');
  if(request.intent==='rework'&&(!state.tasks[state.taskIndex]||!['execute','verify','review'].includes(state.nextPhase)))throw Error('当前节点不能直接返工；规划或提案应用中断请先恢复原流程');
  if(request.intent==='visual'){if(!request.pictureIds?.length)throw Error('视觉确认必须绑定已查看的可信截图');const images=this.imageManifest(request.profileId!,state.id);for(const id of request.pictureIds){const image=images.find(i=>i.id===id);if(!image||image.taskId!==state.tasks[state.taskIndex]?.id)throw Error('Screenshot evidence changed or belongs to another task');screenshotBytes(state,image);}}
  return state;}
 async dispatch(raw:unknown){const r=validateRequest(raw);if(r.operation==='executionModels')return this.decisionModels(r.projectPath,undefined,true);if(r.operation==='decisionModels')return this.decisionModels(r.projectPath);if(r.operation==='overview')return this.overview();if(r.operation==='sessions')return this.sessions.list();if(r.operation==='createSession'){await this.validateExecution(r.executionAgent,r.projectPath!);await this.validateDecision(r.decisionAgent,r.projectPath!);await this.validateDiscussion(r.decisionDiscussion,r.projectPath!);return this.sessions.create(r);}if(r.operation==='sessionDetail')return this.sessions.detail(r.sessionId!);if(r.operation==='renameSession')return this.sessions.rename(r.sessionId!,r.title!);if(r.operation==='sendSession')return this.sessions.send(r);if(r.operation==='processSessionMessage')return this.sessions.send(r,true);if(r.operation==='editSessionMessage')return this.sessions.edit(r);if(r.operation==='cancelSessionMessage')return this.sessions.edit(r,true);if(r.operation==='messageEvidence')return this.messageEvidence(r.profileId!,r.runId!,r.messageId!);if(r.operation==='inspectProject')return this.inspectProject(r.projectPath!);if(r.operation==='listProjectFiles')return this.listProjectFiles(r.projectPath!,r.file!);if(r.operation==='readProjectFile')return this.readProjectFile(r.projectPath!,r.file!);if(r.operation==='chooseProject')throw Error('Native folder dialog required');if(r.operation==='startProject')return this.startProject(r);if(r.operation==='prepareMock')return this.prepareMock();if(r.operation==='preferences'){const registry=this.registry();registry.reducedMotion=r.reducedMotion!;atomicJson(this.registryFile,registry);return this.overview();}if(r.operation==='importProfile')throw Error('Native file dialog required');if(r.operation==='start')return this.start(r);const store=this.store(r.profileId!,r.runId!);if(r.operation==='thread')return this.thread(r.profileId!,r.runId!,r.after);if(r.operation==='note')return this.note(r.profileId!,r.runId!,r.messageId!,r.text!);if(r.operation==='pictures')return this.pictures(r.profileId!,r.runId!);if(r.operation==='detail')return this.detail(r.profileId!,r.runId!);if(r.operation==='deliveries')return this.deliveries(r.profileId!,r.runId!);this.writable(r.profileId!);if(r.operation==='contextDecide'){if(this.children.has(store.id))throw Error('Run still active');decideContextConfirmation(store,r.requestId!,r.digest!,r.decision!,r.cancel,r.contextAction);return this.publicRun(store.load(),r.profileId!);}if(r.operation==='manualAccept'){if(this.children.has(store.id))throw Error('Run still active');await acceptManual(store,r.digest!,r.decision!);return this.publicRun(store.load(),r.profileId!);}if(r.operation==='stop'){fs.writeFileSync(store.file('stop.request'),'stop');fs.appendFileSync(path.join(this.data,'user-actions.jsonl'),JSON.stringify({time:new Date().toISOString(),operation:'stop',runId:store.id})+'\n',{flush:true});return {requested:true};}if(r.operation==='resume'){this.validateResume(r);const state=store.load();if(!['paused','failed','stopped'].includes(state.phase))throw Error('仅暂停、失败、停止的 Run 可以恢复');if(state.failure&&!state.failure.recoverable)throw Error('该失败不可自动恢复');if(!r.decision?.trim())throw Error('User decision required');const configFile=store.file('desktop.config.json');if(state.config.maxLoops!==undefined||state.config.maxReworks!==undefined){if(this.children.has(store.id))throw Error('Run already active');const unlock=store.lock();try{const current=store.load(),limits={maxLoops:current.config.maxLoops,maxReworks:current.config.maxReworks};delete current.config.maxLoops;delete current.config.maxReworks;store.save(current);store.audit('limits-removed',limits);}finally{unlock();}}if(!fs.existsSync(configFile))atomicJson(configFile,state.config);if(r.executionAgent){if(this.children.has(store.id))throw Error('Run already active');const choice=await this.validateExecution(r.executionAgent,state.source);atomicJson(configFile,switchExecutionAgent(store,choice).config);this.sessions.switchExecution(store.id,choice);}fs.appendFileSync(path.join(this.data,'user-actions.jsonl'),JSON.stringify({time:new Date().toISOString(),operation:'resume',runId:store.id,intent:r.intent??'resume',...(r.executionAgent?{executionAgent:r.executionAgent}:{}),pictureIds:r.pictureIds??[],decision:redact(r.decision!)})+'\n',{flush:true});this.launch(store,configFile,r.decision,undefined,r.intent);return {requested:true};}if(r.operation==='preview')return this.serializeDelivery(store.id,()=>previewDelivery(store,r.target!,r.branch!));if(r.operation==='approve'){if(!r.decision?.trim())throw Error('Explicit approval required');return this.serializeDelivery(store.id,()=>approveDelivery(store,r.deliveryId!,r.digest!,r.decision!));}if(r.operation==='apply')return this.serializeDelivery(store.id,()=>applyDelivery(store,r.deliveryId!,{resume:r.resume===true}));throw Error('Operation unavailable');}
 closing=false;
 async stopOwned(){this.closing=true;for(const id of this.children.keys()){for(const p of this.registry().profiles){try{const store=this.store(p.id,id);fs.writeFileSync(store.file('stop.request'),'stop');break;}catch{}}}await Promise.race([new Promise<void>(resolve=>{const timer=setInterval(()=>{if(!this.children.size){clearInterval(timer);resolve();}},100);timer.unref();}),new Promise<void>(resolve=>setTimeout(resolve,5000))]);}
}
