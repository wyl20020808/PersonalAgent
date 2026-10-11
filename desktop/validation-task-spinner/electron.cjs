const {app,BrowserWindow,ipcMain,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const directory=__dirname,data=path.join(directory,'electron-data');
app.setPath('userData',data);
app.setPath('sessionData',path.join(data,'session'));
app.setPath('crashDumps',path.join(data,'crash-dumps'));
app.setAppLogsPath(path.join(data,'logs'));
app.disableHardwareAcceleration();
let status='executing',reducedMotion=false,win;
const errors=[];
const timeout=setTimeout(()=>{console.error('Electron verification timeout');app.exit(1);},45000);
const invoke=request=>{
 if(request.operation==='overview')return {profiles:[],runs:[],warnings:[],paths:{controller:'D:/Preview',data,node:'node'},reducedMotion,recentProjects:[]};
 if(request.operation==='sessions')return [{id:'spinner-preview',title:'运行中的任务',manualTitle:true,projectPath:'D:/Preview',projectName:'PersonalAgent',status,runs:[],messages:[],legacy:true,lastMessage:'',createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z',settings:{mode:'real',projectMode:'isolated',maxClaudeCalls:5,maxLoops:8,maxReworks:1},budget:{claudeUsed:0,loopsUsed:0,claudeRemaining:5,loopsRemaining:8},selectedTests:[],directAuthorized:false}];
 if(['decisionModels','executionModels'].includes(request.operation))return {available:false,providers:[]};
 if(request.operation==='sessionDetail')return {session:invoke({operation:'sessions'})[0],runs:[]};
 errors.push('Unexpected preview operation: '+request.operation);
 throw Error('Unexpected preview operation: '+request.operation);
};
ipcMain.handle('spinner-preview',(_event,request)=>invoke(request));
app.whenReady().then(async()=>{
 session.defaultSession.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
 win=new BrowserWindow({show:false,width:1200,height:800,webPreferences:{offscreen:true,preload:path.join(directory,'electron-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
 win.webContents.on('render-process-gone',(_event,details)=>errors.push(details.reason));
 const execute=code=>win.webContents.executeJavaScript(code);
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const until=async expression=>{for(let i=0;i<150;i++){if(await execute(expression))return;await wait(30);}throw Error('Condition timed out: '+expression);};
 await win.loadFile(path.resolve(directory,'../out/renderer/index.html'));
 await until('Boolean(document.querySelector(".session-spinner"))');
 await execute('document.querySelector(".session-row>button").click()');
 await until('Boolean(document.querySelector(".session-row>button.selected"))');
 await execute('document.querySelector(".session-spinner").getAnimations().forEach(animation=>animation.play())');
 const before=await execute('getComputedStyle(document.querySelector(".session-spinner")).transform');
 await wait(240);
 const after=await execute('getComputedStyle(document.querySelector(".session-spinner")).transform');
 assert.notEqual(before,after,'Electron must animate spinner');
 fs.writeFileSync(path.join(directory,'electron-selected.png'),(await win.webContents.capturePage()).toPNG());
 for(const [phase,label] of Object.entries({planning:'规划中',execute:'准备执行',executing:'执行中',applying:'应用提案',verify:'独立验证',review:'审查中'})){
  status=phase;
  await until(`document.querySelector('.session-row>button').title.includes(${JSON.stringify(label)})`);
  assert.equal(await execute('document.querySelectorAll(".session-spinner").length'),1);
 }
 reducedMotion=true;
 await until('getComputedStyle(document.querySelector(".session-spinner")).animationName==="none"');
 reducedMotion=false;
 for(const phase of ['paused','failed','stopped']){
  status=phase;
  await until('Boolean(document.querySelector(".session-state.warning"))');
  assert.equal(await execute('document.querySelectorAll(".session-spinner").length'),0);
 }
 status='completed';
 await until('document.querySelector(".session-state")===null');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(directory,'electron-result.json'),JSON.stringify({passed:true,electron:process.versions.electron,isolatedData:data,offscreen:true,realBuiltRenderer:true,fixtureBridge:true,selectedRow:true,rotation:true,activeStates:6,attentionStates:3,completed:true,appReducedMotion:true,errors},null,2));
 console.log('PASS: isolated Electron renderer, rotating spinner, selection, states and reduced motion');
 clearTimeout(timeout);win.destroy();app.quit();
}).catch(error=>{console.error(error);clearTimeout(timeout);app.exit(1);});
