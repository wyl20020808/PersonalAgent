// Real, isolated headless fixture. Uses production GPT execution/decision transports.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {runProcess} from '../dist/src/process.js';
import {terminateTree} from '../dist/src/process.js';
import {startGodotLanguageService} from '../dist/src/godot-language-service.js';

const output=process.argv[2];
if(!output||!path.isAbsolute(output))throw Error('Provide an absolute isolated evidence directory');
const workspace=path.join(output,'project');
fs.mkdirSync(path.join(workspace,'.serena'),{recursive:true});
fs.writeFileSync(path.join(workspace,'project.godot'),'config_version=5\n[application]\nconfig/name="PersonalAgent Serena LSP probe"\n');
fs.writeFileSync(path.join(workspace,'.serena/project.yml'),'project_name: pa-godot-serena-probe\nlanguage_servers: [gdscript]\nencoding: utf-8\nls_specific_settings:\n  gdscript:\n    port: 6008\n');
fs.writeFileSync(path.join(workspace,'probe.gd'),'extends Node\n\nfunc serena_probe_marker() -> int:\n\treturn 42\n');
fs.writeFileSync(path.join(workspace,'AGENTS.md'),'This is an isolated read-only verification fixture. Do not modify files or open GUI. Only use Serena initial_instructions, activate_project and get_symbols_overview.\n');
const env=Object.fromEntries(Object.entries(process.env).filter(([,value])=>value!==undefined));
const prompt=`只做只读探针，不读全局技能、不执行 Shell、不编辑文件、不打开 GUI。调用 Serena initial_instructions，然后 activate_project 激活 ${workspace}，再用 get_symbols_overview 读取 probe.gd。必须实际调用，报告真实函数名 serena_probe_marker。失败时报告原始错误，不声称成功。`;
const results=[];
// Separate actual MCP/LSP health from model-provider availability.
const service=await startGodotLanguageService(workspace,env);
let bridge;
try{
 if(!service.guidance.includes('已为当前项目启动'))throw Error(service.guidance);
 const config=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.claude.json'),'utf8')).mcpServers.serena;
 bridge=spawn(config.command,config.args,{cwd:workspace,env:{...env,...config.env},windowsHide:true,stdio:['pipe','pipe','pipe']});
 let sequence=0,pending='';const requests=new Map();bridge.stderr.resume();
 bridge.stdout.on('data',chunk=>{pending+=chunk;let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);try{const value=JSON.parse(line);const request=requests.get(value.id);if(request){requests.delete(value.id);value.error?request.reject(Error(value.error.message)):request.resolve(value.result);}}catch{}}});
 const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{requests.delete(id);reject(Error('MCP timeout: '+method));},60000);requests.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});bridge.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
 await rpc('initialize',{protocolVersion:'2024-11-05',clientInfo:{name:'pa-godot-serena-probe',version:'1'},capabilities:{}});
 bridge.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const call=(name,args)=>rpc('tools/call',{name,arguments:args});
 await call('initial_instructions',{});
 const activation=await call('activate_project',{project:workspace});
 const overview=await call('get_symbols_overview',{relative_path:'probe.gd',depth:1});
 const passed=!overview.isError&&JSON.stringify(overview).includes('serena_probe_marker');
 results.push({role:'mcp-lsp',passed,activation,overview});
 console.log(JSON.stringify({role:'mcp-lsp',passed}));
}catch(error){results.push({role:'mcp-lsp',passed:false,error:String(error)});console.log(JSON.stringify(results.at(-1)));}
finally{if(bridge?.pid)await terminateTree(bridge.pid);await service.close();}
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2)+'\n');
if(process.argv.includes('--mcp-only')){if(results.some(result=>!result.passed))process.exitCode=1;}
else {
for(const role of ['execute','decision']){
 const events=[];
 try{
  const request={workspace,threadId:null,prompt,model:'gpt-6.1-sol',reasoningEffort:'low',...(role==='decision'?{role:'plan',runId:'isolated-godot-serena-probe',schema:{type:'object',properties:{summary:{type:'string'}},required:['summary'],additionalProperties:false}}:{})};
  const worker=fileURLToPath(new URL(role==='execute'?'../dist/src/codex-worker.js':'../dist/src/codex-decision-worker.js',import.meta.url));
  const processResult=await runProcess(process.execPath,[worker],{cwd:workspace,env,input:JSON.stringify(request),timeoutMs:180000,streamOutput:true,interaction:{kind:'model'},onLine:line=>{try{events.push(JSON.parse(line));}catch{}}});
  if(processResult.exitCode!==0)throw Error(processResult.stderr.slice(-1500));
  const result=events.findLast(event=>event.type==='result')?.data;
  const receipts=events.filter(event=>event.type==='activity'&&event.data?.kind==='tool');
  const symbols=receipts.filter(event=>/get_symbols_overview/.test(event.data.title??''));
  const passed=symbols.some(event=>/serena_probe_marker/.test(event.data.text??'')&&!/Could not connect|not initialized/.test(event.data.text??''));
  results.push({role,passed,result,receipts});
 }catch(error){results.push({role,passed:false,error:String(error)});}
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify({role,...results.at(-1),receipts:undefined}));
}
}
if(results.some(result=>!result.passed))process.exitCode=1;
