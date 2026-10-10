import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { interactionPolicyContext, readInteractionPolicy, writeUserInteractionMode, requireIdle, watchInteractionPolicy } from '../src/interaction-policy.js';
import { runProcess } from '../src/process.js';
import { runCodexTurn } from '../src/native-agent.js';
import { startOpencodeService } from '../src/opencode-decision-agent.js';
import { applyEdits } from '../src/workspace.js';
import { hookDecision } from '../scripts/codex-interaction-hook.js';
import { createRun, drive } from '../src/controller.js';
import { ClaudeCodeDecisionAgent } from '../src/claude-code-decision-agent.js';

const root = fs.mkdtempSync(path.join('D:/', 'pa-interaction-test-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const file = path.join(root, 'policy.json');
const scoped = (operation: () => Promise<void> | void) => interactionPolicyContext.run(file, operation);

test('missing, malformed, unknown version and unknown mode fail closed; atomic user changes', () => scoped(() => {
  assert.equal(readInteractionPolicy().mode, 'work');
  for (const text of ['{', '{"version":1,"mode":"other"}', '{"version":2,"mode":"idle"}', '{"mode":"idle"}', 'null']) {
    fs.writeFileSync(file, text); assert.equal(readInteractionPolicy().mode, 'work');
  }
  writeUserInteractionMode('idle'); assert.equal(readInteractionPolicy().mode, 'idle');
  writeUserInteractionMode('work'); assert.throws(() => requireIdle('test'), /工作模式/);
  assert.deepEqual(fs.readdirSync(root), ['policy.json']);
}));

test('deny unknown executable, CMD, PowerShell, scripts, indirect children and browser before spawn', () => scoped(async () => {
  writeUserInteractionMode('work'); let spawned = 0;
  const requests: [string, string[]][] = [
    ['mouse.exe', ['SetCursorPos']], ['keyboard.exe', ['SendInput']], ['window.exe', ['focus']],
    ['chrome.exe', ['--app=http://localhost']], ['shutdown.exe', ['/r']], ['shutdown.exe', ['/s']],
    ['reg.exe', ['add', 'HKLM']], ['cmd.exe', ['/c', 'python child.py']],
    ['powershell.exe', ['-EncodedCommand', 'mock']], ['python.exe', ['safe-looking.py']],
    ['node.exe', ['-e', 'require("child_process").spawn("mock")']], ['npm', ['test']],
    ['git', ['-c', 'alias.status=!mock', 'status']],
  ];
  for (const [executable,args] of requests) await assert.rejects(runProcess(executable,args,{cwd:root,timeoutMs:1000}, (() => { spawned++; throw Error('Must not spawn'); }) as any), /工作模式/);
  assert.equal(spawned, 0);
}));

test('source edits and fixed background Git observation remain available in work', () => scoped(async () => {
  writeUserInteractionMode('work');
  applyEdits(root,{summary:'normal edit',changes:[{path:'source.ts',content:'export const value = 1;\n'}]} as any);
  assert.match(fs.readFileSync(path.join(root,'source.ts'),'utf8'), /value = 1/);
  const result = await runProcess('git',['-c','core.hooksPath=NUL','-c','core.fsmonitor=false','-c','core.longpaths=true','rev-parse','--is-inside-work-tree'],{cwd:process.cwd(),timeoutMs:3000});
  assert.equal(result.exitCode,0);
}));

test('idle to work cancels only owned mock process, rejects continuation, leaves unrelated PID alone', () => scoped(async () => {
  writeUserInteractionMode('idle');
  const child = Object.assign(new EventEmitter(),{pid:123456789,stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough()});
  const killed:number[]=[];
  const pending = runProcess('mock-interactive',[],{cwd:root,timeoutMs:3000}, (()=>child) as any, async pid => { killed.push(pid); child.emit('close',0); });
  const rejected = assert.rejects(pending,/工作模式/);
  writeUserInteractionMode('work'); await rejected;
  assert.deepEqual(killed,[123456789]);
  await assert.rejects(runProcess('mock-interactive',[],{cwd:root,timeoutMs:1000}, (()=>{throw Error('unexpected');}) as any),/工作模式/);
}));

test('native SDK and OpenCode entry points reject without creating a session or child', () => scoped(async () => {
  writeUserInteractionMode('work'); let called=0;
  await assert.rejects(runCodexTurn({startThread:()=>{called++;throw Error('unexpected');},resumeThread:()=>{called++;throw Error('unexpected');}} as any,{workspace:root,threadId:null,prompt:'mock'},()=>{}),/工作模式/);
  await assert.rejects(startOpencodeService('mock',root,new AbortController().signal,undefined,(()=>{called++;throw Error('unexpected');}) as any),/工作模式/);
  await assert.rejects(new ClaudeCodeDecisionAgent({} as any,(()=>{called++;throw Error('unexpected');}) as any).structured({} as any),/工作模式/);
  assert.equal(called,0);
}));

test('Controller pauses real native dispatch with zero calls; idle to work preserves Run and requires explicit resume', () => scoped(async () => {
  const project=path.join(root,'project');fs.mkdirSync(project);
  const config:any={allowedRepositories:[project],runtimeDir:path.join(root,'runtime'),projectMode:'direct',executionMode:'native',directAuthorization:{projectPath:project,acknowledgedAt:new Date().toISOString()},mode:'real',claudeExecutable:'NEVER-REAL',timeoutMs:3000,maxLoops:2,maxReworks:0,tests:[],mockScenario:'pass'};
  writeUserInteractionMode('work');
  const store=await createRun(config,project,'policy fixture');let calls=0;
  const agents:any={executionMode:'native',plan:async()=>{calls++;return {humanDecision:'Fixture decision',tasks:[]};},execute:async()=>{throw Error('Must not execute');},review:async()=>{throw Error('Must not review');}};
  const paused=await drive(store,agents);assert.equal(paused.phase,'paused');assert.equal(paused.failure?.recoverable,true);assert.equal(calls,0);assert.equal(paused.claudeCalls,0);
  writeUserInteractionMode('idle');const still=await drive(store,agents);assert.equal(still.phase,'paused');assert.equal(calls,0);
  let ready!:()=>void;const started=new Promise<void>(resolve=>ready=resolve);
  agents.plan=async(_state:any,_store:any,signal:AbortSignal)=>{calls++;ready();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('Stopped')),{once:true}));};
  const running=drive(store,agents,'用户明确恢复');await started;writeUserInteractionMode('work');
  const switched=await running;assert.equal(switched.phase,'paused');assert.equal(switched.id,store.id);assert.match(switched.reason,/工作模式/);assert.equal(switched.loops,0);
}));

