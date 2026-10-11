// Installed OpenCode CLI + local mock model, never a paid provider.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRun, drive } from '../dist/src/controller.js';
import { RealAgents } from '../dist/src/real-agents.js';
import { interactionPolicyContext, writeUserInteractionMode } from '../dist/src/interaction-policy.js';
const executable=process.argv[2];if(!executable||!fs.existsSync(executable))throw Error('Pass installed isolated OpenCode V1 executable');
const root=fs.mkdtempSync('D:/pa-oc-policy-'),project=path.join(root,'project');fs.mkdirSync(project);fs.writeFileSync(path.join(project,'core.js'),'initial\n');
const receipt={root,paidModelCalls:0,requests:0,safeShell:false,desktopDeferred:false,phase:null};
const server=createServer(async(req,res)=>{
  let text='';for await(const b of req)text+=b;const body=JSON.parse(text);receipt.requests++;
  const structured=(body.tools??[]).find(t=>t.function?.name==='StructuredOutput');if(!structured){res.writeHead(400);res.end();return;}
  const review=Boolean(structured.function.parameters.properties.verdict),prefix=review?'review':'plan';
  const outputs=body.messages.filter(m=>m.role==='tool');
  for(const output of outputs){const content=JSON.stringify(output.content);if(output.tool_call_id===prefix+'-safe'&&content.includes('POLICY_BACKGROUND_SAFE'))receipt.safeShell=true;if(output.tool_call_id===prefix+'-desktop'&&content.includes('deferred_by_work_mode'))receipt.desktopDeferred=true;}
  let name='bash',id=prefix+'-safe',args={command:'echo POLICY_BACKGROUND_SAFE',description:'Harmless background echo'};
  if(outputs.some(m=>m.tool_call_id===prefix+'-safe')){id=prefix+'-desktop';args={command:'echo ClipCursor MOCK_ONLY',description:'Harmless echo used to test rejection; no desktop API'};}
  if(outputs.some(m=>m.tool_call_id===prefix+'-desktop')){name='StructuredOutput';id=prefix+'-structured';args=review?{verdict:'pass',reason:'local fake model; backend safe echo succeeded, desktop request deferred'}:{humanDecision:null,tasks:[{id:'core',instruction:'local fixture implementation',acceptance:['local Node acceptance']} ]};}
  res.writeHead(200,{'Content-Type':'text/event-stream'});const chunk=(delta,finish_reason=null)=>res.write('data: '+JSON.stringify({id:'local',object:'chat.completion.chunk',created:1,model:'fixture',choices:[{index:0,delta,finish_reason}]})+'\n\n');chunk({role:'assistant',content:null,tool_calls:[{index:0,id,type:'function',function:{name,arguments:JSON.stringify(args)}}]});chunk({},'tool_calls');res.end('data: [DONE]\n\n');
});server.listen(0,'127.0.0.1');await once(server,'listening');
const configFile=path.join(root,'fixture-config.json');fs.writeFileSync(configFile,JSON.stringify({enabled_providers:['fixture'],provider:{fixture:{npm:'@ai-sdk/openai-compatible',name:'LOCAL ONLY',options:{baseURL:`http://127.0.0.1:${server.address().port}/v1`,apiKey:'dummy-local'},models:{fixture:{id:'fixture',name:'LOCAL ONLY',tool_call:true,limit:{context:32000,output:4096}}}}}}));
process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE=configFile;
const config={allowedRepositories:[project],runtimeDir:path.join(root,'runtime'),mode:'real',projectMode:'direct',directAuthorization:{projectPath:project,acknowledgedAt:new Date().toISOString()},executionMode:'native',claudeExecutable:'never-paid',timeoutMs:30000,maxLoops:1,maxReworks:0,tests:[{executable:process.execPath,args:['-e','console.log("safe acceptance")']}],mockScenario:'pass',decisionAgent:{backend:'opencode',opencode:{providerID:'fixture',modelID:'fixture',executable}}};
try {await interactionPolicyContext.run(path.join(root,'work.json'),async()=>{
  writeUserInteractionMode('work');const store=await createRun(config,project,'local policy probe'),real=new RealAgents(config);
  const result=await drive(store,{executionMode:'native',plan:real.plan.bind(real),review:real.review.bind(real),async execute(){fs.writeFileSync(path.join(project,'core.js'),'fixed\n');return{mode:'native',summary:'local fixture'};}});receipt.phase=result.phase;receipt.reason=result.reason;receipt.independentPassed=result.evidence?.passed;receipt.runId=store.id;
});}catch(error){receipt.error=error.message;}finally{server.closeAllConnections();server.close();receipt.passed=receipt.phase==='completed'&&receipt.safeShell&&receipt.desktopDeferred;fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));if(!receipt.passed)process.exitCode=1;}
