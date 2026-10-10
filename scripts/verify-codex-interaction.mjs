// Local deterministic Responses fixture. No credentials, model service or desktop interaction.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { terminateTree } from '../dist/src/process.js';
const executable = process.argv[2];
if (!executable || !path.isAbsolute(executable)) throw Error('Pass absolute installed codex.exe path');
if (!fs.existsSync(executable)) throw Error('Installed codex.exe does not exist');
const root = path.join('D:/pa-gwi', path.basename(path.dirname(executable))+'-'+Date.now());
const home = path.join(root,'home'), workspace = path.join(root,'workspace');
fs.mkdirSync(home,{recursive:true}); fs.mkdirSync(workspace,{recursive:true});
const policy = path.join(root,'policy.json');
fs.writeFileSync(policy,JSON.stringify({version:1,mode:'work'}));
const auditFile=path.join(root,'hook-audit.jsonl');
const command = `& "${process.execPath}" "${path.resolve('dist/scripts/codex-interaction-hook.js')}" "${policy}" "${auditFile}"`;
fs.writeFileSync(path.join(home,'hooks.json'),JSON.stringify({hooks:{PreToolUse:[{hooks:[{type:'command',command,timeout:5}]}]}},null,2));
fs.writeFileSync(path.join(home,'AGENTS.md'),fs.readFileSync('C:/Users/WYL20/.codex/AGENTS.md','utf8')+'\n工作模式：不得修改全局交互策略；未知工具必须暂停。\n');
const mcpFile=path.join(root,'mock-mcp.mjs'),mcpMarker=path.join(root,'mock-mcp-called');
fs.writeFileSync(mcpFile,`import fs from 'node:fs';import {createInterface} from 'node:readline';createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;let result={};if(r.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'harmless-policy-probe',version:'1'}};if(r.method==='tools/list')result={tools:[{name:'click',description:'Mock browser click with no desktop effect',inputSchema:{type:'object',properties:{}}}]};if(r.method==='tools/call'){fs.writeFileSync(${JSON.stringify(mcpMarker)},'called');result={content:[{type:'text',text:'Mock tool executed; no desktop effect'}]};}process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n');});`);