test('SDK receives cancellation signal on idle to work', () => scoped(async () => {
  writeUserInteractionMode('idle');let ready!:()=>void;
  const started=new Promise<void>(resolve=>ready=resolve);
  const thread={async runStreamed(_prompt:string,options:any){return {events:(async function*(){ready();await new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));})()};}};
  const running=runCodexTurn({startThread:()=>thread} as any,{workspace:root,threadId:null,prompt:'Mock'},()=>{});
  const rejected=assert.rejects(running,/工作模式/);await started;writeUserInteractionMode('work');await rejected;
}));

test('hook denies every unknown tool and wrappers, allows ordinary source patch, refuses policy editing', () => scoped(() => {
  writeUserInteractionMode('work');
  for (const name of ['exec_command','Bash','shell_command','mcp__browser__click','mcp__cua_repl__js','functions.exec','write_stdin','shutdown','unknown']) assert.equal(hookDecision({tool_name:name,tool_input:{command:'mock'}},file).allowed,false);
  for (const target of ['source.ts','src/new.ts']) assert.equal(hookDecision({tool_name:'apply_patch',cwd:root,tool_input:{command:`*** Begin Patch\n*** Add File: ${target}\n+text\n*** End Patch`}},file).allowed,true);
  for (const target of ['../escape.ts','.codex/hooks.json','AGENTS.md','global-interaction-policy.json']) assert.equal(hookDecision({tool_name:'apply_patch',cwd:root,tool_input:{command:`*** Begin Patch\n*** Update File: ${target}\n@@\n-x\n+y\n*** End Patch`}},file).allowed,false);
  writeUserInteractionMode('idle'); assert.equal(hookDecision({tool_name:'exec_command'},file).allowed,true);
}));

test('watcher treats corrupt policy as work and never resumes tasks itself', () => scoped(async () => {
  writeUserInteractionMode('idle'); let paused = 0;
  const stop = watchInteractionPolicy(() => paused++,5);
  fs.writeFileSync(file,'broken'); await new Promise(resolve=>setTimeout(resolve,25));
  stop(); assert.ok(paused>0); const count=paused;
  writeUserInteractionMode('idle'); await new Promise(resolve=>setTimeout(resolve,15)); assert.equal(paused,count);
}));
