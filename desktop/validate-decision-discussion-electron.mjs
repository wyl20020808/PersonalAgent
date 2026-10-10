import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Actual Electron and formal Controller with explicit local Mock adapters only.
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
if(!root.replaceAll('\\','/').match(/\/tasks\/(multi-decision-discussion-p2a|personalagent-snapshot-p2a-v1)$/))throw Error('Use the owned P2A Worktree');
const directory=`D:/PersonalAgent-data/multi-decision-discussion-p2a/electron-${randomUUID().slice(0,8)}`;
const projects=['single','dual-one','dual-zero','mixed'].map(name=>path.join(directory,name));
for(const project of projects){fs.mkdirSync(project,{recursive:true});fs.writeFileSync(path.join(project,'user.txt'),'Keep user file\n');}
const {_electron}=await import(pathToFileURL(process.env.PERSONAL_AGENT_PLAYWRIGHT??'D:/PersonalAgent/snake-validation/node_modules/playwright-core/index.mjs').href);
const executablePath=process.env.PERSONAL_AGENT_ELECTRON??path.join(root,'desktop/node_modules/electron/dist/electron.exe');
const env={...process.env,PERSONALAGENT_INSTANCE:'main',PERSONAL_AGENT_DESKTOP_DATA:path.join(directory,'data'),TEMP:path.join(directory,'tmp'),TMP:path.join(directory,'tmp')};delete env.ELECTRON_RUN_AS_NODE;fs.mkdirSync(env.TEMP,{recursive:true});
const bootstrap=path.join(directory,'preview.mjs'),discoveryFile=path.join(directory,'discovery.json');
const available={available:true,reason:'Local deterministic discovery fixture; no remote reasoning',providers:[{id:'fixture-provider',name:'Local fixture provider',models:[{id:'model-one',name:'Local fixture model',capabilities:{tools:true,structuredOutput:true}},{id:'no-tools',name:'Unsupported model fixture',capabilities:{tools:false,structuredOutput:true}}]}]};
fs.writeFileSync(discoveryFile,JSON.stringify(available));
fs.writeFileSync(bootstrap,`import fs from 'node:fs';
import {DesktopService} from ${JSON.stringify(pathToFileURL(path.join(root,'desktop/out/service.js')).href)};
const dispatch=DesktopService.prototype.dispatch;
DesktopService.prototype.dispatch=function(r){if(r.operation==='createSession'){if(r.mode!=='real')throw Error('UI default must remain Real');r={...r,mode:'mock',selectedTests:[]};}return dispatch.call(this,r);};
DesktopService.prototype.decisionModels=async()=>JSON.parse(fs.readFileSync(${JSON.stringify(discoveryFile)},'utf8'));
const launch=DesktopService.prototype.launch;
DesktopService.prototype.launch=function(store,...args){if(store.load().config.mode!=='mock')throw Error('Validation refuses paid models');return launch.call(this,store,...args);};
await import(${JSON.stringify(pathToFileURL(path.join(root,'desktop/out/main.js')).href)});
`);
let app,page;const checks=[],screenshots=[],errors=[],runs=[];
const shot=async name=>{const file=path.join(directory,name+'.png');await page.screenshot({path:file,animations:'disabled'});screenshots.push(file);};
const check=async(name,operation)=>{await operation();checks.push(name);};
async function openProject(project){
 await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});dialog.showMessageBox=async(_window,options)=>{if(options.message.includes('直接修改会话项目目录')&&options.detail.includes(project))return {response:1};throw Error('Only owned local Mock project authorization is permitted');};},project);
 await page.getByRole('button',{name:'选择工作文件夹',exact:true}).click();
}
async function send(goal){
 await page.locator('#group-input').fill(goal);await page.getByRole('button',{name:'发送需求',exact:true}).click();
 for(let attempt=0;attempt<120;attempt++){
  const detail=await page.evaluate(async goal=>{const sessions=await window.personalAgent.invoke({operation:'sessions'});const session=sessions.find(s=>s.messages.some(m=>m.text===goal));return session?window.personalAgent.invoke({operation:'sessionDetail',sessionId:session.id}):null;},goal);
  if(detail?.runs.length&&detail.runs.every(r=>r.phase==='completed'&&!r.active)){runs.push(...detail.runs);return detail;}
  if(detail?.runs.some(r=>['paused','stopped','failed'].includes(r.phase)))throw Error('Mock Run blocked: '+JSON.stringify(detail.runs));
  await page.waitForTimeout(500);
 }
 throw Error('Formal Mock Controller did not complete within 60 seconds');
}
async function chatChecks(){
 await page.waitForSelector('.chat-feed>.role-codex');
 await page.waitForFunction(()=>document.querySelector('.conversation-header .live-label')?.textContent.includes('Mock 演练完成'));
 assert.equal(await page.locator('.role-board').count(),0);assert.equal(await page.locator('.role-pools,.second-decision').count(),0);
 const result=await page.locator('.chat-feed').evaluate(feed=>{
  const bounds=feed.getBoundingClientRect(),style=getComputedStyle(feed),center=(bounds.left+parseFloat(style.paddingLeft)+bounds.right-parseFloat(style.paddingRight)-feed.offsetWidth+feed.clientWidth)/2;
  return {center,users:[...feed.querySelectorAll(':scope>.role-user')].map(n=>{const r=n.getBoundingClientRect();return (r.left+r.right)/2;}),agents:[...feed.querySelectorAll(':scope>.role-claude,:scope>.role-opencode,:scope>.role-codex')].map(n=>({align:getComputedStyle(n).alignSelf,logo:!!n.querySelector('.agent-logo img'),name:n.querySelector('.message-meta strong').textContent}))};
 });
 assert.ok(result.users.length);for(const center of result.users)assert.ok(Math.abs(result.center-center)<3);
 assert.ok(result.agents.length);for(const agent of result.agents){assert.equal(agent.align,'flex-end');assert.ok(agent.logo);}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.ok(await page.locator('.chat-plan').count());assert.ok(await page.locator('.source-reference').count());
}
try{
 app=await _electron.launch({executablePath,args:[bootstrap],env,timeout:30000});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.waitForSelector('.role-board');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
 await check('初始化布局、旧单决策默认及不兼容角色禁用',async()=>{
  assert.equal(await page.getByLabel('决策者模式').inputValue(),'single');assert.equal(await page.locator('.agent-card').count(),6);
  for(const name of ['决策池 Codex','执行池 Claude Code','执行池 OpenCode'])assert.ok(await page.getByRole('button',{name,exact:true}).isDisabled());
  assert.equal(await page.locator('.composer-left .composer-folder').count(),1);assert.equal(await page.locator('.composer-left select').count(),1);assert.equal(await page.locator('.composer-bottom .send-button').count(),1);
  await shot('01-single-initialization');
 });
 await openProject(projects[0]);
 await check('单决策正式 Mock 旧流程；用户居中、所有 Agent 靠右、长文本 Markdown 保留',async()=>{
  await send('P2A 单决策旧流程本地夹具\n\n'+('保持长文本可读。'.repeat(100))+'\n\n```cpp\nint main() { return 0; }\n```');
  await chatChecks();assert.equal(runs.at(-1).discussion,undefined);assert.equal(runs.at(-1).claudeCalls,0);
  const user=page.locator('.chat-feed>.role-user').first();await user.locator('.message-fold summary').click();await user.locator('pre code').waitFor();assert.equal(await user.locator('pre code').count(),1);await page.locator('.chat-feed').evaluate(n=>n.scrollTop=0);await shot('02-single-chat-markdown');
 });
 await page.getByRole('button',{name:'新建会话',exact:true}).click();await openProject(projects[1]);
 await page.getByLabel('决策者模式').selectOption('dual');
 await check('双 Claude Code 独立模型、主决策者和严格讨论轮数；窄窗口无横向溢出',async()=>{
  await page.getByRole('button',{name:'决策池 Claude Code 设置',exact:true}).click();await page.getByRole('region',{name:'Claude Code 配置'}).getByLabel('Claude Code Model').fill('sonnet');await page.keyboard.press('Escape');
  await page.getByLabel('决策者 B 配置').getByLabel('Claude Code Model').fill('opus');await page.getByLabel('主决策者', {exact:true}).selectOption('b');await page.getByLabel('讨论轮数').selectOption('1');
  assert.equal(await page.getByLabel('讨论轮数').locator('option').count(),2);await shot('03-dual-initialization');
  await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setMinimumSize(640,600);BrowserWindow.getAllWindows()[0].setSize(760,860);});await page.waitForFunction(()=>innerWidth<=760);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot('04-dual-narrow');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
 });
 let dual;
 await check('一轮讨论正式 Mock 闭环；A/B 身份、真实事件顺序与最终 Controller Plan 可见',async()=>{
  dual=await send('P2A 一轮双 Claude Code 本地 Mock，主决策者 B');await chatChecks();const run=dual.runs[0];assert.equal(run.mode,'mock');assert.equal(run.claudeCalls,7);assert.equal(run.discussion.config.primary,'b');assert.equal(run.discussion.participants[0].agent.model,'sonnet');assert.equal(run.discussion.participants[1].agent.model,'opus');assert.notEqual(run.discussion.participants[0].session.sessionId,run.discussion.participants[1].session.sessionId);
  const outputs=await page.locator('.chat-feed>.kind-discussion').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.participantId,stage:n.dataset.decisionStage,name:n.querySelector('.message-meta strong').textContent,role:n.querySelector('.message-meta span').textContent,text:n.textContent})));
  assert.deepEqual(outputs.map(o=>[o.id,o.stage]),[['a','draft'],['b','draft'],['a','discussion'],['b','discussion'],['b','synthesis']]);assert.ok(outputs.filter(o=>o.id==='b').every(o=>o.name==='Claude Code B'&&o.role==='主决策者'));assert.ok(outputs.every(o=>o.text.includes('本地 Mock')));
  await page.locator('[data-decision-stage="discussion"]').first().scrollIntoViewIfNeeded();await shot('05-dual-discussion-chat');await page.locator('[data-decision-stage="synthesis"]').scrollIntoViewIfNeeded();await shot('06-primary-final-plan');
 });
 await page.getByRole('button',{name:'新建会话',exact:true}).click();await openProject(projects[2]);await page.getByLabel('决策者模式').selectOption('dual');await page.getByLabel('讨论轮数').selectOption('0');
 await check('0 轮只有独立初稿及主决策者汇总，不伪造讨论意见',async()=>{
  const detail=await send('P2A 零轮双决策本地 Mock');await chatChecks();assert.equal(detail.runs[0].claudeCalls,5);assert.equal(await page.locator('[data-decision-stage="discussion"]').count(),0);assert.equal(await page.locator('.chat-feed>.kind-discussion').count(),3);await shot('07-zero-round-chat');
 });
 await page.getByRole('button',{name:'新建会话',exact:true}).click();await openProject(projects[3]);await page.getByLabel('决策者模式').selectOption('dual');
 await check('混合后端动态发现、能力拒绝及发现失败不降级',async()=>{
  const second=page.getByLabel('决策者 B 配置');await second.getByLabel('决策 Agent',{exact:true}).selectOption('opencode');await second.getByLabel('OpenCode Provider').selectOption('fixture-provider');assert.ok(await second.getByLabel('OpenCode Model').locator('option[value="no-tools"]').evaluate(n=>n.disabled));await second.getByLabel('OpenCode Model').selectOption('model-one');await page.locator('#group-input').fill('P2A 混合后端本地 Mock');
  fs.writeFileSync(discoveryFile,JSON.stringify({available:false,reason:'Local fixture discovery unavailable',providers:[]}));await second.getByRole('button',{name:'刷新模型',exact:true}).click();await second.getByRole('status').filter({hasText:'unavailable'}).waitFor();assert.ok(await page.getByRole('button',{name:'发送需求',exact:true}).isDisabled());await page.locator('#group-input').press('Enter');assert.equal((await page.evaluate(()=>window.personalAgent.invoke({operation:'sessions'}))).length,3);
  fs.writeFileSync(discoveryFile,JSON.stringify(available));await second.getByRole('button',{name:'刷新模型',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.send-button').disabled);assert.equal(await second.getByLabel('OpenCode Model').inputValue(),'model-one');
 });
 await check('混合后端仅 Mock：品牌、实例与实验性说明；主会话不增加池或 Dashboard',async()=>{
  const detail=await send('P2A 混合后端本地 Mock');await chatChecks();assert.equal(detail.runs[0].mode,'mock');assert.ok(await page.locator('.role-opencode[data-participant-id="b"]').count());assert.ok(await page.locator('.role-claude[data-participant-id="a"]').count());assert.equal(await page.locator('.role-board').count(),0);await page.locator('.role-opencode[data-participant-id="b"]').first().scrollIntoViewIfNeeded();await shot('08-mixed-mock-chat');
 });
 await check('历史双决策 Run 可回放；原证据及审查、交付入口保留',async()=>{
  await page.locator('.session-row>button:first-child').filter({hasText:'P2A 一轮双 Claude Code'}).click();await page.waitForSelector('[data-participant-id="b"]');const restored=await page.evaluate(sessionId=>window.personalAgent.invoke({operation:'sessionDetail',sessionId}),dual.session.id);assert.deepEqual(restored.runs[0].discussion.config,dual.runs[0].discussion.config);
  assert.ok(await page.locator('.kind-review').count());await page.getByRole('button',{name:'项目详情',exact:true}).click();assert.ok(await page.getByRole('button',{name:'查看直接开发结果',exact:true}).count());assert.deepEqual(errors,[]);
 });
 for(const project of projects)assert.equal(fs.readFileSync(path.join(project,'user.txt'),'utf8'),'Keep user file\n');
}catch(error){errors.push(error.stack??error.message);process.exitCode=1;if(page)await shot('failure').catch(()=>{});}
finally{
 if(app){const pid=app.process().pid;if(pid)spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await app.close().catch(()=>{});}
 const report={directory,root,checks,screenshots,errors,runs,paidModelCalls:0,verification:'Actual Electron + formal Controller, deterministic local Mock adapters only',passed:errors.length===0};fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({directory,checks,errors,passed:report.passed},null,2));
}
