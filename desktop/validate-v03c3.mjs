import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const { _electron: electron }=await import(pathToFileURL(path.join(root,'.validation/tools/node_modules/playwright-core/index.mjs')).href);
const dir=path.join(root,'.validation','e3-'+randomUUID().slice(0,8));
fs.mkdirSync(path.join(dir,'tmp'),{recursive:true});
const fixtures=path.join(dir,'projects');fs.mkdirSync(fixtures);
const empty=path.join(fixtures,'empty-folder'),existing=path.join(fixtures,'existing-folder'),dirty=path.join(fixtures,'dirty-git'),isolated=path.join(fixtures,'isolated-folder');
const otherDrive=path.join(process.env.LOCALAPPDATA,'Temp','PersonalAgent-Mock-'+randomUUID());fs.mkdirSync(otherDrive);
for(const folder of [empty,existing,dirty,isolated])fs.mkdirSync(folder);
fs.writeFileSync(path.join(existing,'original.txt'),'Existing user data\n');
fs.writeFileSync(path.join(dirty,'original.txt'),'Committed user data\n');
for(const args of [['init','-b','fixture'],['add','.'],['-c','user.name=Mock','-c','user.email=mock@example.invalid','commit','-m','Fixture']])execFileSync('git',args,{cwd:dirty,windowsHide:true});
fs.writeFileSync(path.join(dirty,'original.txt'),'Uncommitted user data\n');
fs.writeFileSync(path.join(isolated,'original.txt'),'Isolated user data\n');
const env={...process.env,PERSONAL_AGENT_DESKTOP_DATA:path.join(dir,'data'),TEMP:path.join(dir,'tmp'),TMP:path.join(dir,'tmp')};
delete env.ELECTRON_RUN_AS_NODE;
let app,page;const checks=[],errors=[],screenshots=[];
async function launch(){app=await electron.launch({executablePath:path.join(root,'desktop/node_modules/electron/dist/electron.exe'),args:[path.join(root,'desktop')],env,timeout:30000});page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('.group-workspace');await app.evaluate(({dialog})=>{globalThis.__dialogCalls=[];dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.__fixturePath]});dialog.showMessageBox=async(_window,options)=>{globalThis.__dialogCalls.push(options);return {response:globalThis.__cancelNext?0:1,checkboxChecked:false};};});}
const nav=async name=>page.locator('.sidebar nav').getByRole('button',{name:new RegExp('^'+name)}).click();
const overview=()=>page.evaluate(()=>window.personalAgent.invoke({operation:'overview'}));
async function shot(name){const file=path.join(dir,name+'.png');await page.screenshot({path:file});screenshots.push(file);}
async function check(name,operation){await operation();checks.push({name,passed:true});}
async function create(folder,goal,mode='direct'){
 await nav('新建任务');await app.evaluate((_electron,folder)=>{globalThis.__fixturePath=folder;},folder);
 await page.getByRole('button',{name:/^(选择项目文件夹|更换文件夹)$/}).click();
 await page.locator('#project-goal').fill(goal);
 if(mode==='isolated'){await page.locator('.advanced-settings summary').click();await page.locator('#workspace-mode').selectOption('isolated');}
 await page.getByRole('button',{name:'开始开发',exact:true}).click();await page.waitForSelector('.group-workspace');
 await page.waitForFunction(name=>document.querySelector('.conversation-header h2')?.textContent===name,path.basename(folder));
 let run;for(let i=0;i<240;i++){run=(await overview()).runs.find(r=>r.goal===goal);if(run&&['completed','failed','paused'].includes(run.phase))break;await page.waitForTimeout(250);}
 assert.equal(run?.phase,'completed',JSON.stringify(run));assert.equal(run.mode,'mock');assert.equal(run.claudeCalls,0);assert.equal(run.evidence.passed,true);await page.waitForFunction(()=>document.querySelector('.live-label')?.textContent?.includes('本轮开发已完成'));return run;
}
try{
 await launch();
 await check('普通入口不要求导入配置；Windows文件夹选择器取消与直接授权取消安全',async()=>{
  await nav('新建任务');assert.equal(await page.locator('#profile').count(),0);
  await app.evaluate(({dialog},folder)=>{globalThis.__fixturePath=folder;globalThis.__open=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});},empty);
  await page.getByRole('button',{name:'选择项目文件夹',exact:true}).click();assert.equal(await page.getByRole('button',{name:'开始开发',exact:true}).isDisabled(),true);
  await app.evaluate(({dialog})=>{dialog.showOpenDialog=globalThis.__open;});
  await page.getByRole('button',{name:'选择项目文件夹',exact:true}).click();await page.locator('#project-goal').fill('Canceled direct task');await page.locator('h1').scrollIntoViewIfNeeded();await shot('00-project-create');
  await app.evaluate(()=>{globalThis.__cancelNext=true;});await page.getByRole('button',{name:'开始开发',exact:true}).click();await page.waitForSelector('[role="alert"]');assert.equal((await overview()).runs.length,0);assert.deepEqual(fs.readdirSync(empty),[]);
  await shot('01-create-and-authorization');await app.evaluate(()=>{globalThis.__cancelNext=false;});
 });
 await check('无Git空文件夹完整GUI Mock闭环和外部配置快照',async()=>{
  const run=await create(empty,'Empty folder Mock');assert.equal(run.workspace,run.source);assert.equal(fs.existsSync(path.join(empty,'.git')),false);assert.equal(fs.readFileSync(path.join(empty,'done.txt'),'utf8'),'done\n');await shot('02-empty-direct-completed');
 });
 await check('已有普通项目直接修改并保留用户文件',async()=>{await create(existing,'Existing folder Mock');assert.equal(fs.readFileSync(path.join(existing,'original.txt'),'utf8'),'Existing user data\n');await shot('03-existing-direct-completed');});
 await check('含未提交修改的Git项目直接运行，无自动提交',async()=>{await create(dirty,'Dirty Git Mock');assert.equal(fs.readFileSync(path.join(dirty,'original.txt'),'utf8'),'Uncommitted user data\n');assert.equal(execFileSync('git',['rev-list','--count','HEAD'],{cwd:dirty,encoding:'utf8'}).trim(),'1');await shot('04-dirty-git-completed');});
 await check('普通文件夹隔离开发、分别审批和应用',async()=>{
  const run=await create(isolated,'Isolated folder Mock','isolated');assert.notEqual(run.workspace,run.source);assert.equal(fs.existsSync(path.join(isolated,'hello.txt')),false);assert.equal(fs.readFileSync(path.join(run.workspace,'done.txt'),'utf8'),'done\n');await shot('05-isolated-completed');
  const base={profileId:run.profileId,runId:run.id};
  const preview=await page.evaluate(base=>window.personalAgent.invoke({...base,operation:'preview',target:globalThis.__neverUsed??'',branch:'project-files'}),{...base}).catch(()=>null);
  assert.equal(preview,null,'invalid target must be refused');
  await nav('成果交付');await page.getByRole('button',{name:'生成交付预览',exact:true}).click();assert.equal(await page.locator('#branch').count(),0);await page.getByRole('button',{name:'生成预览',exact:true}).click();await page.waitForSelector('.approval-panel');
  const deliveries=await page.evaluate(base=>window.personalAgent.invoke({...base,operation:'deliveries'}),base),delivery=deliveries.at(-1);
  await page.getByRole('button',{name:'批准具体交付',exact:true}).click();await page.locator('#decision').fill('Approve only Mock marker files in this disposable fixture');await page.locator('#approval-digest').fill(delivery.digest);await page.getByRole('button',{name:'明确批准',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.delivery-header')?.textContent?.includes('已批准'));
  await page.getByRole('button',{name:'应用已批准内容',exact:true}).click();await page.getByRole('button',{name:'受控应用',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.delivery-header')?.textContent?.includes('已应用'));assert.equal(fs.readFileSync(path.join(isolated,'done.txt'),'utf8'),'done\n');assert.equal(fs.existsSync(path.join(isolated,'.git')),false);await shot('05-isolated-applied');
 });
 await check('重启恢复最近项目、自动配置、模式与历史Run，无重复记录',async()=>{
  const before=await overview();assert.equal(new Set(before.runs.map(r=>r.id)).size,before.runs.length);await app.close();await launch();
  const after=await overview();assert.deepEqual(after.runs.map(r=>r.id).sort(),before.runs.map(r=>r.id).sort());assert.equal(after.recentProjects.length,4);
  await nav('新建任务');await page.getByRole('button',{name:'empty-folder',exact:true}).click();await page.locator('#project-goal').fill('Recent reopened Mock');
  const dialogCount=await app.evaluate(()=>globalThis.__dialogCalls.length);await page.getByRole('button',{name:'开始开发',exact:true}).click();await page.waitForSelector('.group-workspace');
  for(let i=0;i<240;i++){if((await overview()).runs.find(r=>r.goal==='Recent reopened Mock')?.phase==='completed')break;await page.waitForTimeout(250);}
  assert.equal((await overview()).runs.find(r=>r.goal==='Recent reopened Mock')?.phase,'completed');assert.equal(await app.evaluate(()=>globalThis.__dialogCalls.length),dialogCount,'same project direct authorization is reused');await page.waitForFunction(()=>document.querySelector('.live-label')?.textContent?.includes('本轮开发已完成'));
  await shot('06-restarted-recent-project');
 });
 await check('1280布局无横向溢出、Renderer无错误，真实付费调用为零',async()=>{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,720));await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.ok((await overview()).runs.every(r=>r.mode==='mock'&&r.claudeCalls===0));await shot('07-layout-1280');});
 await check('C盘普通项目可直接开发，PersonalAgent配置和快照仍保存在D盘',async()=>{const run=await create(otherDrive,'Other drive folder Mock');assert.match(run.source,/^C:/i);const registered=JSON.parse(fs.readFileSync(path.join(dir,'data/profiles.json'))).profiles.find(p=>p.id===run.profileId);const config=JSON.parse(fs.readFileSync(registered.file));assert.match(config.runtimeDir,/^D:/i);assert.equal(fs.existsSync(path.join(otherDrive,'.git')),false);await shot('08-other-drive-completed');});
 let legacyRun;
 await check('旧Git隔离Mock与群聊角色筛选、待生效备注兼容',async()=>{
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,900));
  const data=await page.evaluate(()=>window.personalAgent.invoke({operation:'prepareMock'})),profile=data.profiles.at(-1);
  legacyRun=await page.evaluate(p=>window.personalAgent.invoke({operation:'start',profileId:p.id,repository:p.repositories[0],goal:'Legacy group regression',maxClaudeCalls:5,maxLoops:4,maxReworks:1,scenario:'pass'}),profile);
  for(let i=0;i<240;i++){if((await overview()).runs.find(r=>r.id===legacyRun.id)?.phase==='completed')break;await page.waitForTimeout(250);}
  await page.locator('.sidebar-sessions button').filter({hasText:'repository'}).first().click();await page.waitForFunction(()=>document.querySelector('.live-label')?.textContent?.includes('本轮开发已完成'));
  await page.getByLabel('筛选群聊角色').selectOption('claude');assert.equal(await page.locator('.chat-feed .group-message:not(.role-claude)').count(),0);await page.getByLabel('筛选群聊角色').selectOption('all');
  await page.locator('#group-input').fill('**后续需求**：仅记录，不批准交付');await page.getByRole('button',{name:'记录消息',exact:true}).click();await page.waitForSelector('.kind-note');assert.equal((await overview()).runs.find(r=>r.id===legacyRun.id).phase,'completed');assert.ok(await page.locator('.pending-label').filter({hasText:'未生效'}).count());await shot('09-legacy-group-note');
 });
 await check('群聊IPC断连保留记录，恢复后事件不重复',async()=>{
  const count=await page.locator('.group-message').count();await app.evaluate(({ipcMain},id)=>{globalThis.__handler=ipcMain._invokeHandlers.get('personalagent:request');ipcMain.removeHandler('personalagent:request');ipcMain.handle('personalagent:request',(event,r)=>{if(r.operation==='thread'&&r.runId===id)throw Error('Mock IPC disconnect');return globalThis.__handler(event,r);});},legacyRun.id);
  await page.waitForFunction(()=>document.querySelector('.conversation-toolbar')?.textContent?.includes('连接中断'));assert.equal(await page.locator('.group-message').count(),count);
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('personalagent:request');ipcMain.handle('personalagent:request',globalThis.__handler);});await page.waitForFunction(()=>document.querySelector('.conversation-toolbar')?.textContent?.includes('记录已连接'));
  const ids=await page.locator('.group-message').evaluateAll(nodes=>nodes.map(n=>n.dataset.messageId));assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,count);
 });
 await check('暂停决策、可信截图放大、明确视觉确认后续接兼容',async()=>{
  const data=await page.evaluate(()=>window.personalAgent.invoke({operation:'prepareMock'})),profile=data.profiles.at(-1),registry=JSON.parse(fs.readFileSync(path.join(dir,'data/profiles.json'))),config=JSON.parse(fs.readFileSync(registry.profiles.find(p=>p.id===profile.id).file));
  const artifacts=path.join(path.dirname(config.tests[0].args[0]),'artifacts','visual-proof');fs.mkdirSync(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,'fixture.png')});fs.appendFileSync(config.tests[0].args[0],'\nconsole.log('+JSON.stringify(JSON.stringify({artifacts}))+');\n');
  const paused=await page.evaluate(p=>window.personalAgent.invoke({operation:'start',profileId:p.id,repository:p.repositories[0],goal:'Legacy visual regression',maxClaudeCalls:5,maxLoops:4,maxReworks:1,scenario:'human'}),profile);
  for(let i=0;i<240;i++){if((await overview()).runs.find(r=>r.id===paused.id)?.phase==='paused')break;await page.waitForTimeout(250);}
  await page.locator('.sidebar-sessions button').filter({hasText:'repository'}).first().click();await page.waitForSelector('.decision-workbench');await page.waitForSelector('.gallery-thumb');await page.locator('.gallery-thumb').first().click();await page.waitForSelector('.image-viewer');await page.waitForFunction(()=>document.querySelector('.image-viewer img')?.naturalWidth>0);await shot('10-legacy-trusted-image');await page.getByRole('button',{name:'关闭截图',exact:true}).click();
  await page.getByLabel('消息用途').selectOption('visual');await page.locator('#group-input').fill('确认本地Mock截图，不批准交付');await page.getByLabel('我已查看本阶段所选截图').check();await page.getByRole('button',{name:'提交正式决策'}).click();
  let resumedFinal=false;for(let i=0;i<240;i++){const current=(await overview()).runs.find(r=>r.id===paused.id);if(current?.phase==='completed')break;if(current?.phase==='paused'&&current.taskIndex>0&&!resumedFinal){await page.waitForSelector('.decision-workbench');await page.getByLabel('消息用途').selectOption('resume');await page.locator('#group-input').fill('继续最后一个本地Mock阶段，不扩大预算，不批准交付');await page.getByRole('button',{name:'提交正式决策'}).click();resumedFinal=true;}await page.waitForTimeout(250);}
  assert.equal((await overview()).runs.find(r=>r.id===paused.id)?.phase,'completed');assert.equal((await overview()).runs.find(r=>r.id===paused.id)?.claudeCalls,0);await page.waitForFunction(()=>document.querySelector('.live-label')?.textContent?.includes('本轮开发已完成'));await shot('11-legacy-formal-resume');
 });
 assert.deepEqual(errors,[]);
}catch(error){checks.push({name:'flow-failure',passed:false,error:error.stack});if(page)await shot('failure').catch(()=>{});}
finally{if(app)await app.close().catch(()=>{});if(fs.realpathSync(otherDrive)===path.resolve(otherDrive)&&path.basename(otherDrive).startsWith('PersonalAgent-Mock-'))fs.rmSync(otherDrive,{recursive:true});}
const report={dir,checks,screenshots,errors,realAgentCalls:0,nativeDialogPolicy:'Actual Electron dialog API stubbed only for deterministic fixture selection and explicit accept/cancel; production native API wiring exercised',passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length};
fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
