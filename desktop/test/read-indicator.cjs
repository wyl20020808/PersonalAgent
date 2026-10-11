const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
const output=path.resolve(__dirname,'../../.v3c3/read-indicator');
app.setPath('userData',path.join(output,'user-'+Date.now()));app.disableHardwareAcceleration();
const timer=setTimeout(()=>app.exit(1),30000);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1200,height:900,webPreferences:{offscreen:true,nodeIntegration:false,contextIsolation:true,sandbox:true}});
 await win.loadFile(path.join(output,'index.html'));
 await win.webContents.executeJavaScript(`(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(value,message)=>{if(!value)throw Error(message);};
  const until=async check=>{for(let i=0;i<150;i++){if(check())return;await wait(30);}throw Error('UI condition timeout');};
  const rows=()=>[...document.querySelectorAll('.session-row')],row=n=>rows().find(r=>r.textContent.includes('会话 '+n)),dot=n=>row(n)?.querySelector('.warning');
  await until(()=>rows().length===4);assert([0,1,2].every(dot),'initial attention missing');assert(row(3).querySelector('[aria-label="运行中"]'),'running indicator missing');
  row(0).querySelector('button').click();await until(()=>!dot(0));assert(dot(1)&&dot(2),'reading one chat cleared others');
  await wait(2300);assert(!dot(0),'polling restored read dot');assert(window.fixture.run.phase==='paused','reading changed task status');
  window.fixture.sessions[0].updatedAt='2026-10-11T01:00:00Z';await wait(2300);assert(!dot(0),'session metadata restored unchanged run alert');
  window.fixture.run.updatedAt='2026-10-11T02:00:00Z';await until(()=>dot(0));row(0).querySelector('button').click();await until(()=>!dot(0));
  for(const n of [1,2]){row(n).querySelector('button').click();await until(()=>!dot(n));}
  assert(row(3).querySelector('[aria-label="运行中"]'),'read action hid running status');
  // Restore fixture revision before reload so persistence tests the same event.
  window.fixture.run.updatedAt='2026-10-11T00:00:00.000Z';await until(()=>dot(0));row(0).querySelector('button').click();await until(()=>!dot(0));
 })()`);
 await win.loadFile(path.join(output,'index.html'));
 await win.webContents.executeJavaScript(`(async()=>{for(let i=0;i<150&&!document.querySelector('.session-row');i++)await new Promise(r=>setTimeout(r,30));if(document.querySelector('.session-state.warning'))throw Error('read state lost after reload');})()`);
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({clickClears:true,independentChats:true,pollingStable:true,newEventReappears:true,metadataDoesNotReopen:true,reloadPersists:true,runningPreserved:true,taskStatusUnchanged:true},null,2));
 clearTimeout(timer);win.destroy();app.quit();console.log('PASS: 8 read-indicator UI checks');
}).catch(error=>{console.error(error);app.exit(1);});
