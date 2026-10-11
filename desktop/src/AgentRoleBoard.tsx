import React,{useEffect,useRef,useState} from 'react';
import {Check,Settings2} from 'lucide-react';
import {agentCapabilities,type AgentId} from '../../src/agent-capabilities.js';
import type {DecisionAgent,DecisionDiscussion,ExecutionAgent} from './types.js';
import {useDecisionModels} from './DecisionAgentSelect.js';
import ExecutionAgentSelect from './ExecutionAgentSelect.js';
import AgentModelDialog from './AgentModelDialog.js';
import AgentLogo from './AgentLogo.js';
import './role-board.css';
import {preloadModelCatalogs} from './modelCatalog.js';

export default function AgentRoleBoard({value,execution,onExecution,discussion,onDiscussion,onChange,onValid,projectPath,disabled=false}:{execution?:ExecutionAgent;onExecution?:(value:ExecutionAgent)=>void;value?:DecisionAgent;discussion?:DecisionDiscussion;onDiscussion?:(value:DecisionDiscussion|undefined,singleChoice?:DecisionAgent)=>void;onChange:(value:DecisionAgent)=>void;onValid:(valid:boolean)=>void;projectPath?:string;disabled?:boolean}){
 const selected=discussion?.participants??[{id:'a' as const,agent:value??{backend:'claude-code' as const}}];
 const choices=useRef(new Map<AgentId,DecisionAgent>());for(const participant of selected)choices.current.set(participant.agent.backend,participant.agent);
 const opencode=selected.find(p=>p.agent.backend==='opencode')?.agent;
 const {valid:openCodeValid}=useDecisionModels(opencode,projectPath);
 const [executionValid,setExecutionValid]=useState(true),[settings,setSettings]=useState<DecisionAgent|null>(null);
 useEffect(()=>{preloadModelCatalogs(projectPath);},[projectPath]);
 const valid=selected.every(p=>p.agent.backend==='opencode'?openCodeValid:!p.agent.model||/^[a-zA-Z0-9._:/-]{1,200}$/.test(p.agent.model));
 useEffect(()=>onValid(valid&&executionValid),[valid,executionValid,onValid]);
 const choiceFor=(id:AgentId):DecisionAgent=>choices.current.get(id)??(id==='opencode'?{backend:id,opencode:{providerID:'',modelID:''}}:{backend:id});
 const apply=(participants:DecisionDiscussion['participants'])=>{
  if(participants.length===1){if(onDiscussion)onDiscussion(undefined,participants[0].agent);else onChange(participants[0].agent);return;}
  const primary=participants.some(p=>p.id===discussion?.primary)?discussion!.primary:participants[0].id;
  onDiscussion?.({participants,primary,rounds:discussion?.rounds??1});
 };
 const configure=(agent:DecisionAgent)=>{choices.current.set(agent.backend,agent);const existing=selected.find(p=>p.agent.backend===agent.backend);if(existing)apply(selected.map(p=>p.id===existing.id?{...p,agent}:p));else if(onDiscussion){const id=(['a','b','c'] as const).find(id=>!selected.some(p=>p.id===id))!;apply([...selected,{id,agent}]);}else onChange(agent);};
 const select=(id:AgentId)=>{const existing=selected.find(p=>p.agent.backend===id);if(existing){if(selected.length>1)apply(selected.filter(p=>p.agent.backend!==id));return;}const choice=choiceFor(id);if(choice.backend==='opencode'&&!choice.opencode.modelID)setSettings(choice);else configure(choice);};
 return <div className="role-board"><div className="role-pools"><section className="agent-pool decision" aria-label="决策池"><header><h4>决策池</h4><span className="decision-count">已选 {selected.length} 位</span></header><p className="decision-pool-hint">点击多选，至少保留一位决策者。</p>
 <div className="agent-cards">{agentCapabilities.map(agent=>{const active=selected.some(p=>p.agent.backend===agent.id),choice=choiceFor(agent.id),model=choice.backend==='opencode'?choice.opencode.modelID||'选择 Provider 与模型':choice.model||(choice.backend==='claude-code'?'本机默认模型':'SDK 默认模型'),effort=choice.backend==='opencode'?choice.opencode.variant:choice.reasoningEffort;return <div key={agent.id} className={`agent-card ${active?'selected':''}`}><button type="button" className="agent-choice" aria-label={`决策池 ${agent.name}`} aria-pressed={active} disabled={disabled} onClick={()=>select(agent.id)}><AgentLogo agent={agent.id}/><span className="agent-card-copy"><strong>{agent.name}</strong><span>决策者 · {active&&choice.backend==='opencode'&&!openCodeValid?'待配置':active?'已选中':'点击加入'}</span><small>{model}{effort?` · ${effort}`:''}</small></span>{active&&<Check size={15} className="agent-selected-mark"/>}</button><button type="button" className="agent-settings" aria-label={`决策池 ${agent.name} 设置`} aria-haspopup="dialog" disabled={disabled} onClick={()=>setSettings(choice)}><Settings2 size={14}/></button></div>;})}</div>
 {discussion&&<div className="discussion-options"><label>主决策者<select aria-label="主决策者" disabled={disabled} value={discussion.primary} onChange={event=>onDiscussion?.({...discussion,primary:event.target.value as DecisionDiscussion['primary']})}>{selected.map(p=><option key={p.id} value={p.id}>{agentCapabilities.find(a=>a.id===p.agent.backend)?.name}</option>)}</select></label><label>讨论轮数<select aria-label="讨论轮数" disabled={disabled} value={discussion.rounds} onChange={event=>onDiscussion?.({...discussion,rounds:Number(event.target.value) as 0|1})}><option value="0">独立初稿后汇总</option><option value="1">交换初稿后汇总</option></select></label></div>}
 </section><ExecutionAgentSelect value={execution} onChange={onExecution??(()=>{})} onValid={setExecutionValid} projectPath={projectPath} disabled={disabled||!onExecution}/></div>
 {settings&&<AgentModelDialog role="decision" value={settings} projectPath={projectPath} onClose={()=>setSettings(null)} onConfirm={configure}/>}</div>;
}
