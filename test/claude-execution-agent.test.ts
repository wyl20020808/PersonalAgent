import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Codex} from '@openai/codex-sdk';
import {createRun,drive} from '../src/controller.js';
import {RealAgents} from '../src/real-agents.js';
import {ClaudeCodeExecutionAgent} from '../src/claude-code-decision-agent.js';
import {assertExecutionState,switchExecutionAgent} from '../src/opencode-execution-agent.js';
import {runCodexTurn,nativeThreadOptions} from '../src/native-agent.js';
import {runUsage} from '../src/call-observation.js';
import {validate,configSchema,type Config} from '../src/schema.js';
import type {runProcess} from '../src/process.js';

const root=path.resolve('.validation','claude-executor-'+randomUUID().slice(0,8));
const tasks=[1,2].map(i=>({id:'step'+i,instruction:'Local injected CLI fixture only',acceptance:['trusted test confirms file']}));
async function fixture(){
 const dir=path.join(root,randomUUID()),source=path.join(dir,'source');fs.mkdirSync(source,{recursive:true});fs.writeFileSync(path.join(source,'seed.txt'),'seed\n');
 const verify=path.join(dir,'verify.cjs');fs.writeFileSync(verify,"require('node:assert/strict').equal(require('node:fs').readFileSync(process.env.PERSONAL_AGENT_TASK_ID+'.txt','utf8'),'fixed\\n')");
 const config:Config={mode:'real',allowedRepositories:[source],runtimeDir:path.join(dir,'runtime'),projectMode:'direct',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},executionMode:'native',claudeExecutable:'NEVER-LAUNCH-PAID-AGENT',timeoutMs:5000,maxLoops:3,maxReworks:0,tests:[{executable:process.execPath,args:[verify]}],mockScenario:'pass',decisionAgent:{backend:'claude-code',model:'decision-model'},executionAgent:{backend:'claude-code',model:'execute-model'}};
 const store=await createRun(config,source,'Local protocol fixture; no remote models');return{source,store,config};
}
function pending(f:Awaited<ReturnType<typeof fixture>>){const state=f.store.load();state.tasks=[tasks[0]!];state.phase='executing';state.loops=1;state.nativeExecution=true;f.store.save(state);return state;}
test('Claude CLI executes two native tasks, resumes independent execution Session, retains decision model and usage',async()=>{
 const f=await fixture(),calls:{model:string;session:string;resume:boolean;execute:boolean}[]=[];
 const run:typeof runProcess=async(program,args,options)=>{
  assert.equal(program,f.config.claudeExecutable);assert.equal(options.cwd,f.source);assert.ok(args.includes('--settings'));
  const execute=JSON.parse(args[args.indexOf('--json-schema')+1]!).properties.mode!==undefined,model=args[args.indexOf('--model')+1]!,resume=args.includes('--resume'),session=args[args.indexOf(resume?'--resume':'--session-id')+1]!;
  calls.push({model,session,resume,execute});assert.equal(model,execute?'execute-model':'decision-model');
  const output=execute?{mode:'native',summary:'Local injected CLI; no remote call'}:calls.length===1?{humanDecision:null,tasks}:{verdict:'pass',reason:'Local injected review'};
  if(execute)fs.writeFileSync(path.join(options.cwd,f.store.load().tasks[f.store.load().taskIndex]!.id+'.txt'),'fixed\n');
  options.onLine?.(JSON.stringify({type:'system',subtype:'init',session_id:session,model}));
  options.onLine?.(JSON.stringify({type:'result',session_id:session,structured_output:output,usage:{input_tokens:4,output_tokens:2}}));
  return{exitCode:0,stdout:'',stderr:''};
 };
 const state=await drive(f.store,new RealAgents(f.config,run));assert.equal(state.phase,'completed');assertExecutionState(state);
 const executions=calls.filter(c=>c.execute),decisions=calls.filter(c=>!c.execute);assert.equal(executions.length,2);assert.equal(executions[0]!.session,executions[1]!.session);assert.equal(executions[1]!.resume,true);assert.notEqual(executions[0]!.session,decisions[0]!.session);assert.ok(decisions.slice(1).every(c=>c.resume&&c.session===decisions[0]!.session));
 assert.equal(state.codexThreadId,null);assert.equal(state.executionSession?.backend,'claude-code');assert.equal(runUsage(f.store).calls.filter(c=>c.phase==='execute'&&c.agent==='claude').length,2);
 const switched=structuredClone(state);switched.phase='paused';f.store.save(switched);switchExecutionAgent(f.store,{backend:'codex',model:'next-model'});const after=f.store.load();assert.equal(after.executionSession,undefined);assert.equal(after.claudeExecutionSessionId,undefined);assert.equal(after.claudeSessionId,state.claudeSessionId);
});
test('Claude execution rejects Session alias, model mismatch, invalid phase, unauthorized workspace and duplicate dispatch',async()=>{
 const f=await fixture(),state=pending(f),signal=new AbortController().signal,adapter=new ClaudeCodeExecutionAgent(f.config,async()=>{throw Error('must not launch');}),prompt=JSON.stringify({action:'local fixture'});
 const alias=structuredClone(state);alias.claudeSessionId='alias';alias.claudeExecutionSessionId='alias';await assert.rejects(adapter.execute(alias,f.store,signal,prompt),/share a Decision/);
 const changed=structuredClone(state);changed.config.executionAgent={backend:'claude-code',model:'wrong'};await assert.rejects(adapter.execute(changed,f.store,signal,prompt),/backend\/model/);
 const invalid=structuredClone(state);invalid.phase='review';await assert.rejects(adapter.execute(invalid,f.store,signal,prompt),/pending native task/);
 const denied=structuredClone(state);delete denied.config.directAuthorization;f.store.save(denied);await assert.rejects(new ClaudeCodeExecutionAgent(denied.config).execute(denied,f.store,signal,prompt),/authorization/);f.store.save(state);
 const replay=structuredClone(state);replay.executionAttempt={loop:1,taskId:tasks[0]!.id,status:'running'};await assert.rejects(adapter.execute(replay,f.store,signal,prompt),/never replay/);
});
test('Claude CLI invalid output and interrupted tools fail closed, preserve Session and block replay',async()=>{
 for(const kind of ['schema','tool','session'] as const){const f=await fixture(),state=pending(f),run:typeof runProcess=async(_exe,args,options)=>{const id=args[args.indexOf('--session-id')+1]!;options.onLine?.(JSON.stringify({type:'system',subtype:'init',session_id:kind==='session'?'wrong':id}));if(kind==='tool')options.onLine?.(JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',id:'pending',name:'Bash',input:{command:'fixture'}}]}}));options.onLine?.(JSON.stringify({type:'result',session_id:id,structured_output:kind==='schema'?{bad:true}:{mode:'native',summary:'fixture'}}));return{exitCode:0,stdout:'',stderr:''};};const adapter=new ClaudeCodeExecutionAgent(f.config,run);await assert.rejects(adapter.execute(state,f.store,new AbortController().signal,JSON.stringify({action:'fixture'})),kind==='schema'?/Schema/:kind==='tool'?/terminal tool/:/ownership/);assert.equal(f.store.load().executionAttempt?.status,'failed');await assert.rejects(adapter.execute(f.store.load(),f.store,new AbortController().signal,'{}'),/never replay/);}
});
test('Codex execution model is bound to both new and resumed SDK Threads; default remains inherited',async()=>{
 const optionsSeen:object[]=[];const thread={async runStreamed(){return{events:(async function*(){yield{type:'item.completed',item:{type:'agent_message',text:'fixture'}};yield{type:'turn.completed',usage:{input_tokens:1,output_tokens:1}};})()};}};
 const sdk={startThread(options:object){optionsSeen.push(options);return thread;},resumeThread(id:string,options:object){assert.equal(id,'existing');optionsSeen.push(options);return thread;}} as unknown as Pick<Codex,'startThread'|'resumeThread'>;
 for(const threadId of [null,'existing'])await runCodexTurn(sdk,{workspace:'D:/fixture',threadId,prompt:'fixture',model:'selected-model'},()=>{});
 assert.deepEqual(optionsSeen,[{...nativeThreadOptions('D:/fixture'),model:'selected-model'},{...nativeThreadOptions('D:/fixture'),model:'selected-model'}]);
 assert.throws(()=>validate(configSchema,{...(legacyConfig()),executionAgent:{backend:'codex',model:'bad model'}}));
});
function legacyConfig(){return{allowedRepositories:['D:/fixture'],runtimeDir:'D:/fixture-runtime',mode:'mock',claudeExecutable:'never',timeoutMs:1000,tests:[],mockScenario:'pass'};}
