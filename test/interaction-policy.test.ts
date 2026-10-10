import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { interactionPolicyContext, readInteractionPolicy, writeUserInteractionMode, decideOperation, watchInteractionPolicy } from '../src/interaction-policy.js';
import { runProcess } from '../src/process.js';
import { runCodexTurn } from '../src/native-agent.js';
import { startOpencodeService } from '../src/opencode-decision-agent.js';
import { opencodeEnvironment } from '../src/opencode-runtime.js';
import { applyEdits, runAcceptanceProcess } from '../src/workspace.js';
import { hookDecision } from '../scripts/codex-interaction-hook.js';
import { InteractionPolicyPlugin } from '../scripts/opencode-interaction-plugin.js';
import { createRun, drive } from '../src/controller.js';
import { RealAgents } from '../src/real-agents.js';

const root = fs.mkdtempSync(path.join('D:/', 'pa-mode-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const file = path.join(root, 'policy.json');
const scoped = (operation: () => Promise<void> | void) => interactionPolicyContext.run(file, operation);
const wait = (ms=160) => new Promise(resolve => setTimeout(resolve, ms));
function childFixture() { return Object.assign(new EventEmitter(), { pid: 123456789, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() }); }
const audit = (store: any) => fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
async function fixture(name: string, tests: any[] = [{ executable: process.execPath, args: ['-e','console.log("safe acceptance")'] }]) {
  const project=path.join(root,name);fs.mkdirSync(project);fs.writeFileSync(path.join(project,'source.ts'),'export const seed = 0;\n');
  const config:any={allowedRepositories:[project],runtimeDir:path.join(root,name+'-runtime'),projectMode:'direct',executionMode:'native',directAuthorization:{projectPath:project,acknowledgedAt:new Date().toISOString()},mode:'real',claudeExecutable:'NEVER-PAID',claudeStreaming:false,timeoutMs:4000,maxLoops:8,maxReworks:0,tests,mockScenario:'pass'};
  return {project,config,store:await createRun(config,project,'local fixture, no paid provider')};
}
test('invalid policy defaults work; atomic user write',()=>scoped(()=>{
  assert.equal(readInteractionPolicy().mode,'work');
  for(const text of ['{','null','{"version":2,"mode":"idle"}','{"version":1,"mode":"other"}']) {fs.writeFileSync(file,text);assert.equal(readInteractionPolicy().mode,'work');}
  writeUserInteractionMode('idle');assert.equal(readInteractionPolicy().mode,'idle');writeUserInteractionMode('work');assert.equal(fs.readdirSync(root).filter(name=>name.endsWith('.tmp')).length,0);
}));
test('ordinary unknown CLI, Node/Python, Git/npm are permitted without fixed whitelist',()=>scoped(()=>{
  writeUserInteractionMode('work');
  for(const command of ['npm test','npm run build','npm run check','pytest','python app.py','node service.js','git add .','git commit -m approved','my-project-compiler --check','cmd /d /c npm test','powershell -Command "node app.js"']) assert.equal(decideOperation({command,cwd:root}).action,'allow',command);
  assert.equal(decideOperation({kind:'model',command:'prompt mentions shutdown'}).action,'allow');
  for(const cwd of [process.cwd(),path.join(process.cwd(),'desktop')]) assert.equal(decideOperation({command:'npm run build',cwd}).action,'allow',cwd);
}));
test('desktop/system/stress requests never reach fake spawn; idle does not authorize system actions',()=>scoped(async()=>{
  writeUserInteractionMode('work');let spawned=0;
  const requests:[string,string[]][]=[['mouse.exe',['SetCursorPos']],['keyboard.exe',['SendInput']],['node',['-e','ClipCursor()']],['cmd.exe',['/c','echo SetForegroundWindow']],['powershell.exe',['-Command','Set-Clipboard x']],['chrome.exe',['--app=http://localhost']],['shutdown.exe',['/r']],['shutdown.exe',['/s']],['logoff.exe',[]],['reg.exe',['add','HKLM\\mock']],['node',['-e','ChangeDisplaySettings()']],['python',['-c','pyautogui.click()']],['benchmark',[]],['stress-ng',[]]];
  for(const [program,args]of requests) await assert.rejects(runProcess(program,args,{cwd:root,timeoutMs:1000},(()=>{spawned++;throw Error('must not spawn');}) as any),/deferred_by_work_mode|requires_system_authorization/);
  writeUserInteractionMode('idle');await assert.rejects(runProcess('shutdown.exe',['/r'],{cwd:root,timeoutMs:1000},(()=>{spawned++;throw Error('must not spawn');}) as any),/requires_system_authorization/);assert.equal(spawned,0);
}));
test('literal script chain, npm lifecycle and encoded command inspected before launch',()=>scoped(()=>{
  writeUserInteractionMode('work');const dir=path.join(root,'wrappers');fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir,'outer.js'),'require("child_process").spawn("python", ["inner.py"])');fs.writeFileSync(path.join(dir,'inner.py'),'import pyautogui; pyautogui.click()');
  assert.equal(decideOperation({executable:'node',args:['outer.js'],cwd:dir}).action,'defer');
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{test:'node safe.js',pretest:'shutdown.exe /r'}}));assert.equal(decideOperation({command:'npm test',cwd:dir}).action,'deny');
  assert.equal(decideOperation({executable:'node',args:['npm-cli.js','test'],cwd:dir}).action,'deny');
  fs.writeFileSync(path.join(dir,'source.ts'),'// GUI application source, only a build input\nSetCursorPos(1, 1)');
  fs.writeFileSync(path.join(dir,'build.cjs'),'require("fs").readFileSync("source.ts"); console.log("background build")');
  fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{build:'node build.cjs'}}));
  assert.equal(decideOperation({command:'npm run build',cwd:dir}).action,'allow');
  assert.equal(decideOperation({command:'tsc source.ts --noEmit',cwd:dir}).action,'allow');
  assert.equal(decideOperation({command:'powershell -EncodedCommand '+Buffer.from('Restart-Computer','utf16le').toString('base64')}).action,'deny');
}));
test('real work-mode editing, Node/Python, npm build/test and Git mutations succeed in isolated project',()=>scoped(async()=>{
  writeUserInteractionMode('work');const dir=path.join(root,'ordinary');fs.mkdirSync(dir);applyEdits(dir,{summary:'edit',changes:[{path:'source.js',content:'export const value = 1;\n'}]});
  assert.equal((await runProcess(process.execPath,['-e','console.log("background")'],{cwd:dir,timeoutMs:4000})).exitCode,0);
  assert.equal((await runProcess('python',['-c','print("background")'],{cwd:dir,timeoutMs:4000})).exitCode,0);
  fs.writeFileSync(path.join(dir,'build.cjs'),'require("fs").writeFileSync("built.txt","ok")');fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{build:'node build.cjs',test:'node -e "require(\'assert\').equal(1+1,2)"'}}));
  const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');for(const args of [['run','build'],['test']])assert.equal((await runProcess(process.execPath,[npm,...args],{cwd:dir,timeoutMs:8000})).exitCode,0);
  for(const args of [['init'],['add','.'],['-c','core.hooksPath=NUL','-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','approved local fixture'],['status','--porcelain'],['diff']])assert.equal((await runProcess('git',args,{cwd:dir,timeoutMs:4000})).exitCode,0);
}));
test('confirmed isolated headless launcher runs; headed/unknown/CDP defers',()=>scoped(async()=>{
  writeUserInteractionMode('work');let calls=0;const child=childFixture();const pending=runProcess('browser-test',[],{cwd:root,timeoutMs:1000,interaction:{kind:'browser',headless:true,isolatedBrowser:true}},(()=>{calls++;return child;}) as any);child.emit('close',0);assert.equal((await pending).exitCode,0);assert.equal(calls,1);
  for(const headless of [undefined,false])await assert.rejects(runProcess('browser-test',[],{cwd:root,timeoutMs:1000,interaction:{kind:'browser',headless}},(()=>{throw Error('must not launch');}) as any),/deferred_by_work_mode/);
  assert.equal(decideOperation({command:'node -e "connectOverCDP()"',kind:'browser',headless:true,isolatedBrowser:true}).action,'defer');
}));
test('idle to work cancels only owned GUI, safe build continues; no unrelated PID killed',()=>scoped(async()=>{
  writeUserInteractionMode('idle');const gui=childFixture(),safe=childFixture();safe.pid=987654321;const killed:number[]=[];const terminate=async(pid:number)=>{killed.push(pid);gui.emit('close',0);};
  const interactive=runProcess('fake-gui',[],{cwd:root,timeoutMs:2000,interaction:{kind:'desktop'}},(()=>gui) as any,terminate);const rejected=assert.rejects(interactive,/deferred_by_work_mode/);
  const background=runProcess('ordinary-build',[],{cwd:root,timeoutMs:2000},(()=>safe) as any,terminate);writeUserInteractionMode('work');await rejected;await wait();assert.deepEqual(killed,[gui.pid]);safe.emit('close',0);assert.equal((await background).exitCode,0);
}));
test('SDK inference survives mode switch and completes on same thread',()=>scoped(async()=>{
  writeUserInteractionMode('idle');let ready!:()=>void,finish!:()=>void;const started=new Promise<void>(resolve=>ready=resolve),release=new Promise<void>(resolve=>finish=resolve);let aborted=false;
  const thread={async runStreamed(_prompt:string,options:any){options.signal.addEventListener('abort',()=>aborted=true);return{events:(async function*(){ready();await release;yield{type:'item.completed',item:{type:'agent_message',text:'verified fixture'}};yield{type:'turn.completed'};})()};}};
  const pending=runCodexTurn({resumeThread:()=>thread} as any,{workspace:root,threadId:'existing-thread',prompt:'mock'},()=>{});await started;writeUserInteractionMode('work');await wait();assert.equal(aborted,false);finish();assert.equal((await pending as any).summary,'verified fixture');
}));
test('RealAgents and Controller finish Plan Execute Review in work with fake providers and real acceptance',()=>scoped(async()=>{
  writeUserInteractionMode('work');const f=await fixture('real-adapters');let cc=0,worker=0;
  const adapter=new RealAgents(f.config,async(program,args,options)=>{
    assert.equal(options.interaction?.kind,'model');if(program===f.config.claudeExecutable){cc++;assert.ok(args.includes('--settings'));const output=cc===1?{humanDecision:null,tasks:[{id:'core',instruction:'local task',acceptance:['safe checks']}]}:{verdict:'pass',reason:'fixture review'};return{exitCode:0,stderr:'',stdout:JSON.stringify({session_id:'local-cc',structured_output:output})};}
    worker++;fs.writeFileSync(path.join(f.project,'source.ts'),'export const seed = 1;\n');options.onLine?.(JSON.stringify({type:'thread',id:'same-thread'}));options.onLine?.(JSON.stringify({type:'result',data:{mode:'native',summary:'fixture'}}));return{exitCode:0,stdout:'',stderr:''};
  });const state=await drive(f.store,adapter);assert.equal(state.phase,'completed');assert.equal(cc,2);assert.equal(worker,1);assert.equal(state.claudeCalls,2);assert.equal(state.codexThreadId,'same-thread');
}));
test('Controller model call survives idle to work without aborting Run',()=>scoped(async()=>{
  writeUserInteractionMode('idle');const f=await fixture('switch-controller');let ready!:()=>void,finish!:()=>void;const started=new Promise<void>(resolve=>ready=resolve),release=new Promise<void>(resolve=>finish=resolve);
  const agents:any={executionMode:'native',plan:async(_s:any,_store:any,signal:AbortSignal)=>{ready();await release;assert.equal(signal.aborted,false);return{humanDecision:null,tasks:[{id:'core',instruction:'safe development',acceptance:['safe']}]};},execute:async()=>({mode:'native',summary:'fixture'}),review:async()=>({verdict:'pass',reason:'fixture'})};const pending=drive(f.store,agents);await started;writeUserInteractionMode('work');await wait();finish();assert.equal((await pending).phase,'completed');
}));
test('GUI pending: independent node continues, dependent waits; explicit idle resume verifies without repeating implementation',()=>scoped(async()=>{
  writeUserInteractionMode('work');const f=await fixture('deferred-dag',[{executable:process.execPath,args:['-e','console.log("fake GUI, no desktop")'],interaction:{kind:'desktop'}},{executable:process.execPath,args:['-e','console.log("safe check")']}]);f.config.acceptanceStages={gui:[0,1],safe:[1]};f.config.taskStages={gui:'gui',dependent:'safe',independent:'safe'};const initial=f.store.load();initial.config=f.config;f.store.save(initial);
  const executed:string[]=[],reviewed:string[]=[];const agents:any={executionMode:'native',plan:async()=>({humanDecision:null,tasks:[{id:'gui',instruction:'implement then GUI',acceptance:['GUI required']},{id:'dependent',instruction:'dependent work',acceptance:['safe'],dependsOn:['gui']},{id:'independent',instruction:'independent work',acceptance:['safe']}]}),execute:async(s:any)=>{executed.push(s.tasks[s.taskIndex].id);return{mode:'native',summary:'fixture'};},review:async(s:any)=>{reviewed.push(s.tasks[s.taskIndex].id);return{verdict:'pass',reason:'fixture cannot override pending checks'};}};
  const pending=await drive(f.store,agents);assert.equal(pending.phase,'paused');assert.deepEqual(executed,['gui','independent']);assert.deepEqual(reviewed,['gui','independent']);assert.deepEqual(pending.completedTaskIds,['independent']);assert.deepEqual(pending.deferredTaskIds,['gui']);const events=audit(f.store);assert.ok(events.some(e=>e.event==='deferred_by_work_mode'));assert.equal(events.find(e=>e.event==='independent-check').data.tests[1].exitCode,0);
  writeUserInteractionMode('idle');assert.equal((await drive(f.store,agents)).phase,'paused');const done=await drive(f.store,agents,'用户恢复 GUI 夹具验收');assert.equal(done.phase,'completed');assert.deepEqual(executed,['gui','independent','dependent']);assert.deepEqual(done.deferredTaskIds,[]);
  // The final completed node is index 1, not the last array index. All stages
  // must still be independently rechecked against its final changes.
  const checks=audit(f.store).filter(e=>e.event==='independent-check');assert.equal(checks.at(-1).data.tests.length,2);
}));
test('safe acceptance process continues across mode switch',()=>scoped(async()=>{
  writeUserInteractionMode('idle');const f=await fixture('safe-check-switch');const child=childFixture();let killed=0;const pending=runAcceptanceProcess(f.store.load(),0,new AbortController().signal,{env:process.env},((exe:any,args:any,options:any)=>runProcess(exe,args,options,(()=>child) as any,async()=>{killed++;child.emit('close',0);})) as any);writeUserInteractionMode('work');await wait();assert.equal(killed,0);child.emit('close',0);assert.equal((await pending).exitCode,0);
}));
test('pending GUI cannot bypass human/fail Review or a failed safe acceptance check',()=>scoped(async()=>{
  writeUserInteractionMode('work');
  for(const [name,verdict,exit]of [['human','human',0],['fail','fail',0],['safe-failure','pass',1]] as const){
    const f=await fixture('approval-'+name,[{executable:process.execPath,args:['-e','console.log("mock GUI")'],interaction:{kind:'desktop'}},{executable:process.execPath,args:['-e',`process.exit(${exit})`]}]);let executed=0;
    const agents:any={executionMode:'native',plan:async()=>({humanDecision:null,tasks:[{id:'first',instruction:'fixture',acceptance:['safe']},{id:'independent',instruction:'fixture',acceptance:['safe']}]}),execute:async()=>{executed++;return{mode:'native',summary:'fixture'};},review:async()=>({verdict,reason:'fixture approval boundary'})};
    const state=await drive(f.store,agents);assert.equal(executed,1);assert.equal(state.phase,verdict==='fail'?'failed':'paused');assert.deepEqual(state.deferredTaskIds??[],[]);
  }
}));
test('OpenCode work startup allowed, runtime plugin installed, callback allows bash and defers GUI',()=>scoped(async()=>{
  writeUserInteractionMode('work');const env=opencodeEnvironment(root,path.join(root,'oc-runtime'));assert.match(env.OPENCODE_CONFIG_CONTENT!,/opencode-interaction-plugin/);const plugin=await InteractionPolicyPlugin({directory:root});await plugin['tool.execute.before']({tool:'bash'},{args:{command:'npm test'}});await assert.rejects(plugin['tool.execute.before']({tool:'bash'},{args:{command:'echo ClipCursor MOCK_ONLY'}}),/deferred_by_work_mode/);
  let spawned=0;await assert.rejects(startOpencodeService(process.execPath,root,new AbortController().signal,path.join(root,'oc-start'),(()=>{spawned++;throw Error('fixture stops before actual server');}) as any),/fixture stops/);assert.equal(spawned,1);
}));
test('Hook allows background Shell/source, defers desktop/MCP, protects policy and rejects system even idle',()=>scoped(()=>{
  writeUserInteractionMode('work');for(const command of ['npm test','node safe.js','python app.py','git add .'])assert.equal(hookDecision({tool_name:'Bash',cwd:root,tool_input:{command}},file).allowed,true);
  for(const name of ['mcp__browser__click','mcp__cua_repl__js','write_stdin','unknown'])assert.equal(hookDecision({tool_name:name,tool_input:{}},file).allowed,false);
  assert.equal(hookDecision({tool_name:'Bash',tool_input:{command:'echo ClipCursor'}},file).allowed,false);assert.equal(hookDecision({tool_name:'apply_patch',cwd:root,tool_input:{command:'*** Begin Patch\n*** Add File: source.ts\n+x\n*** End Patch'}},file).allowed,true);
  for(const target of ['../escape.ts','.codex/hooks.json','AGENTS.md','global-interaction-policy.json'])assert.equal(hookDecision({tool_name:'Write',cwd:root,tool_input:{file_path:target}},file).allowed,false);writeUserInteractionMode('idle');assert.equal(hookDecision({tool_name:'Bash',tool_input:{command:'shutdown.exe /r'}},file).allowed,false);
}));
test('corrupt mode triggers GUI watcher; no automatic resume',()=>scoped(async()=>{
  writeUserInteractionMode('idle');let cancelled=0;const stop=watchInteractionPolicy(()=>cancelled++,5);fs.writeFileSync(file,'broken');await wait(25);stop();assert.ok(cancelled>0);const count=cancelled;writeUserInteractionMode('idle');await wait(15);assert.equal(cancelled,count);
}));
