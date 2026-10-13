import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const output=path.resolve('../.v3c3/resume-ui');fs.mkdirSync(output,{recursive:true});
const fixture=path.join(output,'fixture.tsx');
fs.writeFileSync(fixture,`
import React from ${JSON.stringify(path.resolve('node_modules/react/index.js'))};
import {createRoot} from ${JSON.stringify(path.resolve('node_modules/react-dom/client.js'))};
import GroupWorkspace from ${JSON.stringify(path.resolve('src/GroupWorkspace.tsx'))};
import ${JSON.stringify(path.resolve('src/style.css'))};
const time=new Date().toISOString(),calls=[];
const run={id:'fixture-run',profileId:'fixture-profile',phase:'interrupted',active:false,goal:'OpenWorld 中断任务',source:'D:/fixture',workspace:'D:/fixture',updatedAt:time,mode:'mock',reason:'Controller 已退出',tasks:[],taskIndex:0,completedTaskIds:[],loops:1,claudeCalls:1,totalReworks:0,executorExitCode:-1,config:{maxClaudeCalls:5},failure:null,evidence:null};
let session={id:'fixture-session',title:'恢复任务验证',projectPath:'D:/fixture',projectName:'fixture',createdAt:time,updatedAt:time,settings:{mode:'mock',projectMode:'direct'},runs:[{id:run.id,profileId:run.profileId}],messages:[],chatMode:'develop'};
const root=createRoot(document.getElementById('root'));
window.__calls=calls;
const render=()=>root.render(<div style={{height:'100vh'}}><GroupWorkspace run={run} conversation={session} onDetails={()=>{}} onDelivery={()=>{}} onGoal={()=>{}} onConversationChange={value=>{session=value;render();}}/></div>);
window.__state=(phase,active,failure=null)=>{run.phase=phase;run.active=active;run.failure=failure;render();};
window.personalAgent={invoke:async r=>{
 if(r.operation==='sessionDetail')return {session,runs:[run]};
 if(r.operation==='thread')return {messages:[],hasMore:false,contexts:[],capabilities:{}};
 if(r.operation==='pictures')return [];
 if(r.operation==='sendSession'){calls.push(r);await new Promise(resolve=>setTimeout(resolve,100));return {...session,messages:[...session.messages,{id:r.messageId,text:r.text,status:'executed',action:'resume',runId:run.id,time}]};}
 if(r.operation==='listProjectFiles')return {entries:[]};
 throw Error('Unexpected request '+r.operation);
}};
render();
`);
await build({entryPoints:[fixture],bundle:true,format:'esm',outfile:path.join(output,'fixture.js'),jsx:'automatic',nodePaths:[path.resolve('node_modules')],loader:{'.svg':'dataurl','.png':'dataurl','.woff':'file','.woff2':'file','.ttf':'file'}});
fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><meta charset="UTF-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script type="module" src="fixture.js"></script>');
fs.writeFileSync(path.join(output,'verify.cjs'),`
const {app,BrowserWindow,session}=require('electron');
const fs=require('fs'),path=require('path');
app.setPath('userData',path.join(__dirname,'electron-data'));app.disableHardwareAcceleration();
const timer=setTimeout(()=>app.exit(1),30000);
app.whenReady().then(async()=>{
 session.defaultSession.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
 const win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{offscreen:true,nodeIntegration:false,contextIsolation:true,sandbox:true}});
 await win.loadFile(path.join(__dirname,'index.html'));
 await new Promise(resolve=>setTimeout(resolve,400));
 await win.webContents.executeJavaScript(\`(async()=>{
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),assert=(value,message)=>{if(!value)throw Error(message);};
  const button=()=>document.querySelector('[aria-label="恢复任务"]');
  assert(button()&&!button().disabled,'interrupted recovery entry missing');button().click();await wait(250);
  assert(window.__calls.length===1&&window.__calls[0].text==='恢复任务','default recovery not sent');
  const input=document.querySelector('#group-input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'先核对已有院区，继续剩余任务');input.dispatchEvent(new Event('input',{bubbles:true}));await wait(50);button().click();await wait(250);
  assert(window.__calls.length===2&&window.__calls[1].text==='先核对已有院区，继续剩余任务','user recovery requirements lost');
  assert(document.querySelector('#group-input').value==='','sent requirements not cleared');
  for(const phase of ['paused','stopped','failed']){window.__state(phase,false);await wait(50);assert(button()&&!button().disabled,'recoverable entry missing '+phase);}
  window.__state('failed',false,{recoverable:false});await wait(50);assert(button().disabled,'unrecoverable failure enabled');
  window.__state('review',true);await wait(50);assert(!button(),'live recovery entry displayed');
  window.__state('completed',false);await wait(50);assert(!button(),'completed recovery entry displayed');
  window.__state('interrupted',false);await wait(100);
 })()\`);
 fs.writeFileSync(path.join(__dirname,'resume.png'),(await win.webContents.capturePage()).toPNG());
 fs.writeFileSync(path.join(__dirname,'result.json'),JSON.stringify({headless:true,recoveryEntry:true,userRequirements:true,activeBlocked:true,unrecoverableBlocked:true,completedHidden:true}));
 clearTimeout(timer);win.destroy();app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
`);
const require=createRequire(import.meta.url),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),['--no-error-dialogs',path.join(output,'verify.cjs')],{env,windowsHide:true,stdio:'inherit'});
fs.writeFileSync(path.join(output,'pid.txt'),String(child.pid));
const timeout=setTimeout(()=>{child.kill();process.exitCode=1;},30000);
child.on('error',error=>{clearTimeout(timeout);console.error(error);process.exitCode=1;});child.on('exit',code=>{clearTimeout(timeout);process.exitCode=code??1;});
