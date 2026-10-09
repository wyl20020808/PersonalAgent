import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const defaultRoot=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const mainRoot=process.env.PA_SMOKE_MAIN_ROOT??defaultRoot,devRoot=process.env.PA_SMOKE_DEV_ROOT??defaultRoot;
const directory=path.join('D:/PersonalAgent-validation/dual-instance-runtime-v1','smoke-'+randomUUID().slice(0,8));fs.mkdirSync(directory,{recursive:true});
const {_electron}=await import(pathToFileURL('D:/PersonalAgent/snake-validation/node_modules/playwright-core/index.mjs').href);
const checks=[],instances={},errors=[],apps=[],history='D:/PersonalAgent/.desktop-data';
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const protectedFiles=['sessions.json','profiles.json','user-actions.jsonl'].map(f=>path.join(history,f)).filter(f=>fs.existsSync(f));
const before=Object.fromEntries(protectedFiles.map(f=>[f,digest(f)]));
const call=(page,request)=>page.evaluate(r=>window.personalAgent.invoke(r),request);
async function launch(id,root){
 const data=path.join(directory,id);fs.mkdirSync(data,{recursive:true});
 if(id==='main')for(const name of ['sessions.json','profiles.json'])if(fs.existsSync(path.join(history,name)))fs.copyFileSync(path.join(history,name),path.join(data,name));
 const env={...process.env,PERSONALAGENT_INSTANCE:id,PERSONAL_AGENT_DESKTOP_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:path.join(root,'desktop/node_modules/electron/dist/electron.exe'),args:[path.join(root,'desktop')],env,timeout:30000});apps.push(app);
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.side-head');
 await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.show();});
 const info=await app.evaluate(({app,BrowserWindow})=>({pid:process.pid,userData:app.getPath('userData'),sessionData:app.getPath('sessionData'),title:BrowserWindow.getAllWindows()[0].getTitle(),visible:BrowserWindow.getAllWindows()[0].isVisible(),instanceId:process.env.PERSONALAGENT_INSTANCE,cache:process.env.npm_config_cache,temp:process.env.TEMP}));
 assert.equal(info.instanceId,id);assert.equal(info.title,'PersonalAgent '+id.toUpperCase());assert.equal(info.visible,true);assert.ok(info.userData.toLowerCase().startsWith(data.toLowerCase().replaceAll('/','\\')));assert.match(await page.locator('.side-head').innerText(),new RegExp(id.toUpperCase()));
 const overview=await call(page,{operation:'overview'});assert.equal(overview.paths.instanceId,id);assert.equal(path.resolve(overview.paths.controller),path.resolve(root));
 await app.evaluate(({dialog},prefix)=>{dialog.showMessageBox=async(_window,options)=>{if(options.message==='Agent 将直接修改会话项目目录'&&options.detail.startsWith(prefix))return {response:1};throw Error('Unexpected native approval during Mock-only Smoke: '+options.message);};},directory);
 instances[id]={...info,data,root};checks.push(id+' actual visible Electron window, title, IPC and isolated paths');return {app,page};
}
async function mock(page,id){
 const project=path.join(directory,'project-'+id);fs.mkdirSync(project,{recursive:true});fs.writeFileSync(path.join(project,'user.txt'),'preserved');
 const session=await call(page,{operation:'createSession',projectPath:project,mode:'mock',projectMode:'direct',maxClaudeCalls:5,maxLoops:4,maxReworks:1});
 await call(page,{operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'本地双实例 Mock 验证',directAcknowledged:true});
 let detail;for(let i=0;i<300;i++){detail=await call(page,{operation:'sessionDetail',sessionId:session.id});const run=detail.runs.at(-1);if(run&&!run.active&&['completed','failed','paused','stopped'].includes(run.phase))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(detail.runs.at(-1)?.phase,'completed');assert.equal(detail.runs.at(-1).mode,'mock');assert.equal(detail.runs.at(-1).claudeCalls,0);assert.equal(fs.readFileSync(path.join(project,'user.txt'),'utf8'),'preserved');
 instances[id].sessionId=session.id;instances[id].runId=detail.runs.at(-1).id;checks.push(id+' local session completes official Mock Controller Run');return detail;
}
try{
 const main=await launch('main',mainRoot),dev=await launch('dev',devRoot);
 assert.notEqual(instances.main.pid,instances.dev.pid);assert.notEqual(instances.main.userData,instances.dev.userData);assert.notEqual(instances.main.sessionData,instances.dev.sessionData);
 const old=JSON.parse(fs.readFileSync(path.join(history,'sessions.json'),'utf8'));const historic=await call(main.page,{operation:'sessions'});for(const s of old){const detail=await call(main.page,{operation:'sessionDetail',sessionId:s.id});assert.equal(detail.session.id,s.id);}checks.push('historical MAIN sessions and runs readable from protected copy');instances.main.historicalSessions=old.length;
 await Promise.all([mock(main.page,'main'),mock(dev.page,'dev')]);
 for(const [id,other,page] of [['main','dev',main.page],['dev','main',dev.page]]){const list=await call(page,{operation:'sessions'});assert.ok(list.some(s=>s.id===instances[id].sessionId));assert.ok(!list.some(s=>s.id===instances[other].sessionId));const overview=await call(page,{operation:'overview'});assert.ok(!overview.runs.some(r=>r.id===instances[other].runId));}
 checks.push('sessions and runs do not cross instances; independent projects run concurrently');
 for(const [id,app] of [['main',main.app],['dev',dev.app]]){const png=await app.evaluate(async({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.show();return (await window.webContents.capturePage()).toPNG().toString('base64');});assert.ok(png.length>100);fs.writeFileSync(path.join(directory,id+'.png'),Buffer.from(png,'base64'));}
 await main.app.close();apps.splice(apps.indexOf(main.app),1);assert.equal((await call(dev.page,{operation:'sessionDetail',sessionId:instances.dev.sessionId})).session.id,instances.dev.sessionId);assert.equal(await dev.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),true);checks.push('normal MAIN exit leaves DEV window and IPC usable');
 await dev.app.close();apps.splice(apps.indexOf(dev.app),1);checks.push('both test instances exit normally; separate window states saved');
 for(const [f,hash] of Object.entries(before))assert.equal(digest(f),hash);checks.push('original MAIN profiles, sessions and user actions hashes unchanged');
}catch(error){errors.push(error.stack??error.message);process.exitCode=1;}
finally{for(const app of apps)await app.close().catch(e=>errors.push(e.message));const result={directory,instances,checks,errors,actualPaidCalls:0,passed:errors.length===0};fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
