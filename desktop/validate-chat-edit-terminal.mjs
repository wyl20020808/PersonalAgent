import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/WYL20/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const directory='.validation/chat-edit-terminal';
const real=process.argv.includes('--real'),realData=real?JSON.parse(await fs.readFile('.validation/chat-file-rows/real-data.json','utf8')):null;
await fs.mkdir(directory,{recursive:true});
await build({entryPoints:['test/chat-edit-terminal.tsx'],bundle:true,outfile:directory+'/fixture.js',format:'esm',loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl'}});
const server=http.createServer(async(request,response)=>{if(request.url==='/real-data.json'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(realData));return;}const name=request.url==='/fixture.js'?'fixture.js':request.url==='/fixture.css'?'fixture.css':null;response.setHeader('Content-Type',name?.endsWith('.js')?'text/javascript':name?'text/css':'text/html');response.end(name?await fs.readFile(directory+'/'+name):'<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1000,height:750}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const operation=page.locator('.compact-operation'),files=page.locator('.operation-file-entry');
 await files.first().waitFor();
 if(real){
  await page.locator('.file-change-stats').last().waitFor();
  assert.deepEqual(await page.locator('.operation-file-name').allTextContents(),['blender_export.py','community-service-center.json','export_common.py']);
  assert.deepEqual(await page.locator('.file-change-stats').allTextContents(),Object.values(realData.previews).map(item=>`+${item.change.added}−${item.change.removed}`));
  const positions=await files.evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().top));assert.equal(new Set(positions).size,3);
  assert.ok(!(await files.allTextContents()).join('').includes('D:'));assert.ok(!(await files.allTextContents()).join('').includes('统计中'));
  await page.screenshot({path:directory+'/real-desktop.png',fullPage:true});await page.locator('.compact-event-group .message-content').screenshot({path:directory+'/real-files.png'});await page.setViewportSize({width:420,height:750});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:directory+'/real-narrow.png',fullPage:true});assert.deepEqual(errors,[]);
  console.log('PASS: real audit replay and real Git diff counts; each file has its own row; basename only; desktop/narrow layouts.');
 }else{
 assert.equal(await operation.first().locator('.operation-file-name').allTextContents().then(names=>names.join(',')),'code.ts,code.ts');
 assert.deepEqual(await operation.first().locator('.file-change-stats').allTextContents(),['+2−1','+1−1']);
 assert.equal(await operation.first().locator('.operation-file-name').first().getAttribute('title'),'D:/Demo/src/code.ts');
 const rows=await operation.first().locator('.operation-file-entry').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().top));assert.notEqual(rows[0],rows[1]);
 await operation.nth(1).locator('.file-change-stats').waitFor();
 assert.match(await operation.nth(1).textContent(),/new.py.*\+4−0/);
 assert.equal(await operation.nth(2).locator('.file-change-stats').count(),0);
 assert.ok(!(await operation.nth(2).textContent()).includes('行数不可用'));
 await operation.first().locator('.operation-file-name').first().click();
 assert.equal(await page.evaluate(()=>document.body.dataset.opened),'D:/Demo/src/code.ts');
 await operation.last().locator('summary').click();
 assert.equal(await operation.last().locator('.compact-terminal-label').textContent(),'Shell');
 assert.equal(await operation.last().locator('.compact-command').textContent(),'$ rtk npm run build');
 assert.match(await operation.last().locator('.compact-output').textContent(),/line one\nline two/);
 assert.equal(await operation.last().locator('.compact-terminal').evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(241, 242, 243)');
 assert.equal(await operation.last().locator('.compact-command').evaluate(element=>getComputedStyle(element).backgroundColor),'rgba(0, 0, 0, 0)');
 await page.screenshot({path:directory+'/desktop.png',fullPage:true});
 await page.setViewportSize({width:420,height:750});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
 await page.screenshot({path:directory+'/narrow.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: basename only, separate same-name stats, new-file current stats, binary unavailable, file click, Shell background/command/output, narrow layout; isolated headless fixture.');
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
