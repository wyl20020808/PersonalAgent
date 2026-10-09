import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { stringify } from 'yaml';
import { createRun, drive } from '../src/controller.js';
import { stampContext, loadProjectContext } from '../src/project-context.js';
import { decideContextConfirmation, pendingContextConfirmations } from '../src/context-confirmation.js';
import { auditRecords } from '../src/context-trust.js';
import { readProject } from '../src/project-files.js';
import type { Config, Review } from '../src/schema.js';
import type { State } from '../src/store.js';
import type { Agents } from '../src/adapters.js';

const directory = process.platform === 'win32' ? `D:/pa-pc2-demo/${randomUUID().slice(0,8)}` : path.resolve('.validation', `pc2-demo-${randomUUID().slice(0,8)}`);
const source = path.join(directory,'source'), runtimeDir = path.join(directory,'runtime');
function write(root:string,relative:string,content:string){const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
const headings = {overview:['项目目标','范围','非目标','总体结构'],module:['职责','边界','入口与测试'],contract:['约束','检查方式']};
const doc=(kind:keyof typeof headings,metadata:object,body:string)=>`---\n${stringify({schema:1,kind,...metadata})}---\n${headings[kind].map(title=>`## ${title}\n${body}\n`).join('')}`;
write(source,'src/combat.js','export const hit=1;\n');write(source,'src/world.js','export const wall=1;\n');
write(source,'docs/project-context/overview.md',doc('overview',{project_id:randomUUID(),name:'Project Context Phase2 Mock 演示'},'仅为新建 Mock 隔离夹具，不代表真实 CC/Codex 调用。'));
for(const id of ['combat','world'])write(source,`docs/project-context/modules/${id}.md`,doc('module',{id,name:id,paths:[`src/${id}.js`],depends_on:[],checked_files:{}},'职责与接口固定；交叉模块变化需核对共享几何约束。'));
const relative='docs/project-context/contracts/geometry.md';
write(source,relative,doc('contract',{id:'geometry',title:'共享几何契约（Mock）',modules:['combat','world'],status:'proposed',basis:{kind:'agent-proposal',ref:'明确标记的 Mock 演示'}},'combat 与 world 必须使用同一世界坐标系；核对跨模块碰撞测试。'));
for(const id of ['combat','world'])stampContext(source,id,[`src/${id}.js`]);
const config:Config={allowedRepositories:[source],runtimeDir,projectMode:'isolated',executionMode:'native',mode:'mock',claudeExecutable:'NEVER-PAID',timeoutMs:30000,maxLoops:3,maxReworks:1,maxClaudeCalls:5,tests:[{executable:process.execPath,args:['-e','console.log("明确标记 Mock 独立验收夹具")']}],mockScenario:'pass'};
fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'config.json'),JSON.stringify(config,null,2));
const original=readProject(source).digest;
function pass(state:State):Review{const report=state.evidence!.contextReport!;return {verdict:'pass',reason:'Mock：共享几何修复合理，已核对原契约；职责与接口未变，重新核对并盖章。',contextReview:{expansionReason:'Mock：combat/world 共享几何约束必须同时修正',unmappedReason:'',checkedContracts:report.contracts.map(doc=>doc.id),modules:report.affectedModules.map(module=>({moduleId:module.moduleId,documentUpdated:module.documentUpdated,noUpdateReason:module.documentUpdated?'':'Mock 内部值变化，职责与接口未变',checkedFiles:module.checkedFiles,constraintsChanged:false,disposition:'Mock 核对源码与契约，确认哈希和测试'}))}};}
let executions=0;const received:unknown[]=[];
const agents:Agents={executionMode:'native',plan:async()=>({humanDecision:null,tasks:[{id:'combat',instruction:'Mock 修改 combat 内部几何值',moduleIds:['combat'],acceptance:['共享几何约束检查通过']}]}),execute:async state=>{
  write(state.workspace,'src/combat.js','export const hit=2;\n');write(state.workspace,'src/world.js','export const wall=2;\n');
  if(++executions>1)for(const id of ['combat','world'])stampContext(state.workspace,id,[`src/${id}.js`]);
  return {mode:'native',summary:'Mock 候选同时修改 combat 和 world；不是实际 Codex 输出'};
},review:async state=>{received.push(state.evidence!.contextReport);return executions===1?{verdict:'rework',reason:'Mock：额外涉及 world；共享几何契约已收到。说明文档未变，核心哈希失配；核对文件并正式盖章后返工。'}:pass(state);}};
const cross=await createRun(config,source,'明确标记 Mock：combat 跨模块检查');const crossResult=await drive(cross,agents);assert.equal(crossResult.phase,'completed',crossResult.reason);assert.equal(executions,2);
const report=crossResult.evidence!.contextReport!;assert.deepEqual(report.expandedModules,['world']);assert.equal(readProject(source).digest,original);
const confirm=await createRun(config,source,'明确标记 Mock：正式 human-decision 确认链');let reviews=0;
const confirmAgents:Agents={...agents,execute:async state=>{write(state.workspace,'src/combat.js','export const hit=2;\n');stampContext(state.workspace,'combat',['src/combat.js']);return {mode:'native',summary:'Mock 确认链候选'};},review:async state=>++reviews===1?{verdict:'human',reason:'Mock：请求正式确认具体共享几何契约',contextConfirmations:[{relative,action:'accepted'}]}:pass(state)};
const paused=await drive(confirm,confirmAgents);assert.equal(paused.phase,'paused');const request=pendingContextConfirmations(confirm)[0]!;
decideContextConfirmation(confirm,request.id,request.requestHash,'明确标记 Mock：通过正式 API 接受摘要绑定的具体文档；不批准 Delivery');
const accepted=loadProjectContext(paused.workspace,true,{runtimeDir,source}).contracts[0]!;assert.equal(accepted.trust!.verified,true);assert.equal(readProject(source).digest,original);
const resumed=await drive(confirm,confirmAgents,'Mock 正式确认后恢复原 Run 并重新独立验收');assert.equal(resumed.phase,'completed',resumed.reason);
const output={label:'明确标记 Mock；无付费 Claude Code/Codex 调用，无真实项目修改，无 Delivery 批准或应用',directory,sourceProtected:readProject(source).digest===original,crossModule:{runId:cross.id,declaredModules:['combat'],actualModules:report.actualModules,expandedModules:report.expandedModules,reviewReceived:received,audit:auditRecords(cross.file('audit.jsonl'))},confirmation:{runId:confirm.id,request,accepted:{status:accepted.metadata.status,trust:accepted.trust,basis:accepted.metadata.basis},resumedPhase:resumed.phase,audit:auditRecords(confirm.file('audit.jsonl'))}};
const file=path.resolve('validation/phase2/mock-demo.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(output,null,2));console.log(JSON.stringify({label:output.label,evidence:file,directory,crossRun:cross.id,confirmationRun:confirm.id,sourceProtected:output.sourceProtected},null,2));