let requests = 0;
const captured = [];
const server = http.createServer(async (request,response)=>{
  let body='';for await(const chunk of request) body+=chunk;
  const parsed = body ? JSON.parse(body) : {};
  captured.push({url:request.url,toolNames:parsed.tools?.map(tool=>tool.name??tool.custom?.name),otherTools:parsed.tools?.filter(tool=>!tool.name).map(tool=>JSON.stringify(tool).slice(0,700)),toolOutputs:parsed.input?.filter(item=>['function_call_output','custom_tool_call_output'].includes(item.type))});
  if (!request.url?.endsWith('/responses')) {response.writeHead(404);response.end();return;}
  requests++;
  const tool = parsed.tools?.find(tool=>['exec_command','shell_command','shell'].includes(tool.name));
  const mockMcp=parsed.tools?.find(tool=>/policy_probe.*click/.test(tool.name));
  const item = requests===1 ? {type:'function_call',id:'fc_probe',call_id:'call_probe',name:tool?.name??'exec_command',arguments:JSON.stringify(tool?.name==='exec_command'?{cmd:'echo POLICY_HARMLESS_PROBE',max_output_tokens:1000}:{command:'echo POLICY_HARMLESS_PROBE',timeout_ms:3000,workdir:workspace})} : requests===2 ? {type:'custom_tool_call',id:'patch_probe',call_id:'call_patch',name:'apply_patch',input:'*** Begin Patch\n*** Add File: source-probe.ts\n+export const probe = 1;\n*** End Patch'} : requests===3 ? {type:'function_call',id:'mcp_probe',call_id:'call_mcp',name:mockMcp?.name??'mcp__policy_probe__click',arguments:'{}'} : {type:'message',id:'msg_done',role:'assistant',content:[{type:'output_text',text:'Policy probe complete.'}]};
  response.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
  const send = (type,data)=>response.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
  send('response.created',{response:{id:'resp_'+requests,object:'response',status:'in_progress',output:[]}});
  send('response.output_item.added',{output_index:0,item});
  send('response.output_item.done',{output_index:0,item});
  send('response.completed',{response:{id:'resp_'+requests,object:'response',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});
  response.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const fixtureModel='gpt-5.4';
const config = `model = "${fixtureModel}"\nmodel_provider = "fixture"\napproval_policy = "never"\nsandbox_mode = "danger-full-access"\n[model_providers.fixture]\nname = "Local policy fixture"\nbase_url = "http://127.0.0.1:${port}"\nwire_api = "responses"\nrequires_openai_auth = false\n[features]\nhooks = true\nplugins = false\n`;
fs.writeFileSync(path.join(home,'config.toml'),config);
fs.appendFileSync(path.join(home,'config.toml'),`\n[mcp_servers.policy_probe]\ncommand = ${JSON.stringify(process.execPath.replaceAll('\\','/'))}\nargs = [${JSON.stringify(mcpFile.replaceAll('\\','/'))}]\nstartup_timeout_sec = 5\n`);
const env={...process.env,CODEX_HOME:home}; delete env.OPENAI_API_KEY; delete env.NODE_OPTIONS;
const evidence={executable,root,requests:0,metadata:[],events:[],stderr:'',bypass:null};
async function rpcProbe(trust=false) {
  const child=spawn(executable,['app-server','--stdio'],{cwd:workspace,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const pending=new Map();let id=0;
  const rpc=(method,params)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('RPC timeout '+method));},10000);pending.set(n,{resolve,reject,timer});child.stdin.write(JSON.stringify({id:n,method,params})+'\n');});
  createInterface({input:child.stdout}).on('line',line=>{try{const message=JSON.parse(line);const call=pending.get(message.id);if(call){clearTimeout(call.timer);pending.delete(message.id);message.error?call.reject(Error(JSON.stringify(message.error))):call.resolve(message.result);}}catch{}});
  child.stderr.on('data',chunk=>{evidence.stderr+=String(chunk).slice(0,3000);});
  try {
    await rpc('initialize',{clientInfo:{name:'policy_fixture',version:'1.0.0'},capabilities:{experimentalApi:true}});
    child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
    const hooks=await rpc('hooks/list',{cwds:[workspace]}); evidence.metadata.push(hooks);
    if(trust){
      const hook=hooks.data.flatMap(entry=>entry.hooks).find(item=>['PreToolUse','preToolUse'].includes(item.eventName));
      if (!hook) throw Error('PreToolUse not discovered');
      fs.appendFileSync(path.join(home,'config.toml'),`\n[hooks.state.'${hook.key}']\ntrusted_hash = "${hook.currentHash}"\n`);
    } else {
      // Deliberately harmless server command, to identify whether user RPC bypasses hooks.
      evidence.bypass=await rpc('command/exec',{command:['C:/Windows/System32/cmd.exe','/d','/c','echo','RPC_HARMLESS_PROBE'],cwd:workspace,timeoutMs:3000,sandboxPolicy:{type:'dangerFullAccess'}});
    }
  } finally { child.stdin.end(); await new Promise(resolve=>{child.once('close',resolve);setTimeout(()=>{if(child.pid)void terminateTree(child.pid).then(resolve);else resolve();},2000).unref();}); }
}
try {
  await rpcProbe(true); await rpcProbe(false);
  const child=spawn(executable,['exec','--json','--skip-git-repo-check','Run policy fixture.'],{cwd:workspace,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  createInterface({input:child.stdout}).on('line',line=>{try{evidence.events.push(JSON.parse(line));}catch{}});
  child.stderr.on('data',chunk=>{evidence.stderr+=String(chunk);});
  const timer=setTimeout(()=>{if(child.pid)void terminateTree(child.pid);},20000);
  evidence.exitCode=await new Promise(resolve=>child.once('close',resolve));clearTimeout(timer);
} catch(error){evidence.error=String(error);}
finally { server.closeAllConnections();server.close(); evidence.requests=requests; evidence.captured=captured;evidence.hookAudit=fs.existsSync(auditFile)?fs.readFileSync(auditFile,'utf8'):'';
  evidence.probeExecuted=evidence.events.some(event=>event.item?.type==='command_execution'&&event.item.aggregated_output?.includes('POLICY_HARMLESS_PROBE'));
  evidence.probeBlocked=Boolean(evidence.hookAudit)&&captured.some(item=>item.toolOutputs?.some(output=>/工作模式/.test(output.output)))&&!evidence.probeExecuted;
  evidence.coverage=evidence.probeBlocked?'verified-block':evidence.probeExecuted?'not-enforced':'unverified';
  evidence.sourceEditVerified=fs.existsSync(path.join(workspace,'source-probe.ts'))&&fs.readFileSync(path.join(workspace,'source-probe.ts'),'utf8').includes('export const probe = 1;');
  evidence.mockMcpExecuted=fs.existsSync(mcpMarker);
  evidence.mockMcpBlocked=!evidence.mockMcpExecuted&&captured.some(item=>item.toolOutputs?.some(output=>output.call_id==='call_mcp'&&/工作模式/.test(output.output)));
  fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2)); }
console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),requests,error:evidence.error,metadata:evidence.metadata,events:evidence.events,exitCode:evidence.exitCode,bypass:evidence.bypass},null,2));
process.exitCode=evidence.probeBlocked?0:2;
