import React,{useEffect,useState} from 'react';
import {Check,Settings2} from 'lucide-react';
import {agentCapabilities,type AgentId} from '../../src/agent-capabilities.js';
import type {ExecutionAgent} from './types.js';
import AgentLogo from './AgentLogo.js';
import AgentModelDialog from './AgentModelDialog.js';
import {useDecisionModels} from './DecisionAgentSelect.js';

export function executionLabel(value?:ExecutionAgent):string{
 if(value?.backend==='opencode')return `OpenCode · ${value.opencode.providerID} / ${value.opencode.modelID}`;
 return value?.backend==='claude-code'?`Claude Code（${value.model??'本机默认模型'}）`:`Codex（${value?.model??'SDK 默认模型'}）`;
}
export default function ExecutionAgentSelect({value,onChange,onValid,projectPath,disabled=false}:{value?:ExecutionAgent;onChange:(value:ExecutionAgent)=>void;onValid:(valid:boolean)=>void;projectPath?:string;disabled?:boolean}){
 const current=value??{backend:'codex'},[settings,setSettings]=useState<ExecutionAgent|null>(null);
 const {valid}=useDecisionModels(current,projectPath,'executionModels');
 useEffect(()=>onValid(valid),[valid,onValid]);
 const choiceFor=(id:AgentId):ExecutionAgent=>current.backend===id?current:id==='opencode'?{backend:id,opencode:{providerID:'',modelID:''}}:{backend:id};
 return <section className="agent-pool execution" aria-label="执行池"><header><h4>执行池</h4></header><div className="agent-cards">{agentCapabilities.map(agent=>{const selected=current.backend===agent.id,choice=choiceFor(agent.id),model=choice.backend==='opencode'?choice.opencode.modelID||'选择 Provider 与模型':choice.model||(choice.backend==='claude-code'?'本机默认模型':'SDK 默认模型');return <div key={agent.id} className={`agent-card ${selected?'selected':''}`}><button type="button" className="agent-choice" aria-label={`执行池 ${agent.name}`} aria-pressed={selected} disabled={disabled} onClick={()=>{if(selected)return;if(agent.id==='opencode')setSettings(choice);else onChange(choice);}}><AgentLogo agent={agent.id}/><span className="agent-card-copy"><strong>{agent.name}</strong><span>执行者 · {selected&&!valid?'待配置':agent.experimental?'实验性':'可用'}</span><small>{model}</small></span>{selected&&<Check size={15} className="agent-selected-mark"/>}</button><button type="button" className="agent-settings" aria-label={`执行池 ${agent.name} 设置`} aria-haspopup="dialog" disabled={disabled} onClick={()=>setSettings(choice)}><Settings2 size={14}/></button></div>;})}</div>
 {settings&&<AgentModelDialog role="execution" value={settings} projectPath={projectPath} onClose={()=>setSettings(null)} onConfirm={onChange}/>}</section>;
}
