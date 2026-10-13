import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRun,drive} from '../dist/src/controller.js';
import {RealAgents} from '../dist/src/real-agents.js';
import {discoverOpencodeExecutionModels} from '../dist/src/opencode-execution-agent.js';
import {runUsage} from '../dist/src/call-observation.js';

const output=process.argv[2];if(!output||!path.isAbsolute(output))throw Error('Provide an absolute evidence directory');
const directory=path.join(output,'real-'+randomUUID().slice(0,8));fs.mkdirSync(directory,{recursive:true});
// A small developer-owned shared skill proves native invocation and supporting
// file access. No global skill, configuration or user project is changed.
const prior=process.env.CODEX_HOME;
const priorOpenCode=process.env.PERSONAL_AGENT_OPENCODE_EXECUTABLE;
process.env.PERSONAL_AGENT_OPENCODE_EXECUTABLE??='D:/PersonalAgent-data/opencode-compatibility-v1/toolchain/node_modules/opencode-windows-x64/bin/opencode.exe';
const home=path.join(directory,'skill-home'),skill=path.join(home,'skills/native-proof');fs.mkdirSync(path.join(skill,'references'),{recursive:true});
fs.writeFileSync(path.join(skill,'SKILL.md'),'---\nname: native-proof\ndescription: Use only for the isolated PersonalAgent native skill acceptance task.\n---\nRead references/proof.txt using a native Read tool, then create proof.txt in the current workspace with that exact content. Use no other files or GUI.\n');
fs.writeFileSync(path.join(skill,'references/proof.txt'),'native-skill-proof-ok\n');process.env.CODEX_HOME=home;
const results=[];
try{
 for(const backend of ['claude-code','opencode'].filter(value=>!process.argv[3]||value===process.argv[3])){
  const source=path.join(directory,backend,'source'),runtime=path.join(directory,backend,'runtime');fs.mkdirSync(source,{recursive:true});
  fs.writeFileSync(path.join(source,'README.md'),'Isolated developer acceptance; only proof.txt may be written.\n');
  let executionAgent={backend:'claude-code',model:'sonnet'};
  if(backend==='opencode'){
   const discovery=await discoverOpencodeExecutionModels(process.env.PERSONAL_AGENT_OPENCODE_EXECUTABLE,source);
   const available=discovery.providers.flatMap(provider=>provider.models.filter(model=>model.capabilities.tools===true&&model.capabilities.structuredOutput===true).map(model=>({provider,model})));
   const preferred=process.argv[4]??'gpt-6.1-sol';
   const selected=available.find(value=>value.model.id===preferred);if(!selected)throw Error(discovery.reason||'Selected OpenCode model is unavailable: '+preferred);
   executionAgent={backend:'opencode',opencode:{providerID:selected.provider.id,modelID:selected.model.id,...(selected.model.reasoningEfforts?.includes('low')?{variant:'low'}:{})}};
  }
  const config={allowedRepositories:[source],runtimeDir:runtime,mode:'real',projectMode:'direct',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},executionMode:'native',claudeExecutable:'C:/Users/WYL20/.local/bin/claude.exe',timeoutMs:180000,maxLoops:1,maxReworks:0,minTasks:1,tests:[],mockScenario:'pass',decisionAgent:{backend:'claude-code',model:'sonnet'},executionAgent,transportRetryDelaysMs:[]};
  const skillName=backend==='claude-code'?'personalagent-shared-skills:native-proof':'native-proof';
  const goal=`只规划一个隔离验收任务。执行者必须用原生 ${backend==='claude-code'?'Skill':'skill'} 工具加载 ${skillName}，按技能读取 supporting reference 并创建 proof.txt；不能用直接读 SKILL.md 冒充 Skill 调用。执行者还必须调用 Serena initial_instructions 确认 MCP 真实可用（不需要激活项目）。只允许写 proof.txt，不提交、不推送、不打开 GUI、不留下后台进程。决策者验收时读取 proof.txt，确认精确等于 native-skill-proof-ok 加换行；通过后 pass。保持输出简短。`;
  const store=await createRun(config,source,goal);console.log(JSON.stringify({backend,event:'real-controller-run-created',runId:store.id}));
  const state=await drive(store,new RealAgents(config));
  const events=fs.readFileSync(store.file('audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
  const tools=events.filter(event=>event.event==='agent-activity'&&(event.data.phase==='execute'||event.data.scope?.startsWith('opencode-execute:'))&&event.data.kind==='tool').map(event=>({title:event.data.title,text:event.data.text}));
  const skillUsed=tools.some(tool=>/工具 · (?:Skill|skill)$/.test(tool.title));
  const serenaUsed=tools.some(tool=>/serena.*initial_instructions/.test(tool.title));
  const fileCorrect=fs.existsSync(path.join(source,'proof.txt'))&&fs.readFileSync(path.join(source,'proof.txt'),'utf8')==='native-skill-proof-ok\n';
  const result={backend,runId:store.id,phase:state.phase,reason:state.reason,skillUsed,serenaUsed,fileCorrect,decisionAccepted:state.evidence?.decisionAccepted,calls:runUsage(store).calls.map(call=>({phase:call.phase,agent:call.agent,status:call.status})),tools};results.push(result);
  fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({backend,phase:state.phase,skillUsed,serenaUsed,fileCorrect}));
  if(state.phase!=='completed'||!skillUsed||!serenaUsed||!fileCorrect)process.exitCode=1;
 }
}finally{if(prior===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=prior;if(priorOpenCode===undefined)delete process.env.PERSONAL_AGENT_OPENCODE_EXECUTABLE;else process.env.PERSONAL_AGENT_OPENCODE_EXECUTABLE=priorOpenCode;console.log(JSON.stringify({evidence:directory}))}
