import {chatRoute} from './chatRouting.js';
import {installRendererRecovery} from './rendererRecovery.js';
import {app,BrowserWindow,ipcMain,dialog,protocol,session,Menu,MenuItem,screen,shell,clipboard} from 'electron';
import {restoreWindowBounds,ensureWindowOnDisplay,watchWindowDisplays} from './windowPlacement.js';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {atomicJson} from '../../dist/src/store.js';
import {readInteractionPolicy} from '../../dist/src/interaction-policy.js';
import {fileURLToPath} from 'node:url';
import {DesktopService,validateRequest,redact} from './service.js';
import {HistoryReader,historyOperations} from './historyReader.js';
import {assertD} from '../../dist/src/store.js';
import {instanceId,instanceData,claimInstanceData} from '../../dist/src/instance-runtime.js';
import {desktopNode,desktopPath} from '../../dist/src/platform-runtime.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
process.env.PATH=desktopPath();
// Packaged trials default to TEST and carry their own native CLI installations.
// Explicit instance/data selections still win; authentication stays in the user home.
if(app.isPackaged){
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 process.env.PERSONALAGENT_INSTANCE??=metadata.personalAgentInstance??'test';
}
const node=desktopNode(root);
if(process.platform!=='win32')process.env.PATH=[path.dirname(node),path.join(root,'node_modules/.bin'),process.env.PATH].join(path.delimiter);
const id=instanceId(),data=instanceData(root),title='PersonalAgent '+id.toUpperCase();
process.env.PERSONALAGENT_INSTANCE=id;claimInstanceData(data);
atomicJson(path.join(data,'startup.json'),{time:new Date().toISOString(),pid:process.pid,platform:process.platform,arch:process.arch,packaged:app.isPackaged,instance:id,root,node});
if(process.platform==='win32'&&!/^D:[\\/]/i.test(data))throw Error('Desktop data must be on D drive');
assertD(data);assertD(root);
fs.mkdirSync(path.join(data,'tmp'),{recursive:true});process.env.TEMP=path.join(data,'tmp');process.env.TMP=process.env.TEMP;process.env.TMPDIR=process.env.TEMP;process.env.XDG_CACHE_HOME=path.join(data,'cache');process.env.npm_config_cache=path.join(data,'cache/npm');
app.setPath('userData',path.join(data,'electron'));app.setPath('sessionData',path.join(data,'electron/session'));app.setPath('crashDumps',path.join(data,'crash-dumps'));app.setAppLogsPath(path.join(data,'logs'));app.setName('PersonalAgent');app.enableSandbox();
protocol.registerSchemesAsPrivileged([{scheme:'personalagent',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const locked=app.requestSingleInstanceLock();if(!locked)app.quit();
let window:BrowserWindow;let service:DesktopService;let quitting=false;
const historyReader=new HistoryReader(root,data,node);
app.on('before-quit',()=>{void historyReader.close();});
const threadWatchers=new Map<string,fs.FSWatcher>();
const closeThreadWatchers=()=>{for(const watcher of threadWatchers.values())watcher.close();threadWatchers.clear();};
if(locked)app.whenReady().then(async()=>{
 service=new DesktopService(root,data,node);service.startSupervision();
 const ownerFile=path.join(data,'supervision-owner-'+randomUUID()+'.json');
 const owner={pid:process.pid,quitRequested:false,time:new Date().toISOString()};atomicJson(ownerFile,owner);
 app.on('will-quit',()=>{owner.quitRequested=true;atomicJson(ownerFile,owner);});
 try{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  const watchdog=spawn(service.node,[path.join(root,'dist/scripts/supervision-watchdog.js'),'--root',root,'--data',data,'--electron',process.execPath,'--owner',ownerFile],{cwd:root,env,detached:true,windowsHide:true,stdio:'ignore',shell:false});
  watchdog.on('error',error=>fs.appendFileSync(path.join(data,'supervision-watchdog.jsonl'),JSON.stringify({time:new Date().toISOString(),event:'watchdog-start-error',reason:redact(String(error))})+'\n'));
  watchdog.unref();
 }catch(error){fs.appendFileSync(path.join(data,'supervision-watchdog.jsonl'),JSON.stringify({time:new Date().toISOString(),event:'watchdog-start-error',reason:redact(String(error))})+'\n');}
 {for(const file of ['cafe-validation/real.config.json','fish-validation/real.config.json']){const full=path.join(root,file);if(fs.existsSync(full)&&!service.registry().profiles.some(p=>p.file===full))try{service.register(full,true);}catch{}}}
 const renderer=path.join(root,'desktop/out/renderer');
 protocol.handle('personalagent',request=>{try{const url=new URL(request.url);if(url.host!=='app'||request.method!=='GET')return new Response('Forbidden',{status:403});const evidence=url.pathname.match(/^\/evidence\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9]{64})\.png$/);if(evidence)return new Response(new Uint8Array(service.image(evidence[1]!,evidence[2]!,evidence[3]!)),{headers:{'content-type':'image/png','x-content-type-options':'nosniff','cache-control':'no-store'}});const relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname).slice(1),file=path.resolve(renderer,relative);if(file!==renderer&&!file.startsWith(renderer+path.sep))return new Response('Forbidden',{status:403});const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};return new Response(new Uint8Array(fs.readFileSync(file)),{headers:{'content-type':mime[path.extname(file)]??'application/octet-stream','x-content-type-options':'nosniff'}});}catch{return new Response('Not found',{status:404});}});
 session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));session.defaultSession.setPermissionCheckHandler(()=>false);
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('personalagent://app/')&&!details.url.startsWith('devtools://')}));
 const windowFile=path.join(data,'window.json');let saved:unknown;
 if(fs.existsSync(windowFile))try{saved=JSON.parse(fs.readFileSync(windowFile,'utf8'));}catch{}
 const bounds=restoreWindowBounds(saved,screen.getAllDisplays().map(display=>display.workArea),screen.getPrimaryDisplay().workArea);
 window=new BrowserWindow({...bounds,show:!(process.env.PERSONALAGENT_SUPERVISION_RESTART==='1'&&readInteractionPolicy().mode==='work'),minWidth:Math.min(1024,bounds.width),minHeight:Math.min(680,bounds.height),title,backgroundColor:'#f6f8fb',autoHideMenuBar:true,webPreferences:{preload:path.join(root,'desktop/out/preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false}});
 watchWindowDisplays(window,screen);
 window.webContents.on('did-start-navigation',(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame)closeThreadWatchers();});
 window.webContents.on('destroyed',closeThreadWatchers);
 window.webContents.on('render-process-gone',closeThreadWatchers);
 app.on('before-quit',closeThreadWatchers);
 window.on('page-title-updated',event=>event.preventDefault());
 window.on('close',()=>{fs.writeFileSync(windowFile,JSON.stringify(window.getNormalBounds()),{flush:true});});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());window.webContents.on('will-attach-webview',e=>e.preventDefault());
 window.webContents.on('context-menu',(_event,params)=>{const items:Electron.MenuItemConstructorOptions[]=[];if(params.selectionText)items.push({label:'复制',role:'copy'});if(params.isEditable)items.push({label:'剪切',role:'cut'},{label:'粘贴',role:'paste'});if(params.isEditable||params.selectionText)items.push({label:'全选',role:'selectAll'});if(items.length)Menu.buildFromTemplate(items).popup({window});});
 ipcMain.handle('personalagent:request',async(event,raw)=>{
  if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!=='personalagent://app/index.html')throw Error('Untrusted IPC sender');
  const r=validateRequest(raw);
  try{
   if(r.operation==='openProjectFolder'||r.operation==='copyProjectPath'){
    const projectPath=service.sidebarProjectPath(r.projectPath!);
    if(r.operation==='copyProjectPath'){clipboard.writeText(projectPath);return {copied:true};}
    if(!fs.statSync(projectPath).isDirectory())throw Error('项目目录不可用');
    const error=await shell.openPath(projectPath);if(error)throw Error(error);return {opened:true};
   }
   if(r.operation==='sendSession'||r.operation==='processSessionMessage'||r.operation==='steerSessionMessage'){
    const {session,runs}=service.sessions.detail(r.sessionId!),last=runs.at(-1);
    const projectActive=service.overview().runs.some(run=>run.source.toLowerCase()===session.projectPath.toLowerCase()&&(run.active||['planning','execute','executing','applying','verify','review'].includes(run.phase)));
    const text=r.text??session.messages.find(m=>m.id===r.messageId)?.text??'';
    const starts=session.chatMode!=='discuss'&&!/^\/discuss(?:\s|$)/i.test(text)&&!projectActive&&chatRoute(text,last,Boolean(r.attachments?.length))==='start';
    if(starts){
     if(session.settings.projectMode==='direct'&&!session.directAuthorized){const answer=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','授权直接开发'],defaultId:0,cancelId:0,message:'Agent 将直接修改会话项目目录',detail:session.projectPath+'\n会话始终绑定此项目；快照、用量及每轮审计独立保留。'});if(answer.response!==1)throw Error('用户取消直接开发授权');r.directAcknowledged=true;}
    }
   }
   if(r.operation==='executeDiscussion'){
    const session=service.sessions.get(r.sessionId!);
    if(r.projectMode==='direct'&&!session.directAuthorized){const answer=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','授权直接开发'],defaultId:0,cancelId:0,message:'按讨论方案开始直接开发',detail:session.projectPath+'\n'+(session.discussionPlan??'')});if(answer.response!==1)throw Error('用户取消直接开发授权');r.directAcknowledged=true;}
   }
   if(r.operation==='chatFileMenu')return new Promise<string|null>(resolve=>{
    let selected=false;
    Menu.buildFromTemplate([{label:'查看文件',click:()=>{selected=true;resolve('view');}},{label:'打开所在文件夹',click:()=>{selected=true;void service.chatFileLocation(r.profileId!,r.runId!,r.messageId!,r.file!).then(file=>{shell.showItemInFolder(file);resolve('reveal');}).catch(error=>{void dialog.showMessageBox(window,{type:'error',message:'无法打开所在文件夹',detail:(error as Error).message});resolve(null);});}}]).popup({window,callback:()=>{if(!selected)resolve(null);}});
   });
   if(r.operation==='chooseProject'){const picked=await dialog.showOpenDialog(window,{title:'选择项目文件夹',properties:['openDirectory','createDirectory']});return picked.canceled?null:service.inspectProject(picked.filePaths[0]!);}
   if(r.operation==='startProject'){
    const project=service.inspectProject(r.projectPath!);
    if(r.projectMode==='direct'&&!project.directAuthorized){const answer=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','授权直接开发'],defaultId:0,cancelId:0,message:'Agent 将直接修改所选项目目录',detail:`项目：${project.path}\n文件修改即刻保存在此目录；内部快照位于 PersonalAgent 的本机隔离运行目录。原生 Shell 可访问其他目录，项目规则不是技术隔离。\nMock 仅生成 hello.txt/done.txt 和每次 Run 的 mock-result 标记；真实模式使用本机 Agent 工具。`});if(answer.response!==1)throw Error('用户取消直接开发授权');r.directAcknowledged=true;}
    service.validateProjectStart(r);
   }
   if(r.operation==='importProfile'){const pick=r.file?{canceled:false,filePaths:[r.file]}:await dialog.showOpenDialog(window,{title:'导入可信本机 Controller 配置',defaultPath:root,properties:['openFile'],filters:[{name:'Controller JSON',extensions:['json']}]});if(pick.canceled)return service.overview();assertD(pick.filePaths[0]!);const confirm=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','信任并导入'],defaultId:0,cancelId:0,message:'确认信任此本地配置？',detail:`配置文件：${pick.filePaths[0]}\n主进程校验授权仓库；配置中的检查命令交决策者参考，由决策者自行选择验证方法。仅导入你编写或核验过的配置；不会导入或显示原始认证凭据。`});if(confirm.response!==1)return service.overview();return service.register(pick.filePaths[0]!);}
   if(r.operation==='start')service.validateStart(r);
   if(r.operation==='resume')service.validateResume(r);
   if(r.operation==='contextDecide'){const run=service.store(r.profileId!,r.runId!).load();const request=service.publicRun(run,r.profileId!).contextConfirmations?.find(item=>item.id===r.requestId&&item.requestHash===r.digest);if(!request)throw Error('文档确认请求已变化');const answer=await dialog.showMessageBox(window,{type:'question',buttons:['取消',r.cancel?'取消该确认请求':'明确执行文档决策'],defaultId:0,cancelId:0,message:'正式契约/决策确认；不批准成果交付',detail:`项目：${request.projectId}
工作区：${request.workspace}
文件：${request.relative}
ID：${request.documentId}
动作：${r.cancel?'取消请求':r.contextAction??request.action}
摘要：${request.digest}
具体内容：
${request.content}
${request.replacement?'替代方案：'+request.replacement.relative+'\n'+request.replacement.content:''}`});if(answer.response!==1)throw Error('用户取消文档决策');}
   if(r.operation==='manualAccept'){const answer=await dialog.showMessageBox(window,{type:'question',buttons:['取消','记录人工验收'],defaultId:0,cancelId:0,message:'人工验收不会声明独立测试通过',detail:`Run：${r.runId}\n摘要：${r.digest}\n检查记录：${r.decision}`});if(answer.response!==1)throw Error('用户取消人工验收');}
   if(r.operation==='approve'){const deliveries=await service.deliveries(r.profileId!,r.runId!),d=deliveries.find(d=>d.id===r.deliveryId);if(!d||d.digest!==r.digest)throw Error('Delivery digest mismatch');const approval=await dialog.showMessageBox(window,{type:'question',buttons:['取消','批准此具体交付'],defaultId:0,cancelId:0,message:'批准具体交付内容（不会立即应用）',detail:`Run：${d.runId}\n目标：${d.target}\n分支：${d.branch}\nHEAD：${d.head}\n摘要：${d.digest}\n${d.changes.map(c=>(c.after===null?'DELETE ':c.before===null?'ADD ':'MODIFY ')+c.path).join('\n')}`});if(approval.response!==1)throw Error('用户取消审批');}
   if(r.operation==='apply'){const direct=service.store(r.profileId!,r.runId!).load().config.projectMode==='direct';const approval=await dialog.showMessageBox(window,{type:'warning',buttons:['取消','应用已批准内容'],defaultId:0,cancelId:0,message:direct?'重新验收并确认已有成果（不重复写入）':'应用将写入目标仓库',detail:direct?'文件已直接修改。核验准确批准、Diff 与独立验收；不重复写入项目。':'重新核验批准、内容和目标状态，仅应用摘要中列出的新增、修改及 Context 文档删除；不会 commit、merge 或 push。'});if(approval.response!==1)throw Error('用户取消应用');}
   return await (historyOperations.has(r.operation)?historyReader.read(r):service.dispatch(r));
  }catch(error){throw Error(redact((error as Error).message));}
 });
 ipcMain.handle('personalagent:subscribe',async(event,raw)=>{
  if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!=='personalagent://app/index.html')throw Error('Untrusted IPC sender');
  const profileId=String(raw?.profileId??''),runId=String(raw?.runId??''),key=`${profileId}:${runId}`;
  if(!/^[0-9a-f-]{36}$/.test(profileId)||!/^[0-9a-f-]{36}$/.test(runId))throw Error('Invalid thread subscription');
  if(threadWatchers.has(key))return {subscribed:true};
  if(threadWatchers.size>=16)throw Error('Too many thread subscriptions');
  const file=path.dirname(service.store(profileId,runId).file('audit.jsonl'));
  const notify=()=>{if(!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send(`personalagent:thread:${profileId}:${runId}`,{time:Date.now()});};
  try{const watcher=fs.watch(file,{persistent:false},notify);watcher.on('error',()=>{watcher.close();threadWatchers.delete(key);});threadWatchers.set(key,watcher);notify();}catch(error){throw Error('Thread event stream unavailable: '+(error as Error).message);}
  return {subscribed:true};
 });
 ipcMain.handle('personalagent:unsubscribe',async(event,raw)=>{
  if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!=='personalagent://app/index.html')throw Error('Untrusted IPC sender');
  const key=`${String(raw?.profileId??'')}:${String(raw?.runId??'')}`,watcher=threadWatchers.get(key);if(watcher){watcher.close();threadWatchers.delete(key);}return {unsubscribed:true};
 });
 const recovery=installRendererRecovery(window,{quitting:()=>quitting,allowed:()=>readInteractionPolicy().mode==='idle',log:entry=>{
  fs.mkdirSync(path.join(data,'logs'),{recursive:true});
  fs.appendFileSync(path.join(data,'logs','renderer-failures.jsonl'),JSON.stringify({time:new Date().toISOString(),...entry,...(entry.error?{error:redact(String(entry.error))}:{})})+'\n');
 }});
 app.on('will-quit',recovery.dispose);
 const menu=Menu.getApplicationMenu()??new Menu();
 menu.append(new MenuItem({label:'恢复界面（保留运行任务）',accelerator:'CmdOrCtrl+Shift+R',click:recovery.recover}));
 Menu.setApplicationMenu(menu);
 window.on('close',event=>{if((service.children.size||service.sessions.discussionCalls.size)&&!quitting){event.preventDefault();void dialog.showMessageBox(window,{type:'warning',buttons:['留在窗口','停止任务并关闭'],defaultId:0,cancelId:0,message:'Controller 仍有运行中的任务',detail:'关闭前请求安全停止；状态和用量会持久化，之后可恢复。'}).then(async answer=>{if(answer.response===1){quitting=true;await service.stopOwned();app.quit();}});}});
 app.on('second-instance',()=>{if(window.isDestroyed())return;if(window.isMinimized())window.restore();ensureWindowOnDisplay(window,screen);window.show();window.focus();});
 await window.loadURL('personalagent://app/index.html').catch(()=>recovery.recover());
});
app.on('window-all-closed',()=>app.quit());
