import {randomUUID} from 'node:crypto';
import {assertDecisionState,decisionIdentity} from './decision-agent.js';
import {configSchema,validate,type Config} from './schema.js';
import {atomicJson,type State,type Store} from './store.js';
import {redact} from './telemetry.js';

export function switchDecisionAgent(store:Store,choice:NonNullable<Config['decisionAgent']>):State {
 const unlock=store.lock();
 try{
  const state=store.load();
  if(!['paused','failed','stopped'].includes(state.phase))throw Error('仅暂停、失败、停止的 Run 可以切换决策者');
  if(state.discussion||state.config.decisionDiscussion)throw Error('多决策者任务不支持中途切换');
  if(state.failure?.recoverable===false)throw Error('该失败不可自动恢复');
  assertDecisionState(state);
  const config=validate<Config>(configSchema,{...state.config,decisionAgent:choice}),identity=decisionIdentity(config);
  if(JSON.stringify(identity)===JSON.stringify(state.decisionAgent??{backend:'claude-code'}))return state;
  const previous={agent:state.decisionAgent??{backend:'claude-code'},session:state.decisionSession??null,claudeSessionId:state.claudeSessionId};
  const handoff={runId:state.id,workspace:state.workspace,from:previous,to:identity,goal:state.goal,
   phase:state.phase,nextPhase:state.nextPhase,reason:state.reason,taskIndex:state.taskIndex,tasks:state.tasks,
   completedTaskIds:state.completedTaskIds??[],feedback:state.feedback,
   evidence:state.evidence?{passed:state.evidence.passed,issues:state.evidence.issues,tests:state.evidence.tests.map((t,index)=>({command:state.config.tests[index],exitCode:t.exitCode})),diff:state.evidence.diff}:null};
  const file=`decision-handoff-${randomUUID()}.json`;atomicJson(store.file(file),handoff);
  state.config=config;state.decisionAgent=identity;delete state.decisionSession;state.claudeSessionId=null;
  state.feedback=[state.feedback,`用户请求切换决策者。Controller 交接记录：${store.file(file)}。先读取此记录并核对当前工作区；保留已有正式计划和完成项，不重做已完成任务；仅接手未完成的规划或审查。旧模型输出是历史证据，不代表你的审查结论。中断工具结果不确定时先核实，继续执行仍由 Controller 调度。`].filter(Boolean).join('\n');
  store.save(state,{decisionSwitch:true});
  store.audit('decision-agent-switched',{from:previous,to:identity,handoff:file,taskId:state.tasks[state.taskIndex]?.id??null,nextPhase:state.nextPhase,note:redact('保留 Run、工作区、执行 Session、完成记录；新决策者使用新 Session')});
  return state;
 }finally{unlock();}
}
