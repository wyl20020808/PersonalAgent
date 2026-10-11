// Offscreen Electron exercises the production React components with an explicit fixture bridge.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
const directory=path.dirname(fileURLToPath(import.meta.url));
const output=path.resolve(directory,'../.validation/queued-edit-ui');
fs.mkdirSync(output,{recursive:true});
let fixture=fs.readFileSync(path.join(directory,'workbench-preview.tsx'),'utf8');
fixture=fixture.replace("import React from 'react';","import React,{useState} from 'react';");
fixture=fixture.replace('(window as any).__sent=[];',`session.messages.push({id:'queue-edit',time,text:'原排队消息',status:'pending',attachments:[{name:'需求.txt',mimeType:'text/plain',size:6}]});
(window as any).__sent=[];(window as any).__edits=[];(window as any).__rejectEdit=false;`);
fixture=fixture.replace("if(r.operation==='sendSession')",`if(r.operation==='editSessionMessage'){(window as any).__edits.push(r);await new Promise(resolve=>setTimeout(resolve,80));if((window as any).__rejectEdit)throw Error('决策者已接收此消息，不能再修改');session.messages=session.messages.map((m:any)=>m.id===r.messageId?{...m,text:r.text}:m);return {...session};}
 if(r.operation==='sendSession')`);
fixture=fixture.replace('createRoot(document',`function Fixture(){const [conversation,setConversation]=useState(session);return <GroupWorkspace run={run} conversation={conversation} onConversationChange={setConversation} onGoal={()=>{}} onDetails={()=>{}} onDelivery={()=>{}}/>;}
createRoot(document`);
fixture=fixture.replace('<GroupWorkspace run={run} conversation={session} onGoal={()=>{}} onDetails={()=>{}} onDelivery={()=>{}}/>','<Fixture/>');
await build({stdin:{contents:fixture,resolveDir:directory,loader:'tsx'},bundle:true,format:'esm',outfile:path.join(output,'preview.js'),define:{'process.env.NODE_ENV':'"production"'}});
fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><link rel="stylesheet" href="preview.css"><div id="root"></div><script type="module" src="preview.js"></script></html>');
fs.writeFileSync(path.join(output,'runner.cjs'),`
const {app,BrowserWindow}=require('electron');const fs=require('fs'),path=require('path');
app.setPath('userData',path.join(__dirname,'electron-data'));app.disableHardwareAcceleration();
const timeout=setTimeout(()=>{console.error('Queued edit UI timeout');app.exit(1);},30000);
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1200,height:900,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
await win.loadFile(path.join(__dirname,'index.html'));
const result=await win.webContents.executeJavaScript(String.raw\`(async()=>{
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const assert=(ok,note)=>{if(!ok)throw Error(note);};
 const until=async check=>{for(let i=0;i<150;i++){if(check())return;await wait(20);}throw Error('UI condition timeout');};
 const setText=(el,text)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));};
 const row=()=>document.querySelector('[data-queued-id="queue-edit"]');const edit=()=>row().querySelector('.queue-editor textarea');
 const action=label=>[...row().querySelectorAll('button')].find(button=>button.textContent===label);
 const open=async()=>{row().querySelector('[aria-label^="更多操作"]').click();await wait(30);const popup=row().querySelector('.queue-menu-popup');assert(popup.matches(':popover-open'),'menu did not open');const b=popup.getBoundingClientRect();assert(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('.queue-menu-popup'),'menu clipped by queue scroll container');action('编辑').click();await until(()=>edit());};
 await until(()=>row());setText(document.querySelector('#group-input'),'保留主输入框草稿');await wait(30);
 await open();assert(edit().value==='原排队消息','editor initial text missing');setText(edit(),'取消的内容');await wait(30);action('取消').click();await until(()=>!edit());assert(row().textContent.includes('原排队消息'),'cancel changed queue');assert(window.__edits.length===0,'cancel sent edit');
 await open();setText(edit(),'   ');await wait(30);assert(action('保存').disabled,'empty message allowed');setText(edit(),'修改后的排队消息\\n第二行');await wait(30);window.__rejectEdit=true;action('保存').click();await until(()=>row().querySelector('[role="alert"]'));assert(edit().value.includes('第二行'),'failed save lost draft');window.__rejectEdit=false;action('保存').click();await until(()=>!edit());
 assert(row().textContent.includes('修改后的排队消息'),'save did not update queue');assert(document.querySelector('#group-input').value==='保留主输入框草稿','queue edit changed composer draft');assert(row().textContent.includes('需求.txt'),'queue edit lost attachment');assert(window.__sent.length===0,'queue edit sent a new message');assert(window.__edits.at(-1).messageId==='queue-edit','wrong message edited');
 await open();edit().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await until(()=>!edit());
 return {menuVisible:true,cancelPreservesMessage:true,blankRejected:true,failedSavePreservesDraft:true,saved:true,composerDraftPreserved:true,attachmentsPreserved:true,newMessageNotSent:true,escapeCancels:true,bridge:'fixture; production React components; no Agent calls'};
})()\`);
fs.writeFileSync(path.join(__dirname,'evidence.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(__dirname,'queued-edit.png'),(await win.webContents.capturePage()).toPNG());console.log(JSON.stringify(result));clearTimeout(timeout);win.destroy();app.quit();}).catch(error=>{console.error(error);app.exit(1);});
`);
const require=createRequire(import.meta.url),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),[path.join(output,'runner.cjs')],{cwd:directory,windowsHide:true,env,stdio:'inherit'});
child.on('error',error=>{console.error(error);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
