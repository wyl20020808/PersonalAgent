// Real Electron geometry in an isolated, invisible window; no user windows or display settings change.
const {app,BrowserWindow,screen}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const output=path.resolve(__dirname,'../.validation/window-placement');
fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'electron-data'));app.disableHardwareAcceleration();
const timeout=setTimeout(()=>{console.error('Window placement probe timeout');app.exit(1);},20000);
app.whenReady().then(async()=>{
 const {restoreWindowBounds,ensureWindowOnDisplay,watchWindowDisplays}=await import(pathToFileURL(path.join(__dirname,'out/windowPlacement.js')).href);
 const displays=screen.getAllDisplays().map(display=>({id:display.id,bounds:display.bounds,workArea:display.workArea,scaleFactor:display.scaleFactor}));
 const primary=screen.getPrimaryDisplay().workArea,areas=displays.map(display=>display.workArea);
 const file='D:/PersonalAgent-data/instances/test/window.json';
 const saved=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 const restored=restoreWindowBounds(saved,areas,primary);
 const inside=bounds=>areas.some(area=>bounds.x>=area.x&&bounds.y>=area.y&&bounds.x+bounds.width<=area.x+area.width&&bounds.y+bounds.height<=area.y+area.height);
 assert.ok(inside(restored),'saved TEST window did not fit a current display');
 const window=new BrowserWindow({...restored,show:false,minWidth:Math.min(1024,restored.width),minHeight:Math.min(680,restored.height),webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 assert.ok(inside(window.getBounds()),'Electron startup geometry is invisible');
 const startup=window.getBounds();watchWindowDisplays(window,screen);
 const cases=[];
 for(const event of ['display-added','display-removed','display-metrics-changed']){
  window.setBounds({x:90000,y:90000,width:1440,height:900});
  const before=window.getBounds();screen.emit(event);
  const after=window.getBounds();assert.ok(inside(after),'Electron '+event+' recovery failed');assert.equal(window.isVisible(),false,'probe must never show a window');cases.push({event,before,after});
 }
 window.setBounds({x:90000,y:90000,width:1440,height:900});ensureWindowOnDisplay(window,screen);assert.ok(inside(window.getBounds()),'second-launch helper recovery failed');
 const evidence={kind:'real Electron, current physical displays, invisible isolated probe',displays,primary,savedTestBounds:saved,restoredTestBounds:restored,startupBounds:startup,cases,secondLaunchRecovery:true,passed:true};
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 window.destroy();clearTimeout(timeout);app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
