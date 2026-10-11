import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Store, type State} from './store.js';
import {configSchema, validate, type Config} from './schema.js';
import {decisionIdentity, type DecisionAgent} from './decision-agent.js';
import {ClaudeCodeDecisionAgent} from './claude-code-decision-agent.js';
import {CodexDecisionAgent} from './codex-decision-agent.js';
import {OpenCodeDecisionAgent} from './opencode-decision-agent.js';
import {bindRunAttachments} from './multimodal.js';

export const conversationReplySchema={type:'object',additionalProperties:false,required:['reply','plan'],properties:{reply:{type:'string',minLength:1,maxLength:20000},plan:{type:'string',maxLength:12000}}};
export type ConversationReply={reply:string;plan:string};
export type ConversationDiscussionInput={runtimeDir:string;stateId?:string;projectPath:string;sessionId:string;config:Config;text:string;history:{role:'user'|'assistant';text:string}[];plan:string;attachments?:{name:string;mimeType:string;bytes:Buffer}[]};

/** A conversational decision Session, never registered or scheduled as a development Run. */
export async function conversationDiscussion(input:ConversationDiscussionInput,onCreated:(id:string)=>void,signal:AbortSignal,adapter?:DecisionAgent):Promise<ConversationReply>{
 input.config=validate<Config>(configSchema,input.config);
 const store=new Store(input.runtimeDir,input.stateId??randomUUID());
 let state:State;
 if(input.stateId){
  state=store.load();
  if(state.purpose!=='conversation-discussion'||state.source!==fs.realpathSync(input.projectPath)||JSON.stringify(state.config)!==JSON.stringify(input.config))throw Error('讨论 Session 的项目或决策者配置已变化');
 }else{
  const workspace=fs.realpathSync(input.projectPath);
  state={version:1,id:store.id,purpose:'conversation-discussion',goal:'会话讨论',source:workspace,workspace,base:'',config:input.config,phase:'paused',nextPhase:'planning',tasks:[],taskIndex:0,loops:0,reworks:0,claudeCalls:0,claudeSessionId:null,codexThreadId:null,feedback:'',reason:'讨论中，等待用户明确开始执行',evidence:null,executorExitCode:-1,updatedAt:'',beforeExecution:'',decisionAgent:decisionIdentity(input.config),snapshotPolicy:'none'};
  store.save(state);store.audit('conversation-discussion-created',{sessionId:input.sessionId,projectPath:workspace});onCreated(store.id);
 }
 const unlock=store.lock();
 try{
  bindRunAttachments(store,input.attachments??[]);state=store.load();
  const prompt=JSON.stringify({action:'与用户讨论项目问题。可以追问、比较方案、分析风险。只能使用只读工具，禁止修改文件、运行命令、派发执行任务或提交交付。用户在讨论中说开始、继续或执行也不能授权你实施。reply 为给用户的中文回复；plan 为当前完整候选方案（目标、范围、步骤、验收标准），尚不能形成方案时为空字符串。候选方案不等于批准，必须由应用中的开始执行入口转入开发。',projectPath:state.source,history:input.history.slice(-40),previousPlan:input.plan,userMessage:input.text});
  store.audit('conversation-discussion-turn',{sessionId:input.sessionId,text:input.text});
  let output:ConversationReply;
  if(input.config.mode==='mock'){
   state.claudeCalls=(state.claudeCalls??0)+1;store.save(state);
   output={reply:'Mock 讨论回复，仅验证会话流程，不是真实决策者意见。\n\n'+input.text,plan:'Mock 候选方案，仅用于测试：'+input.text};
  }else{
   const agent=adapter??(state.decisionAgent?.backend==='codex'?new CodexDecisionAgent(state.config):state.decisionAgent?.backend==='opencode'?new OpenCodeDecisionAgent(state.config):new ClaudeCodeDecisionAgent(state.config));
   output=(await agent.structured<ConversationReply>({state,store,role:'plan',phase:'plan',readOnly:true,prompt,schema:conversationReplySchema,workspace:state.workspace,runId:state.id,taskId:null,signal,timeoutMs:input.config.timeoutMs})).output;
  }
  validate(conversationReplySchema,output);store.audit('conversation-discussion-reply',output);return output;
 }finally{unlock();}
}
