// Hidden fixture renderer: never opens, focuses or operates the user's app/browser.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),data=path.join(root,'.v3c3','discuss-ui-'+randomUUID()),project=path.join(data,'project');
fs.mkdirSync(project,{recursive:true});fs.writeFileSync(path.join(project,'user.txt'),'protected\n');app.setPath('userData',path.join(data,'electron'));
app.whenReady().then(async()=>{
 const {build}=await import('esbuild'),{DesktopService}=await import('./out/service.js');
 const output=path.join(data,'renderer');fs.mkdirSync(output,{recursive:true});
 await build({entryPoints:[path.join(__dirname,'discuss-preview.tsx')],bundle:true,format:'esm',outfile:path.join(output,'preview.js'),loader:{'.svg':'dataurl','.png':'dataurl'},define:{'process.env.NODE_ENV':'"production"'}});
 fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><link rel="stylesheet" href="preview.css"><div id="root"></div><script type="module" src="preview.js"></script></html>');
 const service=new DesktopService(root,data,process.execPath);let launches=0;service.launch=()=>{launches++;};
 const window=new BrowserWindow({show:false,width:1100,height:900,webPreferences:{preload:path.join(__dirname,'out/preload.cjs'),contextIsolation:true,nodeIntegration:false}});
 ipcMain.handle('personalagent:request',async(event,r)=>{if(event.sender!==window.webContents)throw Error('Unknown fixture sender');return service.dispatch({...r,...(r.operation==='executeDiscussion'?{directAcknowledged:true}:{})});});
 ipcMain.handle('personalagent:subscribe',()=>({subscribed:false}));ipcMain.handle('personalagent:unsubscribe',()=>({unsubscribed:true}));
 await window.loadFile(path.join(output,'index.html'),{query:{project}});
 await window.webContents.executeJavaScript(`(async()=>{for(let i=0;i<100;i++){const button=document.querySelector('[aria-label="新会话工作方式"]');if(button){button.click();return;}await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Mode button missing');})()`);
 await new Promise(resolve=>setTimeout(resolve,150));fs.writeFileSync(path.join(data,'mode-menu.png'),(await window.capturePage()).toPNG());
 await window.webContents.executeJavaScript(`document.querySelector('[aria-label="新会话工作方式"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
 const result=await window.webContents.executeJavaScript(`(async()=>{
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await wait(100);}throw Error('UI condition timed out');};
  const assert=(value,message)=>{if(!value)throw Error(message);};
  await until(()=>document.querySelector('[aria-label="新会话工作方式"]'));
  const commandInput=document.querySelector('#group-input');const setInput=value=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(commandInput,value);commandInput.dispatchEvent(new Event('input',{bubbles:true}));};
  setInput('/');await until(()=>document.querySelector('[aria-label="斜杠命令"]'));document.querySelector('[role="option"]').click();await wait(100);assert(commandInput.value==='/discuss ','slash choice failed');assert(!document.querySelector('[aria-label="斜杠命令"]'),'slash menu remained after choice');
  setInput('/di');await until(()=>document.querySelector('[role="option"]'));commandInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait(100);assert(commandInput.value==='/discuss ','keyboard slash choice failed');setInput('');await wait(100);
  const select=document.querySelector('[aria-label="新会话工作方式"]');select.click();await until(()=>document.querySelector('[data-mode="discuss"]'));assert(document.querySelector('[data-mode="discuss"]').textContent.includes('先聊天'),'Discuss option missing');document.querySelector('[data-mode="discuss"]').click();await wait(100);assert(select.textContent.includes('Discuss'),'selected label missing');assert(!document.querySelector('[aria-label="选择工作方式"]'),'mode menu stayed open');
  const input=document.querySelector('#group-input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'先讨论这个项目的问题');input.dispatchEvent(new Event('input',{bubbles:true}));await wait(100);document.querySelector('[aria-label="发送消息"]').click();
  await until(()=>document.querySelector('.discussion-plan'));await until(()=>document.querySelector('.lane-decision'));
  assert(document.querySelector('.conversation-header').textContent.includes('讨论中'),'discussion badge missing');assert(document.querySelector('.lane-decision').textContent.includes('Mock 讨论回复'),'reply missing');
  assert(document.querySelector('[aria-label="讨论方案执行方式"]'),'execution mode missing');assert(![...document.querySelectorAll('button')].find(button=>button.textContent.includes('开始执行')).disabled,'execute button disabled');
  const screenshotReady={customModeMenu:true,slashMenu:true,slashKeyboard:true,discussOption:true,discussionBadge:true,decisionReply:true,planVisible:true,executionChoice:true};
  [...document.querySelectorAll('button')].find(button=>button.textContent.includes('开始执行')).click();await until(()=>!document.querySelector('.discussion-plan'));
  return screenshotReady;
 })()`);
 if(launches!==1)throw Error('Expected exactly one development dispatch');if(fs.readFileSync(path.join(project,'user.txt'),'utf8')!=='protected\n')throw Error('Fixture source modified');if(window.isVisible())throw Error('Fixture window became visible');
 fs.writeFileSync(path.join(data,'result.json'),JSON.stringify({...result,hidden:true,launches,sourceUnchanged:true},null,2));console.log(JSON.stringify({data,...result,hidden:true,launches}));window.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
