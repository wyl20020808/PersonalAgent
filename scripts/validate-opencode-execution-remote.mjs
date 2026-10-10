// Prepare only by default. --run requires separate human remote-call authorization.
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';
import {createRun,drive} from '../dist/src/controller.js';
import {RealAgents} from '../dist/src/real-agents.js';
import {git} from '../dist/src/workspace.js';
import {previewDelivery,deliveryStatus} from '../dist/src/delivery.js';
const {values}=parseArgs({options:{provider:{type:'string'},model:{type:'string'},executable:{type:'string'},'expected-cost':{type:'string'},'provider-config':{type:'string'},run:{type:'boolean'},'authorize-remote':{type:'boolean'}}});
if(!values.provider||!values.model||!values.executable||!fs.existsSync(values.executable))throw Error('--provider, --model and existing compatible V1 --executable required');
if(values.run&&(!values['authorize-remote']||!values['expected-cost']?.trim()))throw Error('Remote run requires explicit human authorization plus --authorize-remote and --expected-cost. This development task does not authorize remote calls.');
if(values['provider-config']){if(!fs.existsSync(values['provider-config']))throw Error('Provider config unavailable');process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE=path.resolve(values['provider-config']);}
const root=path.resolve('.validation','p3c-remote-'+randomUUID().slice(0,8)),source=path.join(root,'source');fs.mkdirSync(source,{recursive:true});
fs.writeFileSync(path.join(source,'core.js'),'export const add = (a,b) => a-b;\n');
fs.writeFileSync(path.join(source,'verify.mjs'),"const {add}=await import('./core.js');if(add(2,3)!==5)throw Error('addition failed');console.log('lightweight test passed');\n");
await git(source,['init']);await git(source,['add','core.js','verify.mjs']);await git(source,['-c','user.name=Acceptance Fixture','-c','user.email=local@example.invalid','commit','-m','initial acceptance fixture']);
const independent=path.join(root,'independent.mjs');fs.writeFileSync(independent,"import path from 'node:path';import {pathToFileURL} from 'node:url';const {add}=await import(pathToFileURL(path.resolve('core.js')).href);if(add(2,3)!==5)throw Error('addition failed');console.log('independent test passed');\n");
const choice={backend:'opencode',opencode:{providerID:values.provider,modelID:values.model,executable:path.resolve(values.executable)}};
const config={allowedRepositories:[source],runtimeDir:path.join(root,'runtime'),mode:'real',projectMode:'direct',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},executionMode:'native',claudeExecutable:'unused',timeoutMs:120000,maxLoops:1,maxReworks:0,minTasks:1,tests:[{executable:process.execPath,args:[independent]}],decisionAgent:choice,executionAgent:choice,mockScenario:'pass'};
const configFile=path.join(root,'controller.json');fs.writeFileSync(configFile,JSON.stringify(config,null,2));
const receipt={kind:values.run?'AUTHORIZED REMOTE ACCEPTANCE':'PREPARED ONLY; ZERO MODEL CALLS',root,configFile,providerID:values.provider,modelID:values.model,expectedCost:values['expected-cost']??null,note:'Expected cost is a user estimate, not a provider-side spending cap. Max one implementation loop, no reworks; native tools may make multiple internal model requests.',passed:false};
if(!values.run){fs.writeFileSync(path.join(root,'prepared.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));}
else{
 const cancellation=new AbortController();process.once('SIGINT',()=>cancellation.abort());process.once('SIGTERM',()=>cancellation.abort());
 try{
  const store=await createRun(config,source,'只规划一个任务：修复 core.js 的 add，使 add(2,3) 等于 5。执行者只修改 core.js，并运行 node verify.mjs。决策者审查实际 Diff 和测试。不修改测试，不更改 Plan，不提交，不推送，不启动 GUI、浏览器或后台进程。完成后由 Controller 生成 Delivery Preview，等待人工审批。');
  receipt.runId=store.id;fs.writeFileSync(path.join(root,'acceptance.json'),JSON.stringify(receipt,null,2));
  const result=await drive(store,new RealAgents(config),undefined,cancellation.signal);Object.assign(receipt,{phase:result.phase,reason:result.reason,failure:result.failure,decisionSession:result.decisionSession,executionSession:result.executionSession,independentPassed:result.evidence?.passed});
  if(result.phase==='completed'){const delivery=await previewDelivery(store,source,'direct');receipt.delivery={...delivery,...await deliveryStatus(store,delivery.id)};}
  receipt.passed=result.phase==='completed'&&result.evidence?.passed&&result.decisionSession?.sessionId!==result.executionSession?.sessionId&&receipt.delivery?.phase==='preview'&&receipt.delivery.approval===null;
 }catch(error){receipt.error=error.message;}
 finally{fs.writeFileSync(path.join(root,'acceptance.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));if(!receipt.passed)process.exitCode=1;}
}
