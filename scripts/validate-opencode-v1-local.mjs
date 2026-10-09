// Real CLI + local model fixture only. No remote provider credentials or model calls.
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createRun,drive} from '../dist/src/controller.js';
import {RealAgents} from '../dist/src/real-agents.js';
if(!process.argv[2]||!fs.existsSync(process.argv[2]))throw Error('Pass the isolated V1 CLI executable as the first argument');
const root=path.resolve('D:/PersonalAgent-data/opencode-compatibility-v1/cli-fixture-'+randomUUID().slice(0,6));fs.mkdirSync(root,{recursive:true});
const source=path.join(root,'source');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'core.js'),'initial\n');
const receipt={root,modelRequests:0,remotePaidRequests:0,toolNames:[],structuredCalls:0,reads:0};
let workspace;
const server=createServer(async(req,res)=>{
 let text='';for await(const b of req)text+=b;const body=JSON.parse(text);receipt.modelRequests++;
 const names=(body.tools??[]).map(t=>t.function?.name);receipt.toolNames=[...new Set([...receipt.toolNames,...names])];
 const structured=(body.tools??[]).find(t=>t.function?.name==='StructuredOutput');
 if(!structured){res.writeHead(400);res.end(JSON.stringify({error:{message:'Fixture requires native StructuredOutput tool'}}));return;}
 const isReview=Boolean(structured.function.parameters?.properties?.verdict);
 const didRead=body.messages.some(m=>m.role==='tool'&&m.tool_call_id?.startsWith(isReview?'review-read':'plan-read'));
 const name=didRead?'StructuredOutput':'read',id=didRead?'structured-'+receipt.modelRequests:(isReview?'review-read':'plan-read');
 const args=didRead?(isReview?{verdict:'pass',reason:'Local model fixture; real CLI/Controller protocol only'}:{humanDecision:null,tasks:[{id:'core',instruction:'Update core.js to fixed',acceptance:['core.js is fixed']}]}):{filePath:path.join(workspace,'core.js')};
 if(didRead)receipt.structuredCalls++;else receipt.reads++;
 res.writeHead(200,{'Content-Type':'text/event-stream'});
 const chunk=(delta,finish_reason=null)=>res.write('data: '+JSON.stringify({id:'chatcmpl-local',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta,finish_reason}]})+'\n\n');
 chunk({role:'assistant',content:null,tool_calls:[{index:0,id,type:'function',function:{name,arguments:JSON.stringify(args)}}]});chunk({},'tool_calls');res.end('data: [DONE]\n\n');
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const configFile=path.join(root,'fixture-config.json');fs.writeFileSync(configFile,JSON.stringify({enabled_providers:['fixture'],provider:{fixture:{npm:'@ai-sdk/openai-compatible',name:'LOCAL MOCK ONLY',options:{baseURL:'http://127.0.0.1:'+server.address().port+'/v1',apiKey:'dummy-local-fixture'},models:{fixture:{id:'fixture',name:'LOCAL MOCK ONLY',tool_call:true,limit:{context:32000,output:4096}}}}}}));
process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE=configFile;
const verify=path.join(root,'verify.cjs');fs.writeFileSync(verify,"require('node:assert/strict').equal(require('fs').readFileSync('core.js','utf8'),'fixed\\n')");
const config={allowedRepositories:[source],runtimeDir:path.join(root,'runtime'),mode:'mock',projectMode:'isolated',executionMode:'native',claudeExecutable:'never-paid',timeoutMs:120000,maxLoops:1,maxReworks:0,tests:[{executable:process.execPath,args:[verify]}],decisionAgent:{backend:'opencode',opencode:{providerID:'fixture',modelID:'fixture',executable:process.argv[2]}}};
config.mockScenario='pass';
try{
 const store=await createRun(config,source,'LOCAL MOCK protocol validation; native read + structured Plan/Review');workspace=store.load().workspace;const real=new RealAgents(config);
 const result=await drive(store,{executionMode:'native',plan:real.plan.bind(real),review:real.review.bind(real),async execute(state){fs.writeFileSync(path.join(state.workspace,'core.js'),'fixed\n');return{mode:'native',summary:'LOCAL MOCK execution, no Codex service call'};}});
 const events=fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 Object.assign(receipt,{runId:store.id,phase:result.phase,reason:result.reason,failure:result.failure,session:result.decisionSession,independentPassed:result.evidence?.passed,toolEvents:events.filter(e=>e.event==='agent-activity'&&e.data.agent==='opencode'&&e.data.kind==='tool').length,paidCalls:0});
 receipt.passed=result.phase==='completed'&&receipt.structuredCalls===2&&receipt.reads===2&&receipt.toolEvents>0;
}catch(error){receipt.passed=false;receipt.error=error.message;}
finally{await new Promise(resolve=>server.close(resolve));fs.writeFileSync(root+'/result.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));if(!receipt.passed)process.exitCode=1;}
