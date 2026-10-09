import {app,BrowserWindow,ipcMain,dialog,protocol,session} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DesktopService,validateRequest,redact} from './service.js';
import {assertD} from '../../dist/src/store.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const data=process.env.PERSONAL_AGENT_DESKTOP_DATA??path.join(root,'.desktop-data');
if(!/^D:[\\/]/i.test(data))throw Error('Desktop data must be on D drive');
assertD(data);assertD(root);
fs.mkdirSync(path.join(data,'tmp'),{recursive:true});process.env.TEMP=path.join(data,'tmp');process.env.TMP=process.env.TEMP;process.env.XDG_CACHE_HOME=path.join(data,'cache');process.env.npm_config_cache=path.join(root,'.cache/npm');
app.setPath('userData',path.join(data,'electron'));app.setPath('sessionData',path.join(data,'electron/session'));app.setPath('crashDumps',path.join(data,'crash-dumps'));app.setAppLogsPath(path.join(data,'logs'));app.setName('PersonalAgent');app.enableSandbox();
protocol.registerSchemesAsPrivileged([{scheme:'personalagent',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const locked=app.requestSingleInstanceLock();if(!locked)app.quit();
let window:BrowserWindow;let service:DesktopService;let quitting=false;
if(locked)app.whenReady().then(async()=>{
 service=new DesktopService(root,data,'C:/Program Files/nodejs/node.exe');
 {for(const file of ['cafe-validation/real.config.json','fish-validation/real.config.json']){const full=path.join(root,file);if(fs.existsSync(full)&&!service.registry().profiles.some(p=>p.file===full))try{service.register(full,true);}catch{}}}
 const renderer=path.join(root,'desktop/out/renderer');
 protocol.handle('personalagent',request=>{try{const url=new URL(request.url);if(url.host!=='app'||request.method!=='GET')return new Response('Forbidden',{status:403});const evidence=url.pathname.match(/^\/evidence\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9]{64})\.png$/);if(evidence)return new Response(new Uint8Array(service.image(evidence[1]!,evidence[2]!,evidence[3]!)),{headers:{'content-type':'image/png','x-content-type-options':'nosniff','cache-control':'no-store'}});const relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname).slice(1),file=path.resolve(renderer,relative);if(file!==renderer&&!file.startsWith(renderer+path.sep))return new Response('Forbidden',{status:403});const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};return new Response(new Uint8Array(fs.readFileSync(file)),{headers:{'content-type':mime[path.extname(file)]??'application/octet-stream','x-content-type-options':'nosniff'}});}catch{return new Response('Not found',{status:404});}});
 session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));session.defaultSession.setPermissionCheckHandler(()=>false);
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('personalagent://app/')&&!details.url.startsWith('devtools://')}));
 window=new BrowserWindow({width:1440,height:900,minWidth:1024,minHeight:680,title:'PersonalAgent',backgroundColor:'#f6f8fb',autoHideMenuBar:true,webPreferences:{preload:path.join(root,'desktop/out/preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());window.webContents.on('will-attach-webview',e=>e.preventDefault());
 ipcMain.handle('personalagent:request',async(event,raw)=>{
  if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!=='personalagent://app/index.html')throw Error('Untrusted IPC sender');
  const r=validateRequest(raw);
  try{
   if(r.operation==='authorizeSessionBudget'){
    const {session}=service.sessions.detail(r.sessionId!);
    if(session.settings.mode==='real'&&!r.realAcknowledged)throw Error('需明确勾选追加真实预算授权');
    const answer=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','授权具体追加额度'],defaultId:0,cancelId:0,message:'仅追加后续轮次的累计预算，不重置消耗',detail:`项目：${session.projectPath}\nCC 累计上限：${session.settings.maxClaudeCalls} → ${r.maxClaudeCalls}；Codex 累计上限：${session.settings.maxLoops} → ${r.maxLoops}\n已使用 CC ${session.budget.claudeUsed}，Codex ${session.budget.loopsUsed}。\n${r.decision}\n不恢复暂停 Run、不批准交付。`});if(answer.response!==1)throw Error('用户取消追加预算授权');
   }
   if(r.operation==='sendSession'||r.operation==='processSessionMessage'){
    const {session,runs}=service.sessions.detail(r.sessionId!),last=runs.at(-1);
    const projectActive=service.overview().runs.some(run=>run.source.toLowerCase()===session.projectPath.toLowerCase()&&(run.active||['planning','execute','executing','applying','verify','review'].includes(run.phase)));
    const text=r.text??session.messages.find(m=>m.id===r.messageId)?.text??'';
    const starts=!projectActive&&(!last||last.phase==='completed')&&!/^(好[的]?|继续|可以|ok|yes|批准|同意)[。！!\s]*$/i.test(text);
    if(starts){
     if(session.settings.projectMode==='direct'&&!session.directAuthorized){const answer=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','授权直接开发'],defaultId:0,cancelId:0,message:'Agent 将直接修改会话项目目录',detail:session.projectPath+'\n会话始终绑定此项目；快照、预算及每轮审计独立保留。'});if(answer.response!==1)throw Error('用户取消直接开发授权');r.directAcknowledged=true;}
     if(session.settings.mode==='real'){
      if(!r.realAcknowledged)throw Error('需明确勾选本轮真实额度消耗确认');
      const answer=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','授权本轮真实执行'],defaultId:0,cancelId:0,message:'真实 Agent 调用将消耗剩余会话预算',detail:`项目：${session.projectPath}\n累计剩余：CC ${session.budget.claudeRemaining} 次，Codex ${session.budget.loopsRemaining} 次；不重置历史消耗。\n${text}\n独立验收：${session.selectedTests.join('、')||'无，需人工验收'}\n不包含交付批准，不改变本机模型。`});if(answer.response!==1)throw Error('用户取消真实执行授权');
     }
    }
   }
   if(r.operation==='chooseProject'){const picked=await dialog.showOpenDialog(window,{title:'选择项目文件夹',properties:['openDirectory','createDirectory']});return picked.canceled?null:service.inspectProject(picked.filePaths[0]!);}
   if(r.operation==='startProject'){
    const project=service.inspectProject(r.projectPath!);
    if(r.projectMode==='direct'&&!project.directAuthorized){const answer=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','授权直接开发'],defaultId:0,cancelId:0,message:'Agent 将直接修改所选项目目录',detail:`项目：${project.path}\n文件修改即刻保存在此目录；内部快照位于 PersonalAgent 的 D 盘运行目录。原生 Shell 可访问其他目录，项目规则不是技术隔离。\nMock 仅生成 hello.txt/done.txt 和每次 Run 的 mock-result 标记；真实模式使用本机 Agent 工具。`});if(answer.response!==1)throw Error('用户取消直接开发授权');r.directAcknowledged=true;}
    service.validateProjectStart({...r,realAcknowledged:r.mode==='real'?true:r.realAcknowledged});
    if(r.mode==='real'){if(!r.realAcknowledged)throw Error('需明确勾选真实额度消耗确认');const answer=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','授权本次真实执行'],defaultId:0,cancelId:0,message:'真实 Agent 调用将消耗额度',detail:`项目：${project.path}\nCC ${r.maxClaudeCalls} 次；Codex ${r.maxLoops} 次；返工 ${r.maxReworks} 次。\n${r.goal}\n本次授权独立验收命令：${(r.selectedTests??[]).join('、')||'无，需人工验收'}。本机模型默认值生效。未配置可信测试时，不会宣称测试通过。Agent 可运行项目命令。`});if(answer.response!==1)throw Error('用户取消真实执行授权');}
   }
   if(r.operation==='importProfile'){const pick=r.file?{canceled:false,filePaths:[r.file]}:await dialog.showOpenDialog(window,{title:'导入可信 Controller 配置（D 盘）',defaultPath:root,properties:['openFile'],filters:[{name:'Controller JSON',extensions:['json']}]});if(pick.canceled)return service.overview();assertD(pick.filePaths[0]!);const confirm=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','信任并导入'],defaultId:0,cancelId:0,message:'确认信任此本地配置？',detail:`配置文件：${pick.filePaths[0]}\n配置中的授权仓库和验收命令将在主进程执行。仅导入你编写或核验过的配置；不会导入或显示原始认证凭据。`});if(confirm.response!==1)return service.overview();return service.register(pick.filePaths[0]!);}
   if(r.operation==='start')service.validateStart(r);
   if(r.operation==='start'&&service.config(r.profileId!).config.mode==='real'){if(!r.realAcknowledged)throw Error('需明确勾选真实额度消耗确认');const approval=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','授权本次真实执行'],defaultId:0,cancelId:0,message:'真实 Claude Code / Codex 调用将消耗额度',detail:`目标仓库：${r.repository}\nCC 上限 ${r.maxClaudeCalls} 次；Codex 上限 ${r.maxLoops} 次；每任务返工 ${r.maxReworks} 次。\n${r.goal}\n\n全局预算仍生效，交付审批不包含在本次授权中。`});if(approval.response!==1)throw Error('用户取消真实执行授权');}
   if(r.operation==='resume')service.validateResume(r);
   if(r.operation==='resume'&&service.store(r.profileId!,r.runId!).load().config.mode==='real'){const approval=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','恢复本次 Run'],defaultId:0,cancelId:0,message:'恢复可能继续消耗已授权额度',detail:'原有计数、会话和预算保留，不自动扩大上限。\n'+r.decision});if(approval.response!==1)throw Error('用户取消恢复');}
   if(r.operation==='manualAccept'){const answer=await dialog.showMessageBox(window,{type:'question',buttons:['取消','记录人工验收'],defaultId:0,cancelId:0,message:'人工验收不会声明独立测试通过',detail:`Run：${r.runId}\n摘要：${r.digest}\n检查记录：${r.decision}`});if(answer.response!==1)throw Error('用户取消人工验收');}
   if(r.operation==='approve'){const deliveries=await service.deliveries(r.profileId!,r.runId!),d=deliveries.find(d=>d.id===r.deliveryId);if(!d||d.digest!==r.digest)throw Error('Delivery digest mismatch');const approval=await dialog.showMessageBox(window,{type:'question',buttons:['取消','批准此具体交付'],defaultId:0,cancelId:0,message:'批准具体交付内容（不会立即应用）',detail:`Run：${d.runId}\n目标：${d.target}\n分支：${d.branch}\nHEAD：${d.head}\n摘要：${d.digest}\n${d.changes.map(c=>(c.after===null?'DELETE ':c.before===null?'ADD ':'MODIFY ')+c.path).join('\n')}`});if(approval.response!==1)throw Error('用户取消审批');}
   if(r.operation==='apply'){const direct=service.store(r.profileId!,r.runId!).load().config.projectMode==='direct';const approval=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','应用已批准内容'],defaultId:0,cancelId:0,message:direct?'重新验收并确认已有成果（不重复写入）':'应用将写入目标仓库',detail:direct?'文件已直接修改。核验准确批准、Diff 与独立验收；不重复写入项目。':'重新核验批准、内容和目标状态，仅应用摘要中列出的新增、修改及 Context 文档删除；不会 commit、merge 或 push。'});if(approval.response!==1)throw Error('用户取消应用');}
   return await service.dispatch(r);
  }catch(error){throw Error(redact((error as Error).message));}
 });
 await window.loadURL('personalagent://app/index.html');
 let rendererRecoveries=0;
 window.webContents.on('render-process-gone',(_event,details)=>{
  fs.appendFileSync(path.join(data,'logs','renderer-failures.jsonl'),JSON.stringify({time:new Date().toISOString(),...details})+'\n');
  if(quitting||details.reason==='clean-exit'||rendererRecoveries>=2)return;
  rendererRecoveries++;
  setTimeout(()=>{if(!window.isDestroyed())void window.loadURL('personalagent://app/index.html').catch(error=>fs.appendFileSync(path.join(data,'logs','renderer-failures.jsonl'),JSON.stringify({time:new Date().toISOString(),error:redact(String(error))})+'\n'));},1000);
 });
 window.on('close',event=>{if(service.children.size&&!quitting){event.preventDefault();void dialog.showMessageBox(window,{type:'warning',buttons:['留在窗口','停止任务并关闭'],defaultId:0,cancelId:0,message:'Controller 仍有运行中的任务',detail:'关闭前请求安全停止；状态和预算会持久化，之后可恢复。'}).then(async answer=>{if(answer.response===1){quitting=true;await service.stopOwned();app.quit();}});}});
 app.on('second-instance',()=>{if(window.isMinimized())window.restore();window.focus();});
});
app.on('window-all-closed',()=>app.quit());
