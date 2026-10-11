// Real Controller handoff probe with a fixed initial Plan, real agents thereafter, and isolated files.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRun,drive} from '../dist/src/controller.js';
import {RealAgents} from '../dist/src/real-agents.js';
import {publishGuidance} from '../dist/src/steering.js';
import {atomicJson} from '../dist/src/store.js';
const decision=process.argv[2]??'claude-code',execution=process.argv[3]??'codex';
const directory=path.resolve('.validation/real-handoff-'+decision+'-'+execution+'-'+randomUUID()),repo=path.join(directory,'repo');fs.mkdirSync(repo,{recursive:true});
fs.writeFileSync(path.join(repo,'wait.cjs'),"const fs=require('fs');fs.appendFileSync('wait.log','started\\n');fs.writeFileSync('partial.txt','preserved');setTimeout(()=>console.log('completed'),5000);");
const verifier=path.join(directory,'verify.cjs');fs.writeFileSync(verifier,"const fs=require('fs'),a=require('assert/strict');a.equal(fs.readFileSync('wait.log','utf8'),'started\\n');a.equal(fs.readFileSync('partial.txt','utf8'),'preserved');a.equal(fs.readFileSync('result.txt','utf8').trim(),'STEERED');console.log('isolated acceptance passed');");
const opencode={providerID:'hgapi-openai',modelID:'gpt-6.1-sol',executable:'D:/PersonalAgent-data/opencode-compatibility-v1/toolchain/node_modules/opencode-windows-x64/bin/opencode.exe'};
const config={allowedRepositories:[repo],runtimeDir:path.join(directory,'runtime'),mode:'real',executionMode:'native',projectMode:'direct',directAuthorization:{projectPath:repo,acknowledgedAt:new Date().toISOString()},decisionAgent:decision==='opencode'?{backend:'opencode',opencode}:{backend:decision},executionAgent:execution==='opencode'?{backend:'opencode',opencode}:{backend:'codex'},claudeExecutable:'C:/Users/WYL20/.local/bin/claude.exe',timeoutMs:180000,maxLoops:3,maxReworks:1,tests:[{executable:process.execPath,args:[verifier]}],mockScenario:'pass'};
const store=await createRun(config,repo,'只操作当前隔离目录。原任务执行一次 node wait.cjs，等其自然结束后写 result.txt 为 ORIGINAL。若有用户引导，优先最新方向。禁止提交、联网、启动其他Agent、操作其他目录。保留已完成操作，不重复运行 wait.cjs。');
const real=new RealAgents(config);let plans=0,sentAt=0,queued=false;
const agents={executionMode:'native',plan(state,owned,signal){if(++plans===1)return Promise.resolve({humanDecision:null,tasks:[{id:'original',instruction:'第一步只执行 node wait.cjs，等待正常结束，然后写 result.txt 为 ORIGINAL，简短报告。若中途退出，保留已有文件，不重复执行 wait.cjs。',acceptance:['result.txt follows the latest user direction','wait.cjs only executed once']}]});return real.plan(state,owned,signal);},execute:(...args)=>real.execute(...args),review:(...args)=>real.review(...args)};
const message={id:randomUUID(),sessionId:randomUUID(),runId:store.id,time:new Date().toISOString(),text:'立即调整方向：保留 partial.txt 和 wait.log，禁止重复运行 wait.cjs。由决策者重新安排剩余任务，让执行者将 result.txt 写成 STEERED（不是 ORIGINAL）。当前命令已经执行的操作无需重做，先检查文件。',attachments:[]};
const poll=setInterval(()=>{if(queued||!fs.existsSync(store.file('audit.jsonl')))return;const rows=fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));if(rows.some(row=>row.event==='agent-activity'&&row.data.phase==='execute'&&row.data.text.includes('wait.cjs')&&row.data.text.includes('exit_code=pending')||row.event==='agent-activity'&&row.data.agent==='opencode'&&row.data.text.includes('wait.cjs')&&row.data.text.includes('running'))){queued=true;sentAt=Date.now();publishGuidance(store,message);console.log('GUIDANCE_PUBLISHED',decision,execution);}},100);
let state;try{state=await drive(store,agents);}finally{clearInterval(poll);}
const rows=fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
const received=rows.find(row=>row.event==='guidance-received'),interrupted=rows.find(row=>row.event==='guidance-interrupted');
const evidence={kind:'real Controller handoff; fixed initial Plan; real decision/replan, execution and Review thereafter',decision,execution,runId:store.id,phase:state.phase,reason:state.reason,queued,latencyMs:received?Date.parse(received.time)-sentAt:null,interrupted:interrupted?.data,decisionSession:state.decisionSession?.sessionId,executionSession:state.executionSession?.sessionId??state.codexThreadId,completedTaskIds:state.completedTaskIds,loops:state.loops,tests:state.evidence?.tests?.map(t=>({exitCode:t.exitCode,stdout:t.stdout})),goalUpdated:state.goal.includes(message.text),guidanceApplied:state.guidanceHistory?.some(item=>item.id===message.id)};
atomicJson(path.join(directory,'evidence.json'),evidence);console.log(JSON.stringify({directory,...evidence}));
assert.equal(state.phase,'completed',state.reason);assert.equal(queued,true);assert.ok(evidence.latencyMs>=0&&evidence.latencyMs<60000);assert.ok(evidence.guidanceApplied);assert.ok(interrupted);assert.notEqual(evidence.decisionSession,evidence.executionSession);
