// Actual V1 CLI + deterministic loopback model fixture. No remote model calls.
// This verifies native tool plumbing, not remote OpenCode development quality.
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRun,drive} from '../dist/src/controller.js';
import {RealAgents} from '../dist/src/real-agents.js';
import {discoverOpencodeExecutionModels} from '../dist/src/opencode-execution-agent.js';
import {git} from '../dist/src/workspace.js';
import {previewDelivery,deliveryStatus} from '../dist/src/delivery.js';
const executable=process.argv[2];
if(!executable||!fs.existsSync(executable))throw Error('Pass compatible V1 CLI executable; no remote model is used');
const root=path.resolve('.validation','p3c-native-'+randomUUID().slice(0,8)),source=path.join(root,'source');fs.mkdirSync(source,{recursive:true});
fs.writeFileSync(path.join(source,'core.js'),'export const add = (a,b) => a-b;\n');
const verify="const {add}=await import('./core.js');if(add(2,3)!==5)throw Error('addition failed');console.log('lightweight test passed');\n";
fs.writeFileSync(path.join(source,'verify.mjs'),verify);await git(source,['init']);await git(source,['add','core.js','verify.mjs']);await git(source,['-c','user.name=Local Fixture','-c','user.email=local@example.invalid','commit','-m','initial fixture']);
const independent=path.join(root,'independent.mjs');fs.writeFileSync(independent,"import path from 'node:path';import {pathToFileURL} from 'node:url';const {add}=await import(pathToFileURL(path.resolve('core.js')).href);if(add(2,3)!==5)throw Error('addition failed');console.log('independent test passed');\n");
const receipt={kind:'LOCAL MOCK model with actual V1 native tools',root,remotePaidRequests:0,modelRequests:0,tools:[],passed:false};
const server=createServer(async(req,res)=>{
 try{
  let text='';for await(const b of req)text+=b;const body=JSON.parse(text);receipt.modelRequests++;
  const structured=(body.tools??[]).find(t=>t.function?.name==='StructuredOutput');
  if(!structured){res.writeHead(400);res.end(JSON.stringify({error:{message:'Local fixture only handles Controller structured calls'}}));return;}
  const schema=structured.function.parameters,execution=Boolean(schema.properties.mode),review=Boolean(schema.properties.verdict),stage=execution?'execute':review?'review':'plan';
  const done=id=>body.messages.some(m=>m.role==='tool'&&m.tool_call_id===id);
  let name,args,id;
  if(!done(stage+'-read')){name='read';id=stage+'-read';args={filePath:path.join(source,'core.js')};}
  else if(execution&&!done('execute-write')){name='write';id='execute-write';args={filePath:path.join(source,'core.js'),content:'export const add = (a,b) => a+b;\n'};}
  else if(execution&&!done('execute-bash')){name='bash';id='execute-bash';args={command:'node verify.mjs',description:'Run lightweight isolated native test',timeout:10000};}
  else{name='StructuredOutput';id=stage+'-structured';args=execution?{mode:'native',summary:'本地确定性模型驱动 V1 原生 read/write/bash；远端模型未验证。'}:review?{verdict:'pass',reason:'本地确定性模型夹具的决策验收；不代表远端模型质量或用户交付批准。'}:{humanDecision:null,tasks:[{id:'add',instruction:'修复 core.js 加法并运行 node verify.mjs；只实施当前任务，不修改 Plan 或测试。',acceptance:['add(2,3) is 5','lightweight test passes']}]};}
  receipt.tools.push({stage,name,id});res.writeHead(200,{'Content-Type':'text/event-stream'});
  const chunk=(delta,finish_reason=null)=>res.write('data: '+JSON.stringify({id:'chatcmpl-local',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta,finish_reason}]})+'\n\n');
  chunk({role:'assistant',content:null,tool_calls:[{index:0,id,type:'function',function:{name,arguments:JSON.stringify(args)}}]});chunk({},'tool_calls');res.end('data: [DONE]\n\n');
 }catch{res.writeHead(500);res.end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
// Exercise the actual V2-to-V1 per-model adaptation, not an already converted config.
const configFile=path.join(root,'provider.json');fs.writeFileSync(configFile,JSON.stringify({enabled_providers:['fixture'],providers:{fixture:{package:'@opencode/ai/providers/openai-compatible',name:'LOCAL MOCK ONLY',settings:{baseURL:'http://127.0.0.1:'+server.address().port+'/v1',apiKey:'dummy-local-fixture'},models:{
 fixture:{modelID:'fixture',name:'LOCAL MOCK ONLY',capabilities:{tools:true,input:['text'],output:['text']},limit:{context:32000,output:4096}},
 vision:{modelID:'vision',name:'DECLARED VISION',capabilities:{tools:true,input:['text','image'],output:['text']},limit:{context:32000,output:4096}},
 noTools:{modelID:'noTools',name:'NO TOOLS',capabilities:{tools:false,input:['text'],output:['text']},limit:{context:32000,output:4096}},
 unknown:{modelID:'unknown',name:'UNDECLARED',limit:{context:32000,output:4096}},
}}}}));
process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE=configFile;
const choice={backend:'opencode',opencode:{providerID:'fixture',modelID:'fixture',executable}};
const config={allowedRepositories:[source],runtimeDir:path.join(root,'runtime'),mode:'mock',projectMode:'direct',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},executionMode:'native',claudeExecutable:'never-paid',timeoutMs:120000,maxLoops:1,maxReworks:0,tests:[{executable:process.execPath,args:[independent]}],decisionAgent:choice,executionAgent:choice,mockScenario:'pass'};
try{
 const discovery=await discoverOpencodeExecutionModels(executable,source);
 const models=discovery.providers.find(provider=>provider.id==='fixture')?.models;
 receipt.modelCapabilities=models?.map(model=>({id:model.id,capabilities:model.capabilities}));
 if(!discovery.available||models?.find(model=>model.id==='fixture')?.capabilities.images!==false||models?.find(model=>model.id==='vision')?.capabilities.images!==true||models?.find(model=>model.id==='noTools')?.capabilities.tools!==false||models?.find(model=>model.id==='noTools')?.capabilities.structuredOutput!==false||models?.find(model=>model.id==='unknown')?.capabilities.images!==false)throw Error('Actual CLI model capability adaptation failed');
 const store=await createRun(config,source,'LOCAL MOCK ONLY: native OpenCode Plan / Execute / Review / Delivery Preview');const result=await drive(store,new RealAgents(config));
 Object.assign(receipt,{runId:store.id,phase:result.phase,reason:result.reason,failure:result.failure,decisionSession:result.decisionSession,executionSession:result.executionSession,controllerEvidencePassed:result.evidence?.passed,decisionAccepted:result.evidence?.decisionAccepted});
 const check=spawnSync(process.execPath,[independent],{cwd:source,windowsHide:true,encoding:'utf8',timeout:10000});
 receipt.developerCheck={exitCode:check.status,stdout:check.stdout,stderr:check.stderr};
 if(result.phase==='completed'){
  const delivery=await previewDelivery(store,source,'direct'),status=await deliveryStatus(store,delivery.id);receipt.delivery={...delivery,phase:status.phase,approval:status.approval};
 }
 const events=fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 receipt.executionToolEvents=events.filter(e=>e.event==='agent-activity'&&e.data.scope?.startsWith('opencode-execute:')&&e.data.kind==='tool').map(e=>JSON.parse(e.data.text));
 receipt.passed=result.phase==='completed'&&result.evidence?.decisionAccepted===true&&check.status===0&&check.stdout.includes('independent test passed')&&result.decisionSession?.sessionId!==result.executionSession?.sessionId&&receipt.executionToolEvents.some(e=>JSON.stringify(e.receipt).includes('lightweight test passed'))&&fs.readFileSync(path.join(source,'core.js'),'utf8').includes('a+b')&&receipt.delivery?.approval===null;
}catch(error){receipt.error=error.message;}
finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));if(!receipt.passed)process.exitCode=1;}
