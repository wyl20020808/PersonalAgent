import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createRun, drive } from '../src/controller.js';
import { RealAgents } from '../src/real-agents.js';
import { atomicJson } from '../src/store.js';
import type { Config } from '../src/schema.js';

// Explicit opt-in; never included in npm test. Uses real providers and a disposable
// project, normal Controller locks, receipts, independent verification and Review.
if (!process.argv.includes('--real')) throw Error('Explicit --real required');
const dir=path.join('D:/PersonalAgent-data/transport-recovery-20261011',randomUUID());
const source=path.join(dir,'source');fs.mkdirSync(source,{recursive:true});
fs.writeFileSync(path.join(source,'seed.txt'),'seed\n');
fs.writeFileSync(path.join(source,'AGENTS.md'),'仅完成当前微型验收任务。禁止修改 seed.txt、后台进程、交付、Git 提交、网络配置或其他目录。输出简短。\n');
const verifier=path.join(dir,'verify.cjs');
fs.writeFileSync(verifier,"const fs=require('fs'),a=require('node:assert/strict');a.equal(fs.readFileSync('result.txt','utf8'),'ok\\n');a.equal(fs.readFileSync('seed.txt','utf8'),'seed\\n');console.log('independent content verification passed');");
const config:Config={allowedRepositories:[source],runtimeDir:path.join(dir,'runtime'),mode:'real',projectMode:'direct',executionMode:'native',
  directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},decisionAgent:{backend:'codex'},
  claudeExecutable:'C:/Users/WYL20/.local/bin/claude.exe',timeoutMs:180000,maxLoops:1,maxReworks:0,
  tests:[{executable:process.execPath,args:[verifier]}],mockScenario:'pass'};
const store=await createRun(config,source,'只规划一个任务：读取 seed.txt，使用原生工具创建 result.txt，内容严格为 ok 加换行，运行给定验收命令。seed.txt 保持原样。简短回复，不增加任务。');
atomicJson(path.join(dir,'manifest.json'),{kind:'real-provider-controller-acceptance',runId:store.id,source,runtime:config.runtimeDir,verifier,sandbox:process.env.PERSONAL_AGENT_CODEX_DECISION_WINDOWS_SANDBOX??'inherited',faultInjection:false});
console.log(JSON.stringify({event:'real-run-start',dir,runId:store.id}));
const state=await drive(store,new RealAgents(config));
const audit=fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
const usage=audit.filter(e=>e.event==='agent-usage').map(e=>e.data);
atomicJson(path.join(dir,'result.json'),{phase:state.phase,reason:state.reason,loops:state.loops,reworks:state.reworks,
  decisionSession:state.decisionSession,executionThread:state.codexThreadId,independentPassed:state.evidence?.passed,
  usage,faultInjection:false,deliveryApproved:false});
console.log(JSON.stringify({event:'real-run-finish',dir,phase:state.phase,reason:state.reason,independentPassed:state.evidence?.passed}));
assert.equal(state.phase,'completed');assert.equal(state.evidence?.passed,true);
assert.notEqual(state.decisionSession?.sessionId,state.codexThreadId);
