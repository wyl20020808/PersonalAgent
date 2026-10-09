import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Self-validation only: owned feature build, isolated data/projects, deterministic discovery.
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
if(!root.replaceAll('\\','/').endsWith('/tasks/multi-agent-role-board-p1'))throw Error('Use the owned phase-one Worktree');
const directory=`D:/PersonalAgent-data/multi-agent-role-board-p1/electron-${randomUUID().slice(0,8)}`;
const project=path.join(directory,'project');fs.mkdirSync(project,{recursive:true});
fs.writeFileSync(path.join(project,'user.txt'),'Preserve user content\n');
const {_electron}=await import(pathToFileURL(process.env.PERSONAL_AGENT_PLAYWRIGHT??'D:/PersonalAgent/snake-validation/node_modules/playwright-core/index.mjs').href);
const executablePath=process.env.PERSONAL_AGENT_ELECTRON??path.join(root,'desktop/node_modules/electron/dist/electron.exe');
if(!fs.existsSync(executablePath))throw Error('Set PERSONAL_AGENT_ELECTRON to the installed Electron executable');
const env={...process.env,PERSONALAGENT_INSTANCE:'main',PERSONAL_AGENT_DESKTOP_DATA:path.join(directory,'data'),TEMP:path.join(directory,'tmp'),TMP:path.join(directory,'tmp')};delete env.ELECTRON_RUN_AS_NODE;
fs.mkdirSync(env.TEMP,{recursive:true});
const discoveryFile=path.join(directory,'discovery.json'),bootstrap=path.join(directory,'preview.mjs');
const available={available:true,reason:'',providers:[{id:'fixture-a',name:'Dynamic Provider A',models:[{id:'model-a',name:'Dynamic Model A',capabilities:{tools:true,structuredOutput:true}},{id:'no-tools',name:'Unsupported fixture',capabilities:{tools:false,structuredOutput:true}}]},{id:'fixture-b',name:'Dynamic Provider B',models:[{id:'model-b',name:'Dynamic Model B',capabilities:{tools:true,structuredOutput:true}}]}]};
fs.writeFileSync(discoveryFile,JSON.stringify(available));
fs.writeFileSync(bootstrap,`import fs from 'node:fs';\nimport {DesktopService} from ${JSON.stringify(pathToFileURL(path.join(root,'desktop/out/service.js')).href)};\nconst dispatch=DesktopService.prototype.dispatch;DesktopService.prototype.dispatch=function(r){if(r.operation==='createSession'){if(r.mode!=='real')throw Error('New-session UI must default Real');r={...r,mode:'mock',selectedTests:[]};}return dispatch.call(this,r);};\nDesktopService.prototype.decisionModels=async()=>JSON.parse(fs.readFileSync(${JSON.stringify(discoveryFile)},'utf8'));\nconst launch=DesktopService.prototype.launch;DesktopService.prototype.launch=function(store,...args){if(store.load().config.mode!=='mock')throw Error('Acceptance refuses paid agents');return launch.call(this,store,...args);};\nawait import(${JSON.stringify(pathToFileURL(path.join(root,'desktop/out/main.js')).href)});\n`);
let app,page;const checks=[],screenshots=[],errors=[];
const shot=async name=>{const file=path.join(directory,name+'.png');await page.screenshot({path:file,animations:'disabled'});screenshots.push(file);};
const check=async(name,action)=>{await action();checks.push(name);};
const complete=async id=>{
 await page.waitForFunction(async id=>{const detail=await window.personalAgent.invoke({operation:'sessionDetail',sessionId:id});return detail.runs.length&&detail.runs.every(run=>run.phase==='completed'&&!run.active);},id,{timeout:60000});
 return page.evaluate(id=>window.personalAgent.invoke({operation:'sessionDetail',sessionId:id}),id);
};
try{
 app=await _electron.launch({executablePath,args:[bootstrap],env,timeout:30000});
 page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('.role-board');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
 await app.evaluate(({dialog},project)=>{let approved=false;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});dialog.showMessageBox=async(_window,options)=>{if(options.message.includes('直接修改会话项目目录')&&options.detail.includes(project))return {response:1};if(options.message==='批准具体交付内容（不会立即应用）'&&options.detail.includes(project)){approved=true;return {response:1};}if(options.message==='重新验收并确认已有成果（不重复写入）'&&approved)return {response:1};throw Error('Only the owned Mock project and its exact delivery are authorized');};},project);
 await check('默认 Real；初始化文字精简；未支持角色禁用且无多决策者入口',async()=>{
  assert.equal(await page.getByLabel('新会话运行模式').count(),0);assert.equal(await page.locator('.session-initialization>h3,.session-initialization>p,.empty-suggestions').count(),0);
  assert.equal(await page.getByRole('button',{name:'决策池 Claude Code',exact:true}).getAttribute('aria-pressed'),'true');
  for(const name of ['决策池 Codex','执行池 Claude Code','执行池 OpenCode'])assert.equal(await page.getByRole('button',{name,exact:true}).isDisabled(),true);
  assert.equal(await page.locator('.role-board .agent-card').count(),6);assert.equal(await page.locator('.add-decision,.pool-footnote').count(),0);
  assert.equal(await page.locator('.conversation-composer select').count(),0);
  await page.waitForFunction(()=>[...document.querySelectorAll('.agent-logo img')].every(image=>image.complete&&image.naturalWidth>0));
  const pools=await page.locator('.agent-pool').evaluateAll(nodes=>nodes.map(node=>({x:node.getBoundingClientRect().x,y:node.getBoundingClientRect().y})));
  assert.ok(pools[1].x>pools[0].x);assert.equal(pools[0].y,pools[1].y);await shot('01-initialization-wide');
 });

 await page.getByRole('button',{name:'选择工作文件夹',exact:true}).click();
 await check('卡片设置与动态模型能力选择',async()=>{
  await page.getByRole('button',{name:'决策池 Claude Code 设置',exact:true}).click();assert.match(await page.getByRole('region',{name:'Claude Code 配置'}).innerText(),/没有独立模型选择接口/);
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('region',{name:'Claude Code 配置'}).count(),0);
  await page.getByRole('button',{name:'执行池 Codex 设置',exact:true}).click();assert.match(await page.getByRole('region',{name:'Codex 配置'}).innerText(),/SDK/);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'决策池 OpenCode',exact:true}).click();
  await page.getByLabel('OpenCode Provider').selectOption('fixture-a');assert.equal(await page.getByLabel('OpenCode Model').locator('option[value="no-tools"]').evaluate(option=>option.disabled),true);
  await page.getByLabel('OpenCode Provider').selectOption('fixture-b');await page.getByLabel('OpenCode Model').selectOption('model-b');
  await page.locator('#group-input').fill('检查动态模型与卡片配置');assert.equal(await page.getByRole('button',{name:'发送需求',exact:true}).isEnabled(),true);
  assert.match(await page.locator('.agent-pool.decision .selected').innerText(),/model-b/);await shot('02-opencode-settings');
 });
 await check('模型发现失败不回退；按钮与 Enter 均不发送；刷新恢复原选择',async()=>{
  fs.writeFileSync(discoveryFile,JSON.stringify({available:false,reason:'Fixture discovery unavailable',providers:[]}));
  await page.getByRole('button',{name:'刷新模型',exact:true}).click();await page.getByRole('status').filter({hasText:'Fixture discovery unavailable'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'发送需求',exact:true}).isDisabled(),true);
  await page.locator('#group-input').press('Enter');assert.deepEqual(await page.evaluate(()=>window.personalAgent.invoke({operation:'sessions'})),[]);
  assert.equal(await page.getByRole('button',{name:'决策池 OpenCode',exact:true}).getAttribute('aria-pressed'),'true');await shot('03-opencode-unavailable');
  fs.writeFileSync(discoveryFile,JSON.stringify(available));await page.getByRole('button',{name:'刷新模型',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.send-button').disabled);
  assert.equal(await page.getByLabel('OpenCode Model').inputValue(),'model-b');await page.keyboard.press('Escape');
 });
 await check('窄窗口双池上下排列且页面无横向溢出',async()=>{
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setMinimumSize(640,600));await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(760,860));
  await page.waitForFunction(()=>innerWidth<=760);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const pools=await page.locator('.agent-pool').evaluateAll(nodes=>nodes.map(node=>({x:node.getBoundingClientRect().x,y:node.getBoundingClientRect().y})));
  assert.equal(pools[0].x,pools[1].x);assert.ok(pools[1].y>pools[0].y);await shot('04-initialization-narrow');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
 });
 let claudeSession,opencodeSession;
 await check('旧 Claude Code + Codex 组合经正式 Controller 完成 Mock Run',async()=>{
  await page.getByRole('button',{name:'决策池 Claude Code',exact:true}).click();
  await page.locator('#group-input').fill('开发本地 Mock 标记文件；用户长文本，保持可读。\n\n'+('需要保留 Markdown 与正常换行。'.repeat(60))+'\n\n```cpp\nint main() { return 0; }\n```');
  await page.getByRole('button',{name:'发送需求',exact:true}).click();
  await page.waitForFunction(async()=>(await window.personalAgent.invoke({operation:'sessions'})).length===1);
  claudeSession=(await page.evaluate(()=>window.personalAgent.invoke({operation:'sessions'})))[0];
  const detail=await complete(claudeSession.id);assert.equal(detail.runs[0].mode,'mock');assert.equal(detail.runs[0].decisionAgent.backend,'claude-code');assert.equal(detail.runs[0].claudeCalls,0);
  await page.waitForFunction(()=>document.querySelector('.conversation-header .live-label')?.textContent.includes('Mock 演练完成'));
  await page.waitForSelector('.role-claude');await page.waitForSelector('.role-codex');assert.equal(await page.locator('.role-board').count(),0);
  assert.equal(fs.readFileSync(path.join(project,'user.txt'),'utf8'),'Preserve user content\n');
 });
 await check('用户居中；决策者靠左、执行者靠右；角色、长文本、Markdown、Plan/Review 与证据保留',async()=>{
  const result=await page.locator('.chat-feed').evaluate(feed=>{
   const style=getComputedStyle(feed),bounds=feed.getBoundingClientRect(),center=(bounds.left+parseFloat(style.paddingLeft)+bounds.right-parseFloat(style.paddingRight)-feed.offsetWidth+feed.clientWidth)/2;
   const users=[...feed.querySelectorAll(':scope>.role-user')].map(node=>{const r=node.getBoundingClientRect();return {center:(r.left+r.right)/2,align:getComputedStyle(node.querySelector('.message-content')).textAlign};});
   const agents=[...feed.querySelectorAll(':scope>.role-claude,:scope>.role-codex,:scope>.role-opencode')].map(node=>({executor:node.classList.contains('role-codex'),align:getComputedStyle(node).alignSelf,direction:getComputedStyle(node).flexDirection,logo:!!node.querySelector('.agent-logo img'),identity:node.querySelector('.message-meta').textContent}));
   return {center,users,agents};
  });
  assert.ok(result.users.length);for(const user of result.users){assert.ok(Math.abs(user.center-result.center)<3);assert.equal(user.align,'left');}
  assert.ok(result.agents.length);for(const agent of result.agents){assert.equal(agent.align,agent.executor?'flex-end':'flex-start');assert.equal(agent.direction,agent.executor?'row-reverse':'row');assert.equal(agent.logo,true);assert.match(agent.identity,/Claude Code|Codex/);}
  const user=page.locator('.chat-feed>.role-user').first();await user.locator('.message-fold summary').click();await user.locator('pre code').waitFor();assert.equal(await user.locator('pre code').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('.chat-feed').evaluate(feed=>feed.scrollTop=0);await shot('05-chat-centered-user');
  await page.locator('.role-user .message-fold summary').first().click();await page.locator('.chat-feed').evaluate(feed=>feed.scrollTop=feed.scrollHeight);await shot('06-chat-agent-roles');
  assert.ok(await page.locator('.chat-plan').count());assert.ok(await page.locator('.kind-review').count());assert.ok(await page.locator('.source-reference').count());
 });
 await check('Preview / Approve / Apply 页面和审批窗口保留',async()=>{
  await page.getByRole('button',{name:'项目详情',exact:true}).click();await page.getByRole('button',{name:'查看直接开发结果',exact:true}).click();
  await page.getByRole('button',{name:'生成交付预览',exact:true}).click();await page.getByRole('button',{name:'生成预览',exact:true}).click();
  await page.waitForSelector('[role="dialog"]',{state:'hidden'});await page.getByRole('button',{name:'批准具体成果',exact:true}).click();
  assert.match(await page.getByRole('dialog').innerText(),/摘要|Digest|digest/);assert.equal(await page.getByRole('button',{name:'明确批准',exact:true}).isDisabled(),true);await shot('07-approval-unchanged');
  const marker=path.join(project,'hello.txt'),modified=fs.statSync(marker).mtimeMs;
  await page.locator('#decision').fill('已检查当前隔离验收夹具的文件 Diff，批准这个 Mock 成果；不批准其他项目。');await page.locator('#approval-digest').fill(await page.locator('.digest-reference').innerText());await page.getByRole('button',{name:'明确批准',exact:true}).click();
  await page.waitForSelector('[role="dialog"]',{state:'hidden'});await page.getByRole('button',{name:'确认已批准成果',exact:true}).click();assert.match(await page.getByRole('dialog').innerText(),/不重复写入/);await shot('07b-apply-confirmation');
  await page.getByRole('button',{name:'重新验收并确认',exact:true}).click();await page.waitForSelector('[role="dialog"]',{state:'hidden'});
  const detail=await page.evaluate(sessionId=>window.personalAgent.invoke({operation:'sessionDetail',sessionId}),claudeSession.id),run=detail.runs[0];
  const deliveries=await page.evaluate(run=>window.personalAgent.invoke({operation:'deliveries',profileId:run.profileId,runId:run.id}),run);assert.equal(deliveries.at(-1).phase,'applied');assert.equal(fs.statSync(marker).mtimeMs,modified);
 });
 await check('OpenCode 选择保存到 Run，正式 Mock 不伪装远端验证',async()=>{
  await page.getByRole('button',{name:'新建会话',exact:true}).click();assert.equal(await page.getByLabel('新会话运行模式').count(),0);assert.equal(await page.locator('.session-initialization>h3,.session-initialization>p,.empty-suggestions').count(),0);
  await page.getByRole('button',{name:'选择工作文件夹',exact:true}).click();
  await page.getByRole('button',{name:'决策池 OpenCode',exact:true}).click();await page.getByLabel('OpenCode Provider').selectOption('fixture-b');await page.getByLabel('OpenCode Model').selectOption('model-b');
  await page.locator('#group-input').fill('OpenCode 决策身份的 Mock 检查');await page.getByRole('button',{name:'发送需求',exact:true}).click();
  await page.waitForFunction(async()=>(await window.personalAgent.invoke({operation:'sessions'})).some(session=>session.settings.decisionAgent?.backend==='opencode'));
  opencodeSession=(await page.evaluate(()=>window.personalAgent.invoke({operation:'sessions'}))).find(session=>session.settings.decisionAgent?.backend==='opencode');
  const detail=await complete(opencodeSession.id);assert.equal(detail.runs[0].decisionAgent.backend,'opencode');assert.equal(detail.runs[0].mode,'mock');assert.equal(detail.runs[0].claudeCalls,0);
  await page.waitForFunction(()=>document.querySelector('.conversation-header .live-label')?.textContent.includes('Mock 演练完成'));await page.waitForSelector('.role-opencode');
  assert.equal(await page.locator('.role-claude').count(),0);assert.equal(await page.locator('.role-board').count(),0);
  assert.equal(await page.locator('.chat-feed>.role-opencode').first().evaluate(node=>getComputedStyle(node).alignSelf),'flex-start');await page.locator('.role-opencode.kind-review').last().scrollIntoViewIfNeeded();await shot('08-opencode-chat');
 });
 await check('历史会话、运行详情与原消息筛选保留',async()=>{
  await page.locator('.session-row>button:first-child').filter({hasText:'开发本地 Mock 标记文件'}).click();await page.waitForSelector('.role-claude');
  assert.equal(await page.locator('.role-opencode').count(),0);assert.equal(await page.locator('.role-board').count(),0);
  await page.getByRole('button',{name:'更多操作',exact:true}).click();await page.getByLabel('筛选群聊角色').selectOption('codex');
  assert.equal(await page.locator('.chat-feed>.group-message:not(.role-codex)').count(),0);await page.getByLabel('筛选群聊角色').selectOption('all');
  await page.getByRole('button',{name:'运行详情',exact:true}).last().click();assert.ok(await page.locator('.run-hero').count());
  assert.deepEqual(errors,[]);
 });
}catch(error){errors.push(error.stack??error.message);process.exitCode=1;if(page)await shot('failure').catch(()=>{});}
finally{
 if(app){const pid=app.process().pid;if(pid)spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await app.close().catch(()=>{});}
 const report={directory,root,checks,screenshots,errors,paidModelCalls:0,discovery:'Injected deterministic fixture; no remote prompt',passed:errors.length===0};
 fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
