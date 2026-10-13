import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'C:/Users/WYL20/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve('out/renderer');
const server=http.createServer(async(request,response)=>{try{const file=path.resolve(root,'.'+(request.url==='/'?'/index.html':request.url));if(!file.startsWith(root+path.sep))throw Error('Invalid path');response.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');response.end(await fs.readFile(file));}catch{response.statusCode=404;response.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.stack);});
 await page.addInitScript(()=>{
  const session={id:'11111111-1111-4111-8111-111111111111',title:'测试会话',projectPath:'D:/fixture/project',projectName:'测试项目',legacy:true,runs:[],messages:[],status:'idle',lastMessage:'测试',updatedAt:'2026-10-13T00:00:00Z',createdAt:'2026-10-13T00:00:00Z',settings:{mode:'mock',projectMode:'direct'},budget:{claudeUsed:0,loopsUsed:0,claudeRemaining:5,loopsRemaining:8}};
  let sessions=[session],projects=[{path:session.projectPath,name:session.projectName}];window.requests=[];
  window.personalAgent={invoke:async request=>{
   window.requests.push(request);
   if(request.operation==='overview')return {profiles:[],runs:[],warnings:[],paths:{instanceId:'test'},recentProjects:projects,reducedMotion:true};
   if(request.operation==='sessions')return sessions;
   if(request.operation==='sessionDetail')return {session:sessions[0],runs:[],discussionMessages:[],discussionContexts:[]};
   if(request.operation==='renameSession')session.title=request.title;
   if(request.operation==='renameProject'){session.projectName=request.title;projects[0].name=request.title;}
   if(request.operation==='deleteSession'){sessions=[];return {removedSessionIds:[session.id]};}
   if(request.operation==='deleteProject'){sessions=[];projects=[];return {removedSessionIds:[session.id]};}
   if(request.operation==='nativeModels')return {models:[]};
   if(request.operation==='executionModels'||request.operation==='decisionModels')return {available:false,providers:[],reason:'Isolated sidebar fixture'};
   return {};
  }};
 });
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.locator('#session-sidebar').getByRole('button',{name:'测试项目',exact:true}).click({button:'right'});
 assert.equal(await page.getByRole('menuitem',{name:'新建并行会话',exact:true}).count(),1);
 await page.getByRole('menuitem',{name:'重命名',exact:true}).click();
 await page.getByRole('textbox',{name:'新名称'}).fill('项目别名');await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.locator('#session-sidebar').getByRole('button',{name:'项目别名',exact:true}).waitFor();
 await page.locator('#session-sidebar').getByRole('button',{name:'项目别名',exact:true}).press('Shift+F10');
 await page.getByRole('menuitem',{name:'复制项目路径',exact:true}).click();
 assert.ok(await page.evaluate(()=>window.requests.some(r=>r.operation==='copyProjectPath'&&r.projectPath==='D:/fixture/project')));
 await page.getByRole('button',{name:'会话操作 测试会话',exact:true}).click();
 await page.getByRole('menuitem',{name:'重命名',exact:true}).click();await page.getByRole('textbox',{name:'新名称'}).fill('会话别名');await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.getByRole('button',{name:'会话别名',exact:true}).waitFor();
 await page.getByRole('button',{name:'会话别名',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'打开项目文件夹',exact:true}).click();
 assert.ok(await page.evaluate(()=>window.requests.some(r=>r.operation==='openProjectFolder'&&r.projectPath==='D:/fixture/project')));
 await page.getByRole('button',{name:'会话别名',exact:true}).click({button:'right'});await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape');assert.equal(await page.getByRole('menu').count(),0);
 await page.getByRole('button',{name:'会话别名',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'删除会话',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.requests.some(r=>r.operation==='deleteSession')),false);
 await page.getByRole('button',{name:'会话别名',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'删除会话',exact:true}).click();await page.getByRole('button',{name:'删除',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.session-title'));
 await page.locator('#session-sidebar').getByRole('button',{name:'项目别名',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'删除项目',exact:true}).click();await page.getByRole('button',{name:'删除',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.project-toggle'));assert.deepEqual(errors,[]);
 console.log('PASS: isolated headless sidebar right-click, keyboard menu, rename, folder/path requests, delete cancellation and confirmation. Native Explorer/clipboard not exercised.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
