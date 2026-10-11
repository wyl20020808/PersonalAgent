const {app,BrowserWindow}=require('electron');
const path=require('node:path'),fs=require('node:fs');
app.setPath('userData',path.join(__dirname,'preview-data'));
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const win=new BrowserWindow({title:'PersonalAgent · 独立分支 UI 预览',show:false,width:1200,height:900,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 await win.loadFile(path.join(__dirname,'index.html'),{query:{interactive:'1'}});
 win.show();
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));await wait(600);
 fs.writeFileSync(path.join(__dirname,'preview-running.png'),(await win.webContents.capturePage()).toPNG());
 await win.webContents.executeJavaScript("window.__test.update({phase:'stopped',active:false})");await wait(400);
 fs.writeFileSync(path.join(__dirname,'preview-paused.png'),(await win.webContents.capturePage()).toPNG());
 await win.webContents.executeJavaScript("window.__test.update({phase:'executing',active:true})");
 console.log('Independent preview ready; screenshots saved.');
});
app.on('window-all-closed',()=>app.quit());
