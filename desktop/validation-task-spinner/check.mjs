import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/WYL20/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(directory,'../out/renderer');
const server=http.createServer((request,response)=>{
 const file=path.join(root,request.url==='/'?'index.html':request.url.slice(1));
 if(!fs.existsSync(file)){response.writeHead(404);response.end();return;}
 response.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript');
 response.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  window.fixtureStatus='executing';
  window.fixtureReduced=false;
  window.personalAgent={invoke:async request=>{
   if(request.operation==='overview')return {profiles:[],runs:[],warnings:[],paths:{controller:'D:/Preview',data:'D:/PreviewData',node:'node'},reducedMotion:window.fixtureReduced,recentProjects:[]};
   if(request.operation==='sessions')return [{id:'spinner-preview',title:'运行中的任务',projectPath:'D:/Preview',projectName:'PersonalAgent',status:window.fixtureStatus,runs:[],messages:[],legacy:true,lastMessage:'',updatedAt:'2026-10-11T00:00:00Z'}];
   if(['decisionModels','executionModels'].includes(request.operation))return {available:false,providers:[]};
   throw Error('Unexpected preview operation: '+request.operation);
  }};
 });
 await page.goto('http://127.0.0.1:'+server.address().port);
 const row=page.locator('.session-row').filter({hasText:'运行中的任务'}),spinner=row.locator('.session-spinner');
 await spinner.waitFor();
 const style=await spinner.evaluate(element=>{const s=getComputedStyle(element);return {width:s.width,height:s.height,animation:s.animationName,background:s.backgroundColor};});
 assert.deepEqual(style,{width:'14px',height:'14px',animation:'spin',background:'rgba(0, 0, 0, 0)'});
 const before=await spinner.evaluate(element=>getComputedStyle(element).transform);
 await page.waitForTimeout(230);
 assert.notEqual(await spinner.evaluate(element=>getComputedStyle(element).transform),before,'Spinner must rotate');
 await page.locator('.sidebar').screenshot({path:path.join(directory,'sidebar.png')});
 for(const status of ['planning','execute','applying','verify','review']){
  await page.evaluate(value=>{window.fixtureStatus=value;},status);
  await spinner.waitFor();
  await page.waitForFunction(value=>document.querySelector('.session-row>button').title.includes(value),{planning:'规划中',execute:'准备执行',applying:'应用提案',verify:'独立验证',review:'审查中'}[status]);
 }
 await page.evaluate(()=>{window.fixtureReduced=true;});
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.session-spinner')).animationName==='none');
 await page.evaluate(()=>{window.fixtureReduced=false;});
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await spinner.evaluate(element=>getComputedStyle(element).animationName),'none');
 await page.emulateMedia({reducedMotion:'no-preference'});
 for(const status of ['paused','failed','stopped']){
  await page.evaluate(value=>{window.fixtureStatus=value;},status);
  await row.locator('.session-state.warning').waitFor();
  assert.equal(await spinner.count(),0);
 }
 for(const status of ['completed','preview','approved','applied']){
  await page.evaluate(value=>{window.fixtureStatus=value;},status);
  await page.waitForFunction(()=>document.querySelector('.session-row .session-state')===null);
  assert.equal(await spinner.count(),0);
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify({passed:true,headless:true,activeStates:6,attentionStates:3,inactiveStates:4,rotation:true,systemReducedMotion:true,appReducedMotion:true,pageErrors:errors},null,2));
 console.log('PASS: sidebar rotation, state transitions, reduced motion, no page errors');
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
