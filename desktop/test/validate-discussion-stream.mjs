import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import {projectMessages,messagePage} from '../out/thread.js';

const desktop=fileURLToPath(new URL('..',import.meta.url)),out=path.join(desktop,'.validation/discussion-stream');fs.mkdirSync(out,{recursive:true});
const run={id:'11111111-1111-4111-8111-111111111111',profileId:'22222222-2222-4222-8222-222222222222',goal:'已完成的项目任务',phase:'completed',active:false,source:'D:/fixture',workspace:'D:/fixture',tasks:[],taskIndex:0,loops:1,claudeCalls:1,reworks:0,completedTaskIds:[],evidence:null,failure:null,updatedAt:'2026-10-12T10:00:00Z',mode:'real',decisionAgent:{backend:'codex'},budget:{},reason:''};
const state={...run,config:{decisionAgent:run.decisionAgent}};
const user={id:'33333333-3333-4333-8333-333333333333',time:'2026-10-12T10:00:01Z',action:'discuss',status:'starting',text:'讨论下一阶段计划',discussionDraft:'第一',discussionProgress:'正在生成回复…'};
const session={id:'44444444-4444-4444-8444-444444444444',title:'已完成任务后的讨论',projectPath:run.source,projectName:'fixture',chatMode:'discuss',runs:[{id:run.id,profileId:run.profileId}],messages:[user],settings:{mode:'real',decisionAgent:run.decisionAgent},budget:{},updatedAt:user.time,status:'discuss'};
const banner='Under-development features enabled: respect_system_proxy. Under-development features are incomplete and may behave unpredictably. To suppress this warning, set `suppress_unstable_features_warning = true` in C:\\Users\\fixture\\.codex\\config.toml.';
const notices=projectMessages(state,[{event:'agent-activity',hash:'a'.repeat(64),time:user.time,data:{agent:'codex',source:'codex-sdk-runStreamed',scope:'call',kind:'error',title:'Codex 工具错误',text:banner}}],[]).map(m=>({...m,id:'discussion:'+m.id}));
let reads=0;
fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="UTF-8"><div id="root"></div><script type="module" src="./fixture.tsx"></script>');
fs.writeFileSync(path.join(out,'fixture.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import'/src/style.css';import'/src/chat-messages.css';import'/src/codex.css';import GroupWorkspace from'/src/GroupWorkspace.tsx';window.personalAgent={subscribe:()=>()=>{},invoke:async r=>r.operation==='sessionDetail'?fetch('/fixture/session').then(r=>r.json()):r.operation==='thread'?${JSON.stringify({...messagePage([],undefined),capabilities:{}})}:r.operation==='pictures'?[]:r.operation==='listProjectFiles'?{path:'D:/fixture',files:[],directories:[]}:[]};createRoot(document.getElementById('root')).render(<GroupWorkspace conversation={${JSON.stringify(session)}} run={${JSON.stringify(run)}} onDetails={()=>{}} onDelivery={()=>{}} onGoal={()=>{}}/>);`);
const server=await createServer({root:desktop,cacheDir:path.join(out,'vite-cache'),configFile:false,server:{host:'127.0.0.1',port:0},plugins:[{name:'owned-discussion',configureServer(s){s.middlewares.use('/fixture/session',(_req,res)=>{reads++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({session,runs:[run],discussionMessages:notices}));});}}]});
const {chromium}=await import(pathToFileURL('D:/PersonalAgent/snake-validation/node_modules/playwright-core/index.mjs').href);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[];
try{
 await server.listen();const url='http://127.0.0.1:'+server.httpServer.address().port+'/.validation/discussion-stream/index.html';
 for(const width of [1280,480]){
  user.status='starting';user.discussionDraft='第一';delete user.discussionReply;const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
  const reply=page.locator('.group-message.kind-discussion');await reply.filter({hasText:'第一'}).waitFor();assert.equal(await page.locator('.group-message.kind-error').count(),0);assert.equal(await page.locator('.group-message.kind-notice').count(),1);
  user.discussionDraft='第一阶段：完善操作';await page.waitForFunction(()=>document.querySelector('.group-message.kind-discussion')?.textContent?.includes('完善操作'));assert.equal(user.status,'starting');assert.equal(await reply.count(),1);
  await page.screenshot({path:path.join(out,'growing-'+width+'.png')});user.status='recorded';user.discussionReply='第一阶段：完善操作。第二阶段：加入关卡。';delete user.discussionDraft;
  await page.waitForFunction(()=>document.querySelector('.group-message.kind-discussion')?.textContent?.includes('加入关卡'));await page.reload();await reply.filter({hasText:'加入关卡'}).waitFor();assert.equal(await reply.count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,widths:[1280,480],completedRunDiscussion:true,warningNotFailure:true,partialBeforeCompletion:true,noDuplicate:true,reads,errors},null,2));console.log('PASS: completed chat discussion grows before completion, startup notice stays informational');
}finally{await browser.close();await server.close();}
