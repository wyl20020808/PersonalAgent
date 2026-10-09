import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Run only against a separately built preview copy, never MAIN/DEV or feature build output.
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
if(!root.toLowerCase().startsWith('d:\\pa-dap\\'))throw Error('Use the external acceptance preview copy');
const directory=`D:/PersonalAgent-data/decision-agent-providers-v1/electron-${randomUUID().slice(0,8)}`;
const project=path.join(directory,'project');fs.mkdirSync(project,{recursive:true});
fs.writeFileSync(path.join(project,'user.txt'),'Preserve user content\n');
const {_electron}=await import(pathToFileURL(process.env.PERSONAL_AGENT_PLAYWRIGHT??'D:/PersonalAgent/snake-validation/node_modules/playwright-core/index.mjs').href);
const executablePath=process.env.PERSONAL_AGENT_ELECTRON??path.join(root,'desktop/node_modules/electron/dist/electron.exe');
const env={...process.env,PERSONAL_AGENT_DESKTOP_DATA:path.join(directory,'data'),TEMP:path.join(directory,'tmp'),TMP:path.join(directory,'tmp')};delete env.ELECTRON_RUN_AS_NODE;
fs.mkdirSync(env.TEMP,{recursive:true});
const discoveryFile=path.join(directory,'discovery.json'),bootstrap=path.join(directory,'preview.mjs');
fs.writeFileSync(discoveryFile,JSON.stringify({available:true,reason:'',providers:[{id:'mock-provider-a',name:'Dynamic fixture Provider A',models:[{id:'mock-model-a',name:'Dynamic fixture Model A',capabilities:{tools:true,structuredOutput:true}}]},{id:'mock-provider-b',name:'Dynamic fixture Provider B',models:[{id:'mock-model-b',name:'Dynamic fixture Model B',capabilities:{tools:true,structuredOutput:true}}]}]}));
fs.writeFileSync(bootstrap,`import fs from 'node:fs';\nimport {DesktopService} from ${JSON.stringify(pathToFileURL(path.join(root,'desktop/out/service.js')).href)};\nDesktopService.prototype.decisionModels=async()=>JSON.parse(fs.readFileSync(${JSON.stringify(discoveryFile)},'utf8'));\nawait import(${JSON.stringify(pathToFileURL(path.join(root,'desktop/out/main.js')).href)});\n`);
let app;const checks=[],screenshots=[],errors=[];
try{
 app=await _electron.launch({executablePath,args:[bootstrap],env,timeout:30000});
 const page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.group-workspace');
 await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});dialog.showMessageBox=async(_window,options)=>{if(!options.message.includes('直接修改会话项目目录'))throw Error('Only this new Mock fixture is authorized');return {response:1};};},project);
 await page.getByRole('button',{name:'选择工作文件夹',exact:true}).click();
 const decision=page.getByLabel('决策 Agent',{exact:true});assert.equal(await decision.inputValue(),'claude-code');
 await decision.selectOption('opencode');await page.getByLabel('OpenCode Provider',{exact:true}).selectOption('mock-provider-b');await page.getByLabel('OpenCode Model',{exact:true}).selectOption('mock-model-b');
 assert.equal(await page.getByLabel('OpenCode Provider',{exact:true}).locator('option').count(),3);
 await page.locator('#group-input').fill('确定性 Mock：检查动态决策后端配置');assert.equal(await page.getByRole('button',{name:'发送需求',exact:true}).isEnabled(),true);
 const selected=path.join(directory,'selected.png');await page.screenshot({path:selected});screenshots.push(selected);checks.push('动态下拉与有效选择可发送');
 fs.writeFileSync(discoveryFile,JSON.stringify({available:false,reason:'Mock structured interface unavailable',providers:[]}));
 await page.getByRole('button',{name:'刷新模型',exact:true}).click();await page.getByRole('status').filter({hasText:'Mock structured interface unavailable'}).waitFor();assert.equal(await page.getByRole('button',{name:'发送需求',exact:true}).isDisabled(),true);
 const unavailable=path.join(directory,'unavailable.png');await page.screenshot({path:unavailable});screenshots.push(unavailable);checks.push('不可用原因显示并阻止发送');
 await decision.selectOption('claude-code');await page.getByRole('button',{name:'发送需求',exact:true}).click();
 await page.waitForFunction(async()=>{const sessions=await window.personalAgent.invoke({operation:'sessions'});const session=sessions.find(s=>s.status==='completed');if(!session)return false;const detail=await window.personalAgent.invoke({operation:'sessionDetail',sessionId:session.id});return detail.runs.every(run=>!run.active);},null,{timeout:60000});
 const sessions=await page.evaluate(()=>window.personalAgent.invoke({operation:'sessions'}));assert.equal(sessions.length,1);assert.equal(sessions[0].settings.decisionAgent.backend,'claude-code');
 const detail=await page.evaluate(sessionId=>window.personalAgent.invoke({operation:'sessionDetail',sessionId}),sessions[0].id);assert.equal(detail.runs[0].mode,'mock');assert.equal(detail.runs[0].decisionAgent.backend,'claude-code');assert.equal(fs.readFileSync(path.join(project,'user.txt'),'utf8'),'Preserve user content\n');checks.push('切回 Claude 默认并完成正式 Controller Mock Run');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks.push('窗口无横向溢出');
 const completed=path.join(directory,'completed.png');await page.screenshot({path:completed});screenshots.push(completed);
 assert.deepEqual(errors,[]);
}catch(error){errors.push(error.stack??error.message);process.exitCode=1;}finally{
 if(app){const pid=app.process().pid;if(pid)spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await app.close();}
 const result={directory,previewRoot:root,checks,screenshots,errors,paidCalls:0,discovery:'Explicitly injected Mock discovery; no real prompt',teardown:'Owned preview process tree terminated with taskkill /T /F',pixelInspection:'Pending separate image read',passed:errors.length===0};
 fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
