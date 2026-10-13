// Read-only native discovery: no model calls, GUI, user config writes or existing Session reuse.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {claudeSharedSkillPlugin,sharedSkills,codexSharedSkillGuidance} from '../dist/src/shared-skills.js';
import {startOpencodeService} from '../dist/src/opencode-decision-agent.js';

const workspace=fileURLToPath(new URL('..',import.meta.url));
const output=process.argv[2];if(!output||!path.isAbsolute(output))throw Error('Provide an absolute evidence directory outside the project');
fs.mkdirSync(output,{recursive:true});
const evidence={date:new Date().toISOString(),workspace,modelCalls:0,checks:[],errors:[]};
const plugin=claudeSharedSkillPlugin(path.join(output,'claude'));
evidence.shared={names:sharedSkills().skills.map(skill=>skill.name),errors:sharedSkills().errors,claudeImports:plugin.names,codexExtraIndex:codexSharedSkillGuidance()};
try{
 const child=spawn(process.env.PERSONAL_AGENT_CLAUDE_EXECUTABLE??'C:/Users/WYL20/.local/bin/claude.exe',['-p','--input-format','stream-json','--output-format','stream-json','--verbose','--permission-mode','bypassPermissions',...(plugin.path?['--plugin-dir',plugin.path]:[])],{cwd:workspace,env:{...process.env},windowsHide:true,stdio:['pipe','pipe','pipe']});
 const response=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Claude initialization timeout')),30000);child.once('error',error=>{clearTimeout(timer);reject(error)});readline.createInterface({input:child.stdout}).on('line',line=>{try{const message=JSON.parse(line);if(message.type==='control_response'){clearTimeout(timer);resolve(message.response?.response??message.response)}}catch{}});child.stderr.resume();child.stdin.write(JSON.stringify({type:'control_request',request_id:'capabilities',request:{subtype:'initialize'}})+'\n');}).finally(async()=>{child.stdin.end();child.kill();await new Promise(resolve=>{const timer=setTimeout(resolve,3000);child.once('exit',()=>{clearTimeout(timer);resolve()})})});
 const names=(response.commands??[]).filter(command=>!command.builtin).map(command=>command.name);
 evidence.claude={names,agents:response.agents?.map(agent=>agent.name)};
 for(const name of plugin.names)if(!names.includes('personalagent-shared-skills:'+name))throw Error('Claude did not discover shared skill: '+name);
 evidence.checks.push('Claude CLI discovers every projected shared user skill through its native plugin loader');
}catch(error){evidence.errors.push({backend:'claude-code',message:error.message})}

try{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),150000);let service;
 try{
  service=await startOpencodeService(process.env.PERSONAL_AGENT_OPENCODE_EXECUTABLE??'D:/PersonalAgent-data/opencode-compatibility-v1/toolchain/node_modules/opencode-windows-x64/bin/opencode.exe',workspace,controller.signal,path.join(output,'opencode'));
  const skills=await service.client.app.skills({directory:workspace},{signal:controller.signal});
  const mcp=await service.client.mcp.status({directory:workspace},{signal:controller.signal});
  const names=(skills.data??[]).map(skill=>skill.name);evidence.opencode={names,mcp:mcp.data,capabilities:service.nativeCapabilities};
  for(const name of evidence.shared.names)if(!names.includes(name))throw Error('OpenCode did not discover shared skill: '+name);
  if(mcp.data?.serena?.status!=='connected')throw Error('Serena is not connected in the owned OpenCode service');
  evidence.checks.push('Owned OpenCode service discovers every shared user skill and connects Serena');
 }finally{clearTimeout(timer);if(service)await service.close();controller.abort()}
}catch(error){evidence.errors.push({backend:'opencode',message:error.message})}
fs.writeFileSync(path.join(output,'native-capabilities.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({checks:evidence.checks,errors:evidence.errors,claudeSkills:evidence.claude?.names.length,opencodeSkills:evidence.opencode?.names.length,mcp:evidence.opencode?.mcp,modelCalls:0},null,2));
if(evidence.errors.length)process.exitCode=1;
