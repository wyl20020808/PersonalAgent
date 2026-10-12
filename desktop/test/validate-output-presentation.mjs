import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'vite';
const desktop=fileURLToPath(new URL('..',import.meta.url)),root=desktop,out=path.join(root,'.validation/output-presentation');
fs.mkdirSync(out,{recursive:true});
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE??'D:/PersonalAgent/snake-validation/node_modules/playwright-core/index.mjs').href);
const base={id:'',role:'opencode',participantRole:'执行者',kind:'output',status:'recorded',title:'',text:'',time:'2026-10-12T05:44:09Z',runId:'fixture',taskId:'fixture',loop:1,source:'isolated UI fixture'};
const long=Array.from({length:120},(_,i)=>`第 ${i+1} 行：公开结果，必须能够滚动阅读。`).join('\n\n');
const entries=[
 {...base,id:'receipt',text:JSON.stringify({role:'execution',phase:'execute',sessionId:'hidden-session',providerID:'hidden-provider',receipt:JSON.stringify({action:'Use native tools',summary:long,checks:['构建通过','测试通过']})}),details:{protocol:'opencode-sdk'}},
 {...base,id:'discussion',role:'claude',participantRole:'决策者',kind:'discussion',text:long},
 {...base,id:'plain',role:'user',text:long},
 {...base,id:'short',text:'简短回复'},
 {...base,id:'tool',kind:'tool',title:'OpenCode 工具',text:JSON.stringify({receipt:{tool:'bash',status:'completed',input:{command:'echo fixture'},output:long}}),details:{protocol:'opencode-sdk'}},
 {...base,id:'partial',text:'{"role":"execution","phase":"execute","receipt":',details:{protocol:'opencode-sdk'}},
 {...base,id:'error',kind:'error',text:long},
 {...base,id:'todo',kind:'todo',text:long},
 {...base,id:'command',category:'commands',title:'运行命令',text:long},
 {...base,id:'system',role:'controller',kind:'phase',title:'阶段记录',text:long},
 {...base,id:'tests',role:'controller',kind:'tests',text:'验收记录',details:{tests:[{exitCode:0,stdout:long,stderr:''}]}},
 {...base,id:'plan',kind:'plan',text:'任务计划',details:{tasks:[{id:'task-long',instruction:long,acceptance:['完整显示'],dependsOn:[]}]}},
];
fs.writeFileSync(path.join(out,'index.html'),'<meta charset="UTF-8"><div id="root"></div><script type="module" src="./fixture.tsx"></script>');
fs.writeFileSync(path.join(out,'fixture.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import '/src/style.css';import {Message,SafeMarkdown} from '/src/GroupWorkspace.tsx';import '/src/codex.css';import '/src/chat-messages.css';const entries=${JSON.stringify(entries)};createRoot(document.getElementById('root')).render(<div className="group-workspace"><div className="chat-feed" style={{height:'auto',overflow:'visible'}}>{entries.map(m=><Message key={m.id} message={m}/>)}</div><div className="preview-content"><div className="markdown"><SafeMarkdown text={${JSON.stringify(long)}}/></div></div></div>);`);
const server=await createServer({root,server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
let browser;
try{
 browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],executablePath:process.env.CHROME_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(server.resolvedUrls.local[0]+'.validation/output-presentation/index.html');
 await page.locator('[data-message-id="receipt"] .message-text-scroll').waitFor();
 for(const width of [1280,480]){
  await page.setViewportSize({width,height:900});
  const text=await page.locator('[data-message-id="receipt"] .message-text-scroll').innerText();
  assert.match(text,/操作/);assert.match(text,/Use native tools/);assert.match(text,/验证/);assert.doesNotMatch(text,/hidden-session|hidden-provider|"receipt"/);
  for(const id of ['receipt','discussion','plain']){
   const region=page.locator(`[data-message-id="${id}"] .message-text-scroll`);
   assert.ok(await region.evaluate(el=>el.scrollHeight>el.clientHeight&&el.clientHeight<=360&&getComputedStyle(el).overflowY==='auto'),id+' bounded scroll');
   await region.evaluate(el=>el.scrollTop=el.scrollHeight);
   assert.ok(await region.evaluate(el=>el.scrollTop>0),id+' actually scrolls');
   assert.match(await region.innerText(),/第 120 行/);
  }
  assert.ok(await page.locator('[data-message-id="short"] .message-text-scroll').evaluate(el=>el.scrollHeight===el.clientHeight),'short message needs no scrollbar');
  await page.locator('[data-message-id="receipt"] .message-protocol summary').click();
  assert.match(await page.locator('[data-message-id="receipt"] .message-protocol pre').innerText(),/hidden-session/);
  assert.ok(await page.locator('[data-message-id="receipt"] .message-protocol pre').evaluate(el=>el.scrollHeight>el.clientHeight),'raw receipt bounded');
  await page.locator('[data-message-id="receipt"] .message-protocol summary').click();
  await page.locator('[data-message-id="tool"] .tool-output summary').click();
  assert.ok(await page.locator('[data-message-id="tool"] .tool-output pre').evaluate(el=>el.scrollHeight>el.clientHeight),'tool output bounded');
  await page.locator('[data-message-id="tool"] .tool-output summary').click();
  assert.ok(await page.locator('.preview-content .markdown').evaluate(el=>el.scrollHeight>el.clientHeight),'sidebar bounded');
  for(const [id,summary,region] of [['error','.message-fold summary','.message-fold pre'],['command','.command-details summary','.command-details .markdown'],['system','details summary','.system-evidence'],['tests','.chat-test-card summary','.chat-test-card pre'],['plan','.chat-plan summary','.chat-plan details']]){
   await page.locator(`[data-message-id="${id}"] ${summary}`).click();
   assert.ok(await page.locator(`[data-message-id="${id}"] ${region}`).evaluate(el=>el.scrollHeight>el.clientHeight&&el.clientHeight<=360&&getComputedStyle(el).overflowY==='auto'),id+' bounded scroll');
   await page.locator(`[data-message-id="${id}"] ${summary}`).click();
  }
  assert.ok(await page.locator('[data-message-id="todo"] .step-record').evaluate(el=>el.scrollHeight>el.clientHeight&&el.clientHeight<=360),'todo bounded');
  assert.match(await page.locator('[data-message-id="partial"] .message-text-scroll').innerText(),/执行记录不完整/);
  await page.locator('[data-message-id="partial"] .message-protocol summary').click();
  assert.match(await page.locator('[data-message-id="partial"] .message-protocol pre').innerText(),/"receipt":/);
  await page.locator('[data-message-id="partial"] .message-protocol summary').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
 }
 await page.setViewportSize({width:1280,height:900});
 await page.locator('[data-message-id="receipt"] .message-text-scroll').evaluate(el=>el.scrollTop=0);
 await page.locator('[data-message-id="receipt"]').screenshot({path:path.join(out,'receipt.png')});
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,headless:true,viewports:[1280,480],checks:['nested receipt formatted','metadata hidden from public text','raw preserved','long output discussion and user messages scroll','short text natural height','tool and sidebar scroll','partial records retained','no page errors or horizontal overflow']},null,2));
 console.log('PASS: output presentation and scrolling at 1280/480 px');
}finally{await browser?.close();await server.close();}
