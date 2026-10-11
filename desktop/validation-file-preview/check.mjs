import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'file:///C:/Users/WYL20/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {DesktopService} from '../out/service.js';
import {git} from '../../dist/src/workspace.js';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..'),runtime=path.join(dir,'runtime',crypto.randomUUID()),project=path.join(runtime,'project'),data=path.join(runtime,'data');
fs.mkdirSync(project,{recursive:true});await git(project,['init']);await git(project,['config','user.name','Preview Test']);await git(project,['config','user.email','test@example.invalid']);
const before='export function calculateTotal(price: number, count: number) {\n  return price;\n}\n',after='export function calculateTotal(price: number, count: number) {\n  const subtotal = price * count;\n  return Math.round(subtotal * 100) / 100;\n}\n';
fs.writeFileSync(path.join(project,'checkout.ts'),before);await git(project,['add','checkout.ts']);await git(project,['commit','--allow-empty','-m','UI fixture baseline']);
const service=new DesktopService(root,data,process.execPath);service.launch=()=>{};
const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',projectMode:'direct'}),conversation=await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:crypto.randomUUID(),text:'点击文件，检查右侧代码与修改。',directAcknowledged:true}),ref=conversation.runs[0],store=service.store(ref.profileId,ref.id);
fs.writeFileSync(path.join(project,'checkout.ts'),after);fs.writeFileSync(path.join(project,'new-file.ts'),'export const message = "<img src=x onerror=window.__unsafe=true>";\n');
const state=store.load();state.phase='executing';state.loops=1;store.save(state);
store.audit('agent-activity',{agent:'codex',taskId:'hello',loop:1,kind:'tool',title:'Codex 文件操作',source:'codex-sdk-runStreamed',text:'completed\n'+JSON.stringify([{path:path.join(project,'checkout.ts'),kind:'update'},{path:path.join(project,'new-file.ts'),kind:'add'}])});
const diff=await git(project,['diff','--no-ext-diff','--no-textconv','HEAD','--','checkout.ts']);store.audit('agent-finish',{agent:'codex',role:'execute',taskId:'hello',loop:1,changed:true,durationMs:10,diff});
const run=service.publicRun(store.load(),ref.profileId),errors=[],calls=[];
await build({entryPoints:[path.join(dir,'fixture.tsx')],outdir:path.join(dir,'out'),bundle:true,format:'esm',loader:{'.png':'dataurl','.svg':'dataurl'}});
const server=http.createServer(async(request,response)=>{try{
 if(request.url==='/fixture'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({run,conversation}));return;}
 if(request.url==='/api'){let body='';for await(const chunk of request)body+=chunk;const value=JSON.parse(body);calls.push(value);response.setHeader('Content-Type','application/json');response.end(JSON.stringify(await service.dispatch(value)));return;}
 if(request.url==='/favicon.ico'){response.writeHead(204);response.end();return;}
 if(request.url==='/' ){response.setHeader('Content-Type','text/html');response.end('<html><meta charset="UTF-8"><div id="root"></div><link rel="stylesheet" href="fixture.css"><script type="module" src="fixture.js"></script></html>');return;}
 const file=request.url.startsWith('/assets/agents/')?path.join(root,'desktop/src',request.url.slice(1)):path.join(dir,'out',request.url.slice(1));if(!fs.existsSync(file)){response.writeHead(404);response.end();return;}response.setHeader('Content-Type',file.endsWith('.svg')?'image/svg+xml':file.endsWith('.css')?'text/css':'text/javascript');response.end(fs.readFileSync(file));
 }catch(error){response.writeHead(400,{'Content-Type':'application/json'});response.end(JSON.stringify({error:error.message}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const page=await browser.newPage({viewport:{width:1500,height:960}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('.chat-file-card').first().waitFor();assert.equal(await page.locator('.preview-sidebar').count(),0);
 await page.locator('.tool-record .chat-file-card').filter({hasText:'checkout.ts'}).click();
 await page.getByRole('tab',{name:'checkout.ts',exact:true}).waitFor();await page.locator('.file-review .line-add').first().waitFor();
 assert.equal(await page.locator('.file-review .line-add').count(),2);assert.equal(await page.locator('.file-review .line-remove').count(),1);assert.ok(await page.locator('.file-review .hljs-keyword').count());
 assert.equal(await page.locator('.file-review .line-remove .code-line-number').first().innerText(),'2');assert.equal(await page.locator('.file-review .line-add .code-line-number').nth(1).innerText(),'2');
 assert.match(await page.locator('.file-review-heading .file-change-stats').innerText(),/\+2.*−1/s);
 await page.getByRole('button',{name:'展开文件预览',exact:true}).click();await page.screenshot({path:path.join(dir,'diff.png')});await page.locator('.preview-sidebar').screenshot({path:path.join(dir,'diff-sidebar.png')});
 await page.getByRole('tab',{name:'文件',exact:true}).click();await page.locator('.file-review .line-context').first().waitFor();assert.equal(await page.locator('.file-review .line-remove').count(),0);assert.match(await page.locator('.file-review .code-review-scroll').innerText(),/subtotal/);
 await page.screenshot({path:path.join(dir,'content.png')});
 await page.locator('.tool-record .chat-file-card').filter({hasText:'checkout.ts'}).click();assert.equal(await page.getByRole('tab',{name:'checkout.ts',exact:true}).count(),1);
 await page.locator('.tool-record .chat-file-card').filter({hasText:'new-file.ts'}).click();await page.locator('.file-review .line-add').waitFor();assert.match(await page.locator('.file-review-scope').innerText(),/Git HEAD/);assert.equal(await page.evaluate(()=>window.__unsafe),undefined);assert.equal(await page.locator('.file-review img').count(),0);
 await page.getByRole('button',{name:'关闭标签页 new-file.ts',exact:true}).click();await page.getByRole('button',{name:/查看本次变更/}).click();await page.getByRole('tab',{name:/^变更 · 第 /}).waitFor();await page.locator('.changes-overview .line-add').first().waitFor();await page.screenshot({path:path.join(dir,'changes.png')});
 await page.getByRole('button',{name:'查看当前文件',exact:true}).click();await page.locator('.file-review .line-add').first().waitFor();
 for(const width of [1000,700]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(dir,width+'.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page horizontal overflow');}
 assert.deepEqual(errors,[]);assert.equal(calls.some(call=>['resume','approve','apply','stop'].includes(call.operation)),false);
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({passed:true,checks:['real service IPC and Run workspace','chat card opens sidebar','deduplicated tabs','file/diff switch','line numbers and syntax highlighting','2 additions and 1 deletion','untracked file current Git fallback','escaped source HTML','change overview','1000/700 px no page overflow','read-only operations'],errors},null,2));console.log('PASS: file preview headless UI with real DesktopService');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
