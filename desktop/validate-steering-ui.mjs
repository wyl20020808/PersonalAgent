import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const directory=path.dirname(fileURLToPath(import.meta.url));
const output=path.resolve(directory,'../.validation/steering-ui');fs.mkdirSync(output,{recursive:true});
const source=String.raw`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import GroupWorkspace from '../../desktop/src/GroupWorkspace';
import '../../desktop/src/style.css';
import '../../desktop/src/codex.css';
import '../../desktop/src/chat-messages.css';
const id='11111111-1111-4111-8111-111111111111',time=new Date().toISOString();
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=';
const run:any={id,profileId:id,goal:'优化运行中消息处理',source:'D:/PreviewProject',workspace:'D:/PreviewProject',phase:'executing',reason:'',updatedAt:time,mode:'real',tasks:[{id:'chat',instruction:'当前小任务继续执行',acceptance:['独立检查']}],taskIndex:0,completedTaskIds:[],loops:1,claudeCalls:1,totalReworks:0,config:{maxClaudeCalls:5},evidence:null,failure:null,active:true,decisionAgent:{backend:'claude-code'},executionAgent:{backend:'codex'}};
let session:any={id,title:'消息队列与引导',projectPath:run.source,projectName:'PersonalAgent',createdAt:time,updatedAt:time,settings:{mode:'real',projectMode:'direct',decisionAgent:{backend:'claude-code'},executionAgent:{backend:'codex'},maxClaudeCalls:5},runs:[{id,profileId:id}],messages:[{id:'seed',time,text:'继续开发当前任务。',status:'executed'},{id:'image',time,text:'保留门动画，参考这张图片调整入口。',status:'pending',attachments:[{name:'入口参考.png',mimeType:'image/png',size:68,sha256:'a'.repeat(64)}]},{id:'file',time,text:'先修复路径检查，再处理新的开发要求。',status:'pending',attachments:[{name:'需求说明.md',mimeType:'text/plain',size:42,sha256:'b'.repeat(64)}]},{id:'third',time,text:'这个请求先排队，稍后再做。',status:'pending'}],budget:{claudeUsed:1,loopsUsed:1,claudeRemaining:4,loopsRemaining:0},status:'executing'};
const messages=[{id:'execution',role:'codex',participantRole:'执行者',title:'正在执行',text:'当前调用继续工作。引导消息将在本次小任务验收后交给决策者。',time,kind:'message',status:'running',runId:id,taskId:'chat',loop:1,source:'isolated UI fixture'}];
(window as any).__calls=[];
window.personalAgent={invoke:async(r:any)=>{
 (window as any).__calls.push(r);
 if(r.operation==='sessionDetail')return {session,runs:[run]};
 if(r.operation==='thread')return {messages,cursor:'fixture',hasMore:false,reset:false,total:1,lastActivity:time,capabilities:{claudeStreaming:true,codexPublicEvents:true,imagesToClaude:false}};
 if(r.operation==='pictures')return [];
 if(r.operation==='listProjectFiles')return {entries:[],truncated:false};
 if(r.operation==='sessionAttachment')return {name:'入口参考.png',dataUrl:'data:image/png;base64,'+png};
 if(['steerSessionMessage','cancelSessionMessage','editSessionMessage'].includes(r.operation)){session={...session,messages:session.messages.map((m:any)=>m.id!==r.messageId?m:{...m,status:r.operation==='steerSessionMessage'?'steering':r.operation==='cancelSessionMessage'?'cancelled':'pending',...(r.text?{text:r.text}:{})})};return session;}
 if(r.operation==='sendSession'){session={...session,messages:[...session.messages,{id:r.messageId,text:r.text,time,status:'pending',attachments:r.attachments}]};return session;}
 throw Error('Unexpected fixture request: '+r.operation);
}} as any;
function Preview(){const [current,setCurrent]=useState(session);return <div style={{height:'100vh',background:'#f5f7f9'}}><GroupWorkspace run={run} conversation={current} onConversationChange={setCurrent} onGoal={()=>{}} onDetails={()=>{}} onDelivery={()=>{}}/><span style={{position:'fixed',top:6,right:12,fontSize:10,color:'#999',zIndex:99}}>隔离 UI 验证 · 示例数据 · 未调用 Agent</span></div>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
`;
fs.writeFileSync(path.join(output,'preview.tsx'),source);
await build({entryPoints:[path.join(output,'preview.tsx')],bundle:true,nodePaths:[path.join(directory,'node_modules')],format:'esm',outfile:path.join(output,'preview.js'),loader:{'.svg':'dataurl'},define:{'process.env.NODE_ENV':'"production"'}});
fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><link rel="stylesheet" href="preview.css"><div id="root"></div><script type="module" src="preview.js"></script></html>');
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/WYL20/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const server=http.createServer((request,response)=>{const file=path.join(output,request.url==='/'?'index.html':request.url.slice(1));if(!file.startsWith(output+path.sep)){response.writeHead(403).end();return;}try{response.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');response.end(fs.readFileSync(file));}catch{response.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('.queued-message').nth(2).waitFor();await page.locator('.queue-thumbnail img').waitFor();
 assert.equal(await page.locator('.queued-message').count(),3);
 const boxes=await page.locator('.queued-message').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().top));assert.ok(boxes[0]<boxes[1]&&boxes[1]<boxes[2]);
 const rowHeights=await page.locator('.queued-message').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().height));assert.ok(rowHeights.every(height=>height<=30),JSON.stringify(rowHeights));
 await page.screenshot({path:path.join(output,'queue-desktop.png')});
 await page.locator('.queued-messages').screenshot({path:path.join(output,'queue-rows.png')});
 await page.locator('[data-queued-id="image"] .queue-thumbnail').click();await page.locator('.attachment-preview-dialog[open] img').waitFor();await page.getByLabel('关闭图片预览').click();
 await page.locator('[data-queued-id="image"] .queue-steer').click();await page.locator('[data-queued-id="image"].is-steering').waitFor();assert.equal(await page.locator('[data-queued-id="image"] .queue-steer').isDisabled(),true);
 await page.locator('[data-queued-id="file"] .queue-icon').click();await page.locator('[data-queued-id="file"]').waitFor({state:'detached'});
 await page.locator('[data-queued-id="third"] .queue-menu summary').click();await page.locator('[data-queued-id="third"] .queue-menu button').click();await page.locator('#group-input').fill('修改后仍保留在队列');await page.locator('.send-button').click();await page.getByText('修改后仍保留在队列',{exact:true}).first().waitFor();
 await page.locator('#group-input').fill('新的消息默认排队');await page.locator('#group-input').press('Enter');await page.getByText('新的消息默认排队',{exact:true}).first().waitFor();
 const calls=await page.evaluate(()=>window.__calls);assert.ok(calls.some(call=>call.operation==='steerSessionMessage'));assert.ok(calls.some(call=>call.operation==='cancelSessionMessage'));assert.ok(calls.some(call=>call.operation==='editSessionMessage'));assert.ok(calls.some(call=>call.operation==='sendSession'));assert.ok(!calls.some(call=>call.operation==='stop'));
 await page.setViewportSize({width:680,height:760});await page.screenshot({path:path.join(output,'queue-compact.png')});
 assert.ok(await page.locator('.send-button').evaluate(element=>element.getBoundingClientRect().bottom<=innerHeight));assert.ok(await page.locator('.queued-messages').evaluate(element=>element.scrollWidth<=element.clientWidth+1));
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({stacked:3,rowHeights,imagePreview:true,guide:true,delete:true,edit:true,defaultQueue:true,noStop:true,compactViewport:true,errors},null,2));console.log('Headless isolated queue UI checks passed: stacking, pixels, guide, delete, edit, default queue, compact viewport.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
