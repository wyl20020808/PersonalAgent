import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {_electron} from '../snake-validation/node_modules/playwright-core/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),report=JSON.parse(fs.readFileSync(path.join(root,'desktop/validation-v03e/latest-electron.json'))),baseline=path.join('D:/PersonalAgent-validation/v03e-before',randomUUID().slice(0,8));
fs.mkdirSync(path.join(baseline,'desktop/renderer'),{recursive:true});
for(const file of ['package.json','AGENT_WORK_RULES.md','PROJECT_EXECUTION_CONTRACT.md','AGENTS.md'])if(fs.existsSync(path.join(root,file)))fs.copyFileSync(path.join(root,file),path.join(baseline,file));
fs.copyFileSync(path.join(root,'desktop/package.json'),path.join(baseline,'desktop/package.json'));fs.cpSync(path.join(root,'dist'),path.join(baseline,'dist'),{recursive:true});fs.cpSync(path.join(root,'desktop/out'),path.join(baseline,'desktop/out'),{recursive:true});fs.cpSync(path.join(root,'desktop/src'),path.join(baseline,'desktop/src'),{recursive:true});fs.copyFileSync(path.join(root,'desktop/renderer/index.html'),path.join(baseline,'desktop/renderer/index.html'));fs.symlinkSync(path.join(root,'node_modules'),path.join(baseline,'node_modules'),'junction');fs.symlinkSync(path.join(root,'desktop/node_modules'),path.join(baseline,'desktop/node_modules'),'junction');
// Only renderer files are restored from the saved pre-edit source; Controller remains identical.
for(const file of ['App.tsx','GroupWorkspace.tsx'])fs.copyFileSync(path.join(root,'desktop/validation-v03e/baseline/desktop__src__'+file),path.join(baseline,'desktop/src',file));
for(const file of ['style.css','group.css'])fs.writeFileSync(path.join(baseline,'desktop/src',file),execFileSync('git',['show','7b398b0:desktop/src/'+file],{cwd:root,windowsHide:true}));
const {build}=await import('./node_modules/vite/dist/node/index.js');await build({root:path.join(baseline,'desktop/renderer'),base:'./',build:{outDir:'../out/renderer',emptyOutDir:true},cacheDir:path.join(baseline,'.vite-cache')});
const screenshots=[],errors=[];
for(const [name,appRoot] of [['before',baseline],['after',root]]){
 const data=path.join(root,'desktop/validation-v03e',name+'-comparison-data');fs.mkdirSync(data,{recursive:true});for(const file of ['profiles.json','sessions.json'])fs.copyFileSync(path.join(report.data,file),path.join(data,file));
 const env={...process.env,PERSONAL_AGENT_DESKTOP_DATA:data};delete env.ELECTRON_RUN_AS_NODE;const app=await _electron.launch({executablePath:path.join(appRoot,'desktop/node_modules/electron/dist/electron.exe'),args:[path.join(appRoot,'desktop')],env});
 try{const page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.group-workspace');const session=JSON.parse(fs.readFileSync(path.join(report.data,'sessions.json'))).find(s=>s.id===report.sessionId),run=session.runs.at(-1);
  await page.evaluate(({sessionId,runId})=>{localStorage.setItem('personalagent:last-session',sessionId);localStorage.setItem('personalagent:last-run',runId);},{sessionId:report.sessionId,runId:run.id});await page.reload();await page.waitForSelector('.role-codex');
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(1440,900);win.webContents.setZoomFactor(1);});
  if(name==='after')await page.waitForSelector('.event-group');const target=name==='after'?page.locator('.event-group').filter({hasText:'3 条命令'}).first():page.locator('.group-message').filter({hasText:'node verify-0.cjs'}).first();await target.evaluate(el=>el.scrollIntoView({block:'start'}));await page.waitForTimeout(250);
  const file=path.join(root,'desktop/validation-v03e',name+'-same-history-1440.png'),bytes=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));fs.writeFileSync(file,Buffer.from(bytes,'base64'));screenshots.push(file);
 }finally{await app.close();}
}
fs.writeFileSync(path.join(root,'desktop/validation-v03e/comparison-results.json'),JSON.stringify({baseline,sourceBaseline:'7b398b0 plus saved preexisting App/GroupWorkspace modifications',sameControllerRun:report.sessionId,screenshots,errors},null,2));console.log(JSON.stringify({screenshots,errors}));
