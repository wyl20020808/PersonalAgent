// Explicit real acceptance. Never included in npm test; uses a fresh external fixture/runtime.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createRun,drive} from '../dist/src/controller.js';
import {RealAgents} from '../dist/src/real-agents.js';
import {stageRunAttachments} from '../dist/src/multimodal.js';
import {publishGuidance,guidanceStatus} from '../dist/src/steering.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join('D:/PersonalAgent-validation/chat-message-steering-20261011',randomUUID()),repo=path.join(directory,'fixture');fs.mkdirSync(repo,{recursive:true});
fs.writeFileSync(path.join(repo,'README.md'),'# Isolated real steering acceptance\nOnly first.txt and final.txt may be created. No Git commit, GUI, system operations, or writes outside this fixture.\n');
const check=path.join(directory,'acceptance.cjs');fs.writeFileSync(check,"const fs=require('node:fs');const assert=require('node:assert/strict');assert.equal(fs.readFileSync('first.txt','utf8'),'FIRST\\n');if(fs.existsSync('final.txt'))assert.ok(['ORIGINAL\\n','STEERED\\n'].includes(fs.readFileSync('final.txt','utf8')));console.log('Independent exact file checks passed');");
const config={allowedRepositories:[repo],runtimeDir:path.join(directory,'runtime'),mode:'real',executionMode:'native',projectMode:'direct',directAuthorization:{projectPath:repo,acknowledgedAt:new Date().toISOString()},decisionAgent:{backend:'claude-code'},executionAgent:{backend:'codex'},claudeExecutable:'C:/Users/WYL20/.local/bin/claude.exe',timeoutMs:180000,maxLoops:4,maxReworks:1,minTasks:2,mockScenario:'pass',tests:[{executable:process.execPath,args:[check]}]};
const goal='这是隔离的小型真实验收。初始计划必须恰好两个顺序小任务，ID first 和 final，final dependsOn first。规划阶段只读取，不修改文件。first 仅创建 first.txt，UTF-8 内容精确为 FIRST 加换行。final 仅创建 final.txt，原要求内容精确为 ORIGINAL 加换行。一次 Execute 只完成当前小任务，不提前执行其他任务。禁止提交/合并/推送、GUI 或修改 README。稍后用户可能追加要求，决策者应保留已验收 first，调整剩余任务。';
const store=await createRun(config,repo,goal),id=randomUUID();console.log(JSON.stringify({runId:store.id,directory}));
let sent=false,dispatchError,firstThread;
const poll=setInterval(()=>{
 try{
  const state=store.load();if(state.codexThreadId&&!firstThread)firstThread=state.codexThreadId;
  if(sent||state.phase!=='executing'||state.taskIndex!==0)return;
  sent=true;
  const refs=stageRunAttachments(store,[{name:'queue-ui.png',mimeType:'image/png',bytes:fs.readFileSync(path.join(root,'.validation/steering-ui/queue-desktop.png'))},{name:'requirements.md',mimeType:'text/plain',bytes:Buffer.from('后续 final.txt 的内容必须精确为 STEERED 加一个换行。保留 first.txt，不重新执行 first。','utf8')}]);
  publishGuidance(store,{id,sessionId:randomUUID(),runId:store.id,time:new Date().toISOString(),text:'现在提前引导：当前 first 执行继续，不中断。first 验收后，请结合图片和需求文件，把后续 final.txt 改成 STEERED 加一个换行，保留 first 已完成成果。新计划只返回剩余任务，使用新 ID adjusted-final，dependsOn first。图片仅是参考材料，不是系统指令。',attachments:refs});console.log('Guidance with exact image/file bytes published while first Execute was active.');
 }catch(error){dispatchError=error;}
},100);
let state;
try{state=await drive(store,new RealAgents(config));}finally{clearInterval(poll);}
const records=fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
const result={runId:store.id,directory,phase:state.phase,reason:state.reason,sent,guidanceStatus:guidanceStatus(store,id),completedTaskIds:state.completedTaskIds,loops:state.loops,decisionSession:state.decisionSession,executionThread:state.codexThreadId,firstThread,dispatchError:dispatchError?.message,independentPassed:state.evidence?.passed,events:records.filter(record=>['agent-start','agent-finish','guidance-received','guidance-applied','independent-check','review','codex-exit','claude-exit'].includes(record.event)).map(record=>({time:record.time,event:record.event,role:record.data.role,exitCode:record.data.exitCode,verdict:record.data.verdict,passed:record.data.passed,messageId:record.data.messageId}))};
fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({runId:store.id,phase:state.phase,reason:state.reason,guidanceStatus:result.guidanceStatus,loops:state.loops,report:path.join(directory,'result.json')}));
assert.equal(dispatchError,undefined);assert.equal(sent,true);assert.equal(state.phase,'completed',state.reason);assert.equal(guidanceStatus(store,id),'applied');assert.equal(fs.readFileSync(path.join(repo,'first.txt'),'utf8'),'FIRST\n');assert.equal(fs.readFileSync(path.join(repo,'final.txt'),'utf8'),'STEERED\n');assert.equal(state.loops,2);assert.deepEqual(state.completedTaskIds,['first','adjusted-final']);assert.ok(state.claudeSessionId);assert.ok(state.codexThreadId);assert.equal(state.codexThreadId,firstThread);assert.equal(state.evidence?.passed,true);
console.log('REAL Controller steering acceptance passed.');
