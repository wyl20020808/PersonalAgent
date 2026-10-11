// Explicit read-only native Claude Code review; separate from Controller functional acceptance.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createRun} from '../dist/src/controller.js';
import {Store} from '../dist/src/store.js';
import {ClaudeCodeDecisionAgent} from '../dist/src/claude-code-decision-agent.js';
const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=process.argv[2]??path.join('D:/PersonalAgent-validation/chat-message-steering-review-20261011',randomUUID());
const config={allowedRepositories:[workspace],runtimeDir:path.join(directory,'runtime'),mode:'real',executionMode:'native',projectMode:'direct',directAuthorization:{projectPath:workspace,acknowledgedAt:new Date().toISOString()},decisionAgent:{backend:'claude-code'},executionAgent:{backend:'codex'},claudeExecutable:'C:/Users/WYL20/.local/bin/claude.exe',timeoutMs:180000,maxLoops:1,maxReworks:1,minTasks:1,mockScenario:'pass',tests:[]};
const store=process.argv[2]?new Store(path.join(directory,'runtime'),fs.readdirSync(path.join(directory,'runtime/runs'))[0]):await createRun(config,workspace,'只读审查消息排队、无中断引导和紧凑 UI，不修改文件、不提交、不合并。');
const finding={type:'object',additionalProperties:false,required:['file','line','severity','description'],properties:{file:{type:'string'},line:{type:'integer'},severity:{type:'string',enum:['high','medium','low']},description:{type:'string'}}};
const schema={type:'object',additionalProperties:false,required:['findings','summary'],properties:{summary:{type:'string'},findings:{type:'array',items:finding}}};
const prompt='请执行真实只读代码审查：先 git diff --stat 和 git diff，读取新增 src/steering.ts、desktop/src/QueuedMessages.tsx 和有关测试；仅审查本次消息排队/引导修改的可复现缺陷。重点核对：当前调用不 abort；小任务验证和 Review 后 replan；保留已完成任务；图片/文件字节；同 Run 锁、取消/claim 竞争、恢复；队列 UI。禁止任何文件写入、修改、Git 提交/合并/推送、GUI 和测试运行。不要把 DEV 现有 snapshotPolicy none 的旧测试失败归因本功能，不扩大范围。检查源码后返回结构化 findings，若无具体缺陷返回空数组。';
const response=await new ClaudeCodeDecisionAgent(config).structured({state:store.load(),store,role:'review',phase:'review',taskId:null,runId:store.id,workspace,signal:new AbortController().signal,timeoutMs:180000,schema,prompt:JSON.stringify({instruction:process.argv[3]??(process.argv[2]?'继续原只读 Review，前次调用在三分钟超时。保持原范围和禁止写入规则，不重新读取已审查文件，不做新的广泛扫描。立即收敛已有检查的具体可复现 findings 并返回结构化结论。':prompt)})});
fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify({runId:store.id,...response},null,2));
const state=store.load();state.phase='paused';state.reason='只读功能代码 Review 已结束；正式成果审批未执行。';store.save(state);
console.log(JSON.stringify({report:path.join(directory,'result.json'),review:response.output}));
