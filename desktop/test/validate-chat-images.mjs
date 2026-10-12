import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'vite';
const desktop=fileURLToPath(new URL('..',import.meta.url)),out=path.join(desktop,'.validation/chat-images');fs.mkdirSync(out,{recursive:true});
const dataUrl='data:image/png;base64,'+(process.env.CHAT_IMAGE_FIXTURE?fs.readFileSync(process.env.CHAT_IMAGE_FIXTURE).toString('base64'):'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK9sAAAAASUVORK5CYII=');
const base={id:'audit:'+'a'.repeat(64),role:'codex',participantRole:'执行者',kind:'tool',status:'success',title:'Codex MCP · local/view_image',text:JSON.stringify({tool:'view_image',status:'completed',arguments:{path:'D:/fixture/progress.png'}}),details:{protocol:'codex-sdk-runStreamed',profileId:'fixture-profile'},time:'2026-10-12T08:20:00Z',runId:'fixture',taskId:'images',loop:1,source:'isolated UI fixture'};
const failed={...base,id:'audit:'+'b'.repeat(64),status:'fail',title:'OpenCode read',text:JSON.stringify({receipt:{tool:'read',status:'error',error:'missing',input:{filePath:'D:/fixture/missing.png'}}}),details:{protocol:'opencode-sdk',profileId:'fixture-profile'}};
const output={...base,id:'audit:'+'c'.repeat(64),kind:'output',text:'生成结果：\n\n![工作进度](D:/fixture/progress.png)\n\n![remote](https://example.invalid/remote.png)'};
fs.writeFileSync(path.join(out,'index.html'),'<meta charset="UTF-8"><div id="root"></div><script type="module" src="./fixture.tsx"></script>');
fs.writeFileSync(path.join(out,'fixture.tsx'),`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import '/src/style.css';import '/src/chat-messages.css';import '/src/codex.css';import {Message,EventGroup} from '/src/GroupWorkspace.tsx';import FilePreview,{FilePreviewContext} from '/src/FilePreview.tsx';const viewed=${JSON.stringify(base)},failed=${JSON.stringify(failed)},output=${JSON.stringify(output)};window.reads=[];window.personalAgent={invoke:async r=>{window.reads.push(r);if(r.file.endsWith('missing.png'))return{path:r.file,scope:'本地图片',contentError:'图片已不存在'};return{path:r.file,scope:'本地图片',file:{path:r.file,size:100,mimeType:'image/png',dataUrl:${JSON.stringify(dataUrl)},truncated:false}};}};function App(){const[selected,setSelected]=useState(null),[expanded,setExpanded]=useState(false);return <FilePreviewContext.Provider value={{messages:[viewed,failed,output],openFile:(message,path)=>setSelected({message,path})}}><div className="group-workspace" data-profile-id="fixture-profile"><div className="chat-feed" style={{height:'auto',overflow:'visible'}}><EventGroup group={{id:'images',category:'执行操作',messages:[viewed,failed],status:'fail'}} expanded={expanded} onToggle={()=>setExpanded(!expanded)}/><Message message={output}/></div>{selected&&<FilePreview key={selected.path} message={selected.message} path={selected.path} profileId="fixture-profile"/>}</div></FilePreviewContext.Provider>}createRoot(document.getElementById('root')).render(<App/>);`);
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE??'D:/PersonalAgent/snake-validation/node_modules/playwright-core/index.mjs').href);
const server=await createServer({root:desktop,cacheDir:path.join(out,'vite-cache'),server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'.validation/chat-images/index.html');
 for(const width of [1280,480]){
  await page.setViewportSize({width,height:900});
  await page.getByText('已查看 1 张图片',{exact:true}).waitFor();assert.equal(await page.locator('.chat-image-receipts .image-file-name').count(),2);
  await page.locator('.chat-image-receipts .image-file-name').filter({hasText:'progress.png'}).click();await page.locator('.file-review-image').waitFor();
  assert.ok(await page.locator('.file-review-image').evaluate(img=>img.complete&&img.naturalWidth>0));
  await page.locator('.chat-image-receipts .image-file-name').filter({hasText:'missing.png'}).click();await page.getByText('图片已不存在',{exact:true}).waitFor();
  await page.locator('.chat-image-card').click();await page.locator('.file-review-image').waitFor();
  assert.equal(await page.locator('img[src^="https:"]').count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  await page.screenshot({path:path.join(out,`chat-images-${width}.png`)});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,headless:true,viewports:[1280,480],checks:['viewed count excludes failed image','collapsed image rows clickable','image decoded in preview','missing image explained','generated local Markdown image clickable','remote images not loaded','no horizontal overflow'],renderer:'Real components with explicit local IPC fixture'},null,2));console.log('PASS: chat images and preview at 1280/480 px');
}finally{await browser?.close();await server.close();}
