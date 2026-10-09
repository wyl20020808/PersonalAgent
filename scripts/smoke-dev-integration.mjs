// Electron smoke uses a separate DEV-owned data directory and never sends a development goal.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const evidence=path.join('D:/PersonalAgent-data/dev-integration-v1','electron-'+randomUUID().slice(0,8));
const project=path.join(evidence,'project');fs.mkdirSync(project,{recursive:true});
fs.writeFileSync(path.join(project,'user.txt'),'Preserve smoke content\n');
const {_electron}=await import(pathToFileURL('D:/PersonalAgent/snake-validation/node_modules/playwright-core/index.mjs').href);
const env={...process.env,PERSONALAGENT_INSTANCE:'dev',PERSONAL_AGENT_DESKTOP_DATA:path.join(evidence,'data'),PERSONAL_AGENT_OPENCODE_RUNTIME_DIR:path.join(evidence,'opencode-v1'),PERSONAL_AGENT_OPENCODE_EXECUTABLE:'D:/PersonalAgent-data/opencode-compatibility-v1/toolchain/node_modules/opencode-windows-x64/bin/opencode.exe'};
delete env.ELECTRON_RUN_AS_NODE;
const result={root,evidence,checks:[],errors:[],remoteModelRequests:0};let app;
try{
 app=await _electron.launch({executablePath:process.env.PERSONAL_AGENT_ELECTRON??path.join(root,'desktop/node_modules/electron/dist/electron.exe'),args:[path.join(root,'desktop')],env,timeout:30000});
 const page=await app.firstWindow();page.on('pageerror',e=>result.errors.push(e.message));
 await page.waitForSelector('.group-workspace');
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle()),'PersonalAgent DEV');
 assert.equal(await page.getByLabel('新会话运行模式',{exact:true}).inputValue(),'real');
 result.checks.push('Actual DEV Electron window and default Real renderer');
 const invoke=(request)=>page.evaluate(r=>window.personalAgent.invoke(r),request);
 const overview=await invoke({operation:'overview'});assert.equal(overview.paths.instanceId,'dev');assert.equal(overview.paths.data,env.PERSONAL_AGENT_DESKTOP_DATA);
 const session=await invoke({operation:'createSession',projectPath:project});assert.equal(session.settings.mode,'real');assert.equal(session.settings.decisionAgent.backend,'claude-code');assert.equal(session.runs.length,0);
 const mock=await invoke({operation:'createSession',projectPath:project,mode:'mock'});assert.equal(mock.settings.mode,'mock');assert.equal(mock.mockExplicit,true);
 result.checks.push('IPC session default Real/Claude Code; explicit Mock stored; no goals sent');
 const discovery=await invoke({operation:'decisionModels',projectPath:project});
 assert.equal(discovery.available,true,discovery.reason);assert.ok(discovery.providers.length);
 result.discovery={available:discovery.available,providers:discovery.providers.map(p=>({id:p.id,models:p.models.map(m=>({id:m.id,capabilities:m.capabilities}))}))};
 result.checks.push('Actual V1 CLI dynamic Provider/Model discovery without Prompt');
 assert.equal((await invoke({operation:'overview'})).runs.length,0);
 assert.equal(fs.readFileSync(path.join(project,'user.txt'),'utf8'),'Preserve smoke content\n');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:path.join(evidence,'dev-smoke.png')});
 result.checks.push('No Run launched; project preserved; no horizontal overflow');
 assert.deepEqual(result.errors,[]);result.passed=true;
}catch(error){result.errors.push(error.stack??error.message);result.passed=false;process.exitCode=1;}
finally{if(app)await app.close();fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
