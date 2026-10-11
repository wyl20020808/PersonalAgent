// Isolated, invisible fixture. Gated mock responses prove acknowledgement and updates before completion.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),data=path.join(root,'.v3c3','discuss-stream-ui-'+randomUUID()),project=path.join(data,'project');
fs.mkdirSync(project,{recursive:true});fs.writeFileSync(path.join(project,'user.txt'),'protected\n');app.setPath('userData',path.join(data,'electron'));
app.whenReady().then(async()=>{
 const {build}=await import('esbuild'),{DesktopService}=await import('./out/service.js'),{Store}=await import('../dist/src/store.js'),{activityRecorder}=await import('../dist/src/telemetry.js');
 const output=path.join(data,'renderer');fs.mkdirSync(output,{recursive:true});
 await build({entryPoints:[path.join(__dirname,'discuss-preview.tsx')],bundle:true,format:'esm',outfile:path.join(output,'preview.js'),loader:{'.svg':'dataurl','.png':'dataurl','.woff':'file','.woff2':'file','.ttf':'file'},define:{'process.env.NODE_ENV':'"production"'}});
 fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><link rel="stylesheet" href="preview.css"><div id="root"></div><script type="module" src="preview.js"></script></html>');
 const service=new DesktopService(root,data,'C:/Program Files/nodejs/node.exe');let launches=0,calls=0,finish;service.launch=()=>{launches++;};
 const discuss=service.sessions.discuss.bind(service.sessions);
 service.sessions.discuss=async(session,message,text)=>{
  calls++;const reply=await discuss(session,message,text),saved=service.sessions.get(session.id),store=new Store(path.join(data,'conversation-discussions',session.id),saved.discussionStateId),record=activityRecorder(store.load(),store,'claude','fixture:'+calls,'plan');
  record({key:'read-start',kind:'tool',title:'Claude 工具 · Read',text:JSON.stringify({id:'fixture-read-'+calls,input:{file_path:'user.txt'}})});
  const fresh=service.sessions.get(session.id),target=fresh.messages.find(m=>m.id===message.id);target.discussionDraft='Mock 正在生成公开回复';target.discussionProgress='正在生成回复…';service.sessions.update(fresh);
  await new Promise(resolve=>{finish=resolve;});
  record({key:'read-result',kind:'tool',title:'Claude 工具结果',text:JSON.stringify({tool_use_id:'fixture-read-'+calls,is_error:false,content:'protected'})});
  return {...reply,reply:String.raw`Mock 完整回复

| 场景 | 状态 |
| --- | --- |
| 测试 | 已检查 |

行内公式 $x^2$。

$$
\frac{1}{2}+x
$$

- **粗体**、列表与代码：

\`\`\`ts
const n = 1;
\`\`\`
`.replace(/\\`/g,'`')};
 };
 const window=new BrowserWindow({show:false,width:1100,height:950,webPreferences:{offscreen:true,backgroundThrottling:false,preload:path.join(__dirname,'out/preload.cjs'),contextIsolation:true,nodeIntegration:false}});
 ipcMain.handle('personalagent:request',async(event,request)=>{if(event.sender!==window.webContents)throw Error('Unknown fixture sender');if(request.operation==='fixtureFinish'){finish();return {};}if(request.operation==='fixtureCapture'){fs.writeFileSync(path.join(data,'discussion.png'),(await window.capturePage()).toPNG());return {};}return service.dispatch({...request,...(request.operation==='executeDiscussion'?{directAcknowledged:true}:{})});});
 ipcMain.handle('personalagent:subscribe',()=>({subscribed:false}));ipcMain.handle('personalagent:unsubscribe',()=>({unsubscribed:true}));
 await window.loadFile(path.join(output,'index.html'),{query:{project}});
 const result=await window.webContents.executeJavaScript(`(async()=>{
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),assert=(value,message)=>{if(!value)throw Error(message);};
  const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await wait(100);}throw Error('UI timed out');};
  await until(()=>document.querySelector('[aria-label="新会话工作方式"]'));document.querySelector('[aria-label="新会话工作方式"]').click();await until(()=>document.querySelector('[data-mode="discuss"]'));document.querySelector('[data-mode="discuss"]').click();
  const input=()=>document.querySelector('#group-input'),setText=text=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input(),text);input().dispatchEvent(new Event('input',{bubbles:true}));};
  setText('第一轮');await wait(100);document.querySelector('[aria-label="发送消息"]').click();
  await until(()=>document.querySelector('.lane-user'));await until(()=>document.querySelector('.lane-decision'));await until(()=>!input().disabled);
  assert(input().value==='','sent input did not clear');assert(!document.querySelector('.composer-progress'),'submission blocked waiting for model');assert(document.querySelector('.lane-decision').textContent.includes('Mock 正在生成'),'draft not visible before completion');
  await until(()=>document.querySelector('.compact-event-group.lane-decision'));assert(document.querySelector('.compact-event-group').textContent.includes('查看了文件'),'decision tools not compact');
  setText('第二轮');await wait(100);document.querySelector('[aria-label="发送消息"]').click();await until(()=>[...document.querySelectorAll('.lane-user')].some(node=>node.textContent.includes('第二轮')));assert(!input().disabled,'continuation blocked input');
  await window.personalAgent.invoke({operation:'fixtureFinish'});await until(()=>document.querySelector('.markdown-table-scroll table'));await until(()=>[...document.querySelectorAll('.lane-decision')].some(node=>node.textContent.includes('Mock 正在生成')));
  await window.personalAgent.invoke({operation:'fixtureFinish'});await until(()=>![...document.querySelectorAll('.kind-discussion')].some(node=>node.classList.contains('status-running')));
  assert(document.querySelector('.markdown-table-scroll th').textContent==='场景','GFM table missing');assert(document.querySelector('.katex-display .katex'),'display formula missing');assert(document.querySelector('.katex'),'inline formula missing');assert(document.querySelector('pre code'),'code block missing');
  await wait(400);await window.personalAgent.invoke({operation:'fixtureCapture'});
  const execute=[...document.querySelectorAll('button')].find(button=>button.textContent.includes('开始执行'));assert(!execute.disabled,'execution did not unlock');execute.click();await until(()=>!document.querySelector('.discussion-plan'));
  return {ackBeforeReply:true,inputCleared:true,continuationQueued:true,draftBeforeCompletion:true,decisionToolsCompact:true,gfmTable:true,inlineMath:true,displayMath:true,codeBlock:true};
 })()`);
 if(calls!==2||launches!==1)throw Error('Expected two ordered calls and one execution');if(window.isVisible())throw Error('Fixture became visible');if(fs.readFileSync(path.join(project,'user.txt'),'utf8')!=='protected\n')throw Error('Source changed');
 fs.writeFileSync(path.join(data,'result.json'),JSON.stringify({...result,hidden:true,calls,launches},null,2));fs.writeFileSync(path.join(data,'final.png'),(await window.capturePage()).toPNG());console.log(JSON.stringify({data,...result,hidden:true,calls,launches}));window.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
