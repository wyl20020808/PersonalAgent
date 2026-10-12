import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/WYL20/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
await fs.mkdir('.validation/chat-live-controls',{recursive:true});
await build({entryPoints:['test/chat-live-controls.tsx'],bundle:true,outfile:'.validation/chat-live-controls/fixture.js',format:'esm',loader:{'.svg':'dataurl','.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl'}});
const server=http.createServer(async(request,response)=>{const name=request.url==='/fixture.js'?'fixture.js':request.url==='/fixture.css'?'fixture.css':null;response.setHeader('Content-Type',name?.endsWith('.js')?'text/javascript':name?'text/css':'text/html');response.end(name?await fs.readFile('.validation/chat-live-controls/'+name):'<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const execution=page.locator('.run-clocks time').nth(1),decision=page.locator('.run-clocks time').nth(0);
 await page.waitForFunction(()=>document.querySelectorAll('.run-clocks time')[1]?.textContent!=='00:00');
 const before=await execution.textContent();await page.waitForFunction(value=>document.querySelectorAll('.run-clocks time')[1]?.textContent!==value,before);
 const avatar=await page.locator('.person-icon:has(.agent-logo)').first().evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopWidth}));
 assert.deepEqual(avatar,{background:'rgba(0, 0, 0, 0)',border:'0px'});
 assert.equal(await page.locator('.execution-wave i').count(),5);
 assert.equal(await page.locator('.execution-wave i').first().evaluate(el=>getComputedStyle(el).animationName),'execution-wave');
 assert.ok(await page.getByRole('button',{name:'暂停任务',exact:true}).isVisible());
 await page.evaluate(()=>window.fixture.review());await page.waitForFunction(()=>document.querySelectorAll('.run-clocks time')[0]?.textContent!=='00:00');
 const reviewBefore=await decision.textContent();await page.waitForFunction(value=>document.querySelectorAll('.run-clocks time')[0]?.textContent!==value,reviewBefore);
 await page.getByRole('button',{name:'暂停任务',exact:true}).click();assert.equal(await page.locator('body').getAttribute('data-stopped'),'true');
 await page.evaluate(()=>window.fixture.finish());await page.waitForFunction(()=>!document.querySelector('.pause-button'));assert.equal(await page.locator('.execution-wave').count(),0);
 console.log('PASS: execution/decision clocks tick, transparent avatar, animated wave, stop request, inactive controls hidden (isolated headless fixture).');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
