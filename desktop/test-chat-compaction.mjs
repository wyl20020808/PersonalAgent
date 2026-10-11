// Isolated, hidden Electron component test; no real Agent Run or user browser.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
const directory=path.dirname(fileURLToPath(import.meta.url));
const output=path.resolve(directory,'../validation/chat-compaction-ui');
fs.mkdirSync(output,{recursive:true});
await build({stdin:{resolveDir:directory,loader:'tsx',contents:`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FileCards,FilePreviewContext} from './src/FilePreview.tsx';
import {EventGroup,Message} from './src/GroupWorkspace.tsx';
import {groupMessages} from './src/threadGrouping.ts';
const message=(i,extra={})=>({id:String(i),timelineIndex:i,time:'2026-10-11T10:00:00Z',role:'codex',participantRole:'执行者',decisionStage:'execute',title:'Codex 执行事件',text:'echo test\\ncompleted · exit_code=0',kind:'tool',category:'commands',status:'success',runId:'run',taskId:'task',loop:1,scope:'execute:1',source:'audit',details:{protocol:'codex-sdk-runStreamed'},...extra});
const files=message(10,{kind:'tests',details:{paths:['a.ts','b.ts','c.ts','d.ts','e.ts']}});
const raw=[message(0),message(1,{title:'Codex 文件操作',category:'files',text:'completed\\n[{"path":"a.ts"}]'}),message(2,{kind:'output',category:'output',text:'修改完成'}),message(3),message(4,{kind:'output',category:'output',text:''}),message(5,{status:'fail',text:'false\\nfailed · exit_code=1\\nfailed output'})];
function Fixture(){const [expanded,setExpanded]=useState({});return <FilePreviewContext.Provider value={{messages:raw,openFile:(_m,path)=>document.body.dataset.opened=path}}><section id="files"><FileCards message={files}/></section><section id="events">{groupMessages(raw,true).map(group=><EventGroup key={group.id} group={group} expanded={!!expanded[group.id]} onToggle={()=>setExpanded(value=>({...value,[group.id]:!value[group.id]}))}/>)}</section><section id="empty-command"><Message message={message(20)}/></section></FilePreviewContext.Provider>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`},bundle:true,format:'esm',outfile:path.join(output,'fixture.js'),loader:{'.svg':'dataurl','.png':'dataurl'},define:{'process.env.NODE_ENV':'"production"'}});
fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><meta charset="UTF-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script type="module" src="fixture.js"></script>');
fs.writeFileSync(path.join(output,'test.cjs'),`
const {app,BrowserWindow,session}=require('electron');
const path=require('node:path');
app.setPath('userData',path.join(__dirname,'electron-data'));app.disableHardwareAcceleration();
const timer=setTimeout(()=>{console.error('UI test timeout');app.exit(1);},20000);
app.whenReady().then(async()=>{
 session.defaultSession.setPermissionRequestHandler((_w,_p,done)=>done(false));
 const win=new BrowserWindow({show:false,width:1100,height:1000,webPreferences:{offscreen:true,nodeIntegration:false,contextIsolation:true,sandbox:true}});
 await win.loadFile(path.join(__dirname,'index.html'));
 await win.webContents.executeJavaScript(
  '('+(${async function(){
   const wait=()=>new Promise(resolve=>setTimeout(resolve,50));
   const assert=(ok,text)=>{if(!ok)throw Error(text);};
   for(let i=0;i<100&&!document.querySelector('#files .chat-file-card');i++)await wait();
   const cards=()=>document.querySelectorAll('#files .chat-file-card');
   assert(cards().length===3,'default file preview must show 3');
   const toggle=document.querySelector('#files .chat-file-toggle');
   assert(toggle.textContent.includes('2'),'hidden file count');toggle.click();await wait();
   assert(cards().length===5&&toggle.getAttribute('aria-expanded')==='true','file expand');
   cards()[4].click();assert(document.body.dataset.opened==='e.ts','file preview click');
   toggle.click();await wait();assert(cards().length===3,'file collapse');
   assert(document.querySelectorAll('#events > article').length===4,'tools/output/failure projection');
   const group=document.querySelector('#events .group-toggle');
   assert(group.getAttribute('aria-expanded')==='false','execution group starts folded');
   group.click();await wait();assert(document.querySelectorAll('#events .group-children article').length===2,'execution group expands');
   group.click();await wait();assert(!document.querySelector('#events .group-children'),'execution group collapses');
   assert(document.querySelector('#events [data-message-id="2"]').textContent.includes('修改完成'),'public output visible');
   assert(!document.querySelector('#events [data-message-id="4"]'),'empty output hidden');
   assert(document.querySelector('#events [data-message-id="5"] .tool-output').open,'failure output visible');
   assert(!document.querySelector('#empty-command .tool-output'),'empty command output omitted');
   return 'PASS: file preview 3/5/3, file click, execution fold, public output, failure, empty output';
  }}).toString()+')()'
 ).then(console.log);
 clearTimeout(timer);app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(timer);app.exit(1);});
`);
const require=createRequire(import.meta.url),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),[path.join(output,'test.cjs')],{cwd:directory,windowsHide:true,env,stdio:'inherit'});
await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('UI test exit '+code)));});
