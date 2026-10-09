// Script-only visual check of the Codex-style layout: launches the real Electron window against a copy of the local registry and saves screenshots.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron} from '../snake-validation/node_modules/playwright-core/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'desktop/validation-codex-layout'),data=path.join(dir,'data');
fs.mkdirSync(data,{recursive:true});
for(const file of ['profiles.json','sessions.json'])if(fs.existsSync(path.join(root,'.desktop-data',file)))fs.copyFileSync(path.join(root,'.desktop-data',file),path.join(data,file));
const env={...process.env,PERSONAL_AGENT_DESKTOP_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:path.join(root,'desktop/node_modules/electron/dist/electron.exe'),args:[path.join(root,'desktop')],env,timeout:30000});
const errors=[],report={screenshots:[],errors,measurements:{}};
try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const size=(width,height)=>app.evaluate(({BrowserWindow},s)=>{const win=BrowserWindow.getAllWindows()[0];win.setContentSize(s.width,s.height);win.webContents.setZoomFactor(1);},{width,height});
 const shot=async name=>{await page.waitForTimeout(350);const file=path.join(dir,name+'.png'),bytes=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));fs.writeFileSync(file,Buffer.from(bytes,'base64'));report.screenshots.push(file);};
 await page.waitForSelector('.sidebar-sessions');await size(1440,900);
 await page.waitForSelector('.session-row');
 const withRuns=(await page.evaluate(()=>window.personalAgent.invoke({operation:'sessions'}))).find(s=>s.runs.length);await page.locator('.session-row>button:first-child').filter({hasText:withRuns.title.slice(0,12)}).first().click();await page.waitForSelector('.group-message');await shot('01-chat-1440');
 report.measurements=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{w:Math.round(r.width),h:Math.round(r.height)}:null;};return {rail:box('.rail'),sidebar:box('.sidebar'),header:box('.conversation-header'),composer:box('.conversation-composer'),send:box('.send-button'),feed:box('.chat-feed'),topbar:box('.topbar'),toolbarRow:box('.conversation-column>.conversation-toolbar'),scrollX:document.documentElement.scrollWidth>innerWidth,projects:document.querySelectorAll('.project-group').length,sessions:document.querySelectorAll('.session-row').length};});
 await page.getByRole('button',{name:'更多操作'}).click();await shot('02-menu');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'项目详情',exact:true}).click();await page.waitForSelector('.project-context');await shot('03-details-panel');
 await page.locator('.project-row').first().hover();await shot('04-project-hover');
 await size(1024,680);await shot('05-chat-1024-panel');await page.getByRole('button',{name:'关闭项目详情'}).click();await shot('06-chat-1024');
 await size(1440,900);await page.getByRole('button',{name:'新建会话',exact:true}).click();await page.waitForSelector('.conversation-empty');await shot('07-new-session');
 await page.getByRole('button',{name:'搜索会话'}).click();await page.getByLabel('搜索历史会话').fill('fish');await shot('08-search');await page.getByRole('button',{name:'搜索会话'}).click();
 const count=async()=>(await page.evaluate(()=>window.personalAgent.invoke({operation:'sessions'}))).length,before=await count(),rows=await page.locator('.session-row').count();await page.locator('.project-row').first().hover();await page.locator('.project-new').first().click();await page.waitForSelector('.conversation-empty');await page.waitForSelector('.bound-project');await page.waitForTimeout(2500);report.draftInProject={sessionsBefore:before,sessionsAfterDraft:await count(),rowsBefore:rows,rowsAfterDraft:await page.locator('.session-row').count(),sendEnabledEmpty:await page.locator('.send-button').isEnabled()};await shot('12-draft-in-project');
 for(const [name,file] of [['设置','09-settings'],['工作台','10-dashboard'],['运行记录','11-history']]){await page.getByRole('button',{name,exact:true}).click();await page.waitForSelector('.page-heading');await shot(file);}
}catch(e){errors.push(String(e));const bytes=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));fs.writeFileSync(path.join(dir,'failure.png'),Buffer.from(bytes,'base64'));}finally{await app.close();}
fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,1));
