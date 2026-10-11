import React,{useEffect,useState} from 'react';
import {Check,Settings2} from 'lucide-react';
import {agentCapabilities,type AgentId} from '../../src/agent-capabilities.js';
import type {DecisionAgent,DecisionDiscussion,ExecutionAgent} from './types.js';
import DecisionAgentSelect,{useDecisionModels} from './DecisionAgentSelect.js';
import ExecutionAgentSelect from './ExecutionAgentSelect.js';
import AgentModelDialog from './AgentModelDialog.js';
import AgentLogo from './AgentLogo.js';
import './role-board.css';

export default function AgentRoleBoard({value,execution,onExecution,discussion,onDiscussion,onChange,onValid,projectPath,disabled=false}:{execution?:ExecutionAgent;onExecution?:(value:ExecutionAgent)=>void;value?:DecisionAgent;discussion?:DecisionDiscussion;onDiscussion?:(value:DecisionDiscussion|undefined)=>void;onChange:(value:DecisionAgent)=>void;onValid:(valid:boolean)=>void;projectPath?:string;disabled?:boolean}){
 const first=discussion?.participants.find(p=>p.id==='a')?.agent??value??{backend:'claude-code'},second=discussion?.participants.find(p=>p.id==='b')?.agent;
 const {valid}=useDecisionModels(first,projectPath);
 const [executionValid,setExecutionValid]=useState(true),[secondValid,setSecondValid]=useState(true),[settings,setSettings]=useState<DecisionAgent|null>(null);
 const changeFirst=(agent:DecisionAgent)=>{if(discussion)onDiscussion?.({...discussion,participants:discussion.participants.map(p=>p.id==='a'?{...p,agent}:p)});else onChange(agent);};
 useEffect(()=>onValid(valid&&executionValid&&(!discussion||secondValid)),[valid,executionValid,discussion,secondValid,onValid]);
 const choiceFor=(id:AgentId):DecisionAgent=>first.backend===id?first:id==='opencode'?{backend:id,opencode:{providerID:'',modelID:''}}:{backend:id};
 const select=(id:AgentId)=>{if(id===first.backend)return;if(id==='opencode')setSettings(choiceFor(id));else changeFirst(choiceFor(id));};
 return <div className="role-board"><div className="role-pools"><section className="agent-pool decision" aria-label="决策池"><header><h4>决策池</h4>{onDiscussion&&<select aria-label="决策者模式" disabled={disabled} value={discussion?'dual':'single'} onChange={event=>{setSecondValid(true);if(event.target.value==='single'){onChange(first);onDiscussion(undefined);}else onDiscussion({participants:[{id:'a',agent:first},{id:'b',agent:{backend:'claude-code'}}],primary:'a',rounds:1});}}><option value="single">单决策者</option><option value="dual">双决策者</option></select>}</header>
 {discussion&&<p className="participant-label">决策者 A</p>}
 <div className="agent-cards">{agentCapabilities.map(agent=>{const selected=agent.id===first.backend,choice=choiceFor(agent.id),model=choice.backend==='opencode'?choice.opencode.modelID||'选择 Provider 与模型':choice.model||(choice.backend==='claude-code'?'本机默认模型':'SDK 默认模型');return <div key={agent.id} className={`agent-card ${selected?'selected':''}`}><button type="button" className="agent-choice" aria-label={`决策池 ${agent.name}`} aria-pressed={selected} disabled={disabled} onClick={()=>select(agent.id)}><AgentLogo agent={agent.id}/><span className="agent-card-copy"><strong>{agent.name}</strong><span>决策者 · {selected&&!valid?'待配置':agent.experimental?'实验性':'可用'}</span><small>{model}</small></span>{selected&&<Check size={15} className="agent-selected-mark"/>}</button><button type="button" className="agent-settings" aria-label={`决策池 ${agent.name} 设置`} aria-haspopup="dialog" disabled={disabled} onClick={()=>setSettings(choice)}><Settings2 size={14}/></button></div>;})}</div>
 {discussion&&<div className="second-decision" aria-label="决策者 B 配置"><p className="participant-label"><AgentLogo agent={second?.backend??'claude-code'}/>决策者 B</p><DecisionAgentSelect value={second} projectPath={projectPath} disabled={disabled} onValid={setSecondValid} onChange={agent=>onDiscussion?.({...discussion,participants:discussion.participants.map(p=>p.id==='b'?{...p,agent}:p)})}/><div className="discussion-options"><label>主决策者<select aria-label="主决策者" disabled={disabled} value={discussion.primary} onChange={event=>onDiscussion?.({...discussion,primary:event.target.value as 'a'|'b'})}><option value="a">决策者 A</option><option value="b">决策者 B</option></select></label><label>讨论轮数<select aria-label="讨论轮数" disabled={disabled} value={discussion.rounds} onChange={event=>onDiscussion?.({...discussion,rounds:Number(event.target.value) as 0|1})}><option value="0">0 轮 · 独立初稿后汇总</option><option value="1">1 轮 · 交换初稿后汇总</option></select></label></div></div>}
 </section><ExecutionAgentSelect value={execution} onChange={onExecution??(()=>{})} onValid={setExecutionValid} projectPath={projectPath} disabled={disabled||!onExecution}/></div>
 {settings&&<AgentModelDialog role="decision" value={settings} projectPath={projectPath} onClose={()=>setSettings(null)} onConfirm={changeFirst}/>}</div>;
}
