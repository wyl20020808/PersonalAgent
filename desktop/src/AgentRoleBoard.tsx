import React,{useEffect,useRef,useState} from 'react';
import {Check,Settings2,X} from 'lucide-react';
import {agentCapabilities,supportsPool,type AgentId,type AgentPoolRole} from '../../src/agent-capabilities.js';
import type {DecisionAgent} from './types.js';
import {useDecisionModels} from './DecisionAgentSelect.js';
import AgentLogo from './AgentLogo.js';
import './role-board.css';

export default function AgentRoleBoard({value,onChange,onValid,projectPath,disabled=false}: {
 value?:DecisionAgent;onChange:(value:DecisionAgent)=>void;onValid:(valid:boolean)=>void;projectPath?:string;disabled?:boolean;
}) {
 const {backend,selection,models,loading,provider,valid,refresh}=useDecisionModels(value,projectPath);
 const [settings,setSettings]=useState<AgentId|null>(null);
 const settingsButton=useRef<HTMLButtonElement|null>(null),panel=useRef<HTMLDivElement|null>(null);
 const close=()=>{setSettings(null);settingsButton.current?.focus();};
 useEffect(()=>onValid(valid),[valid,onValid]);
 useEffect(()=>{
  if(!settings)return;
  panel.current?.querySelector<HTMLElement>('select:not(:disabled),button:not(:disabled)')?.focus();
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();close();}};
  document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);
 },[settings]);
 const select=(id:AgentId)=>{
  if(id===backend)return;
  onValid(id==='claude-code');
  onChange(id==='opencode'?{backend:'opencode',opencode:{providerID:'',modelID:''}}:{backend:'claude-code'});
  setSettings(id==='opencode'?'opencode':null);
 };
 const modelText=(id:AgentId)=>id==='opencode'?(selection?.modelID||'选择 Provider 与模型'):id==='claude-code'?'本机默认模型':'SDK 默认模型';
 const pool=(role:AgentPoolRole)=><section className={'agent-pool '+role} aria-label={role==='decision'?'决策池':'执行池'}>
  <header><h4>{role==='decision'?'决策池':'执行池'}</h4></header>
  <div className="agent-cards">{agentCapabilities.map(agent=>{
   const supported=supportsPool(agent,role),selected=role==='decision'?backend===agent.id:agent.id==='codex';
   const status=!supported?'尚未支持':agent.id==='opencode'?(backend!=='opencode'?'实验性 · V1':loading?'正在发现模型':!models?.available?'不可用':valid?'实验性 · 已就绪':'待配置'):'可用';
   return <div className={`agent-card ${selected?'selected':''} ${!supported?'unsupported':''}`} key={agent.id}>
    <button type="button" className="agent-choice" aria-label={`${role==='decision'?'决策池':'执行池'} ${agent.name}`} aria-pressed={selected} disabled={disabled||!supported} onClick={()=>role==='decision'&&select(agent.id)}>
     <AgentLogo agent={agent.id}/><span className="agent-card-copy"><strong>{agent.name}</strong><span>{role==='decision'?'决策者':'执行者'} · {status}</span><small>{supported?modelText(agent.id):role==='decision'?'决策适配将在后续开放':'执行适配将在后续开放'}</small></span>{selected&&<Check className="agent-selected-mark" size={15}/>}
    </button>
    {supported&&<button type="button" className="agent-settings" aria-label={`${role==='decision'?'决策池':'执行池'} ${agent.name} 设置`} aria-expanded={settings===agent.id} disabled={disabled} onClick={event=>{settingsButton.current=event.currentTarget;if(role==='decision'&&backend!==agent.id)select(agent.id);setSettings(settings===agent.id?null:agent.id);}}><Settings2 size={14}/></button>}
   </div>;
  })}</div>
  {settings&&(role==='decision'?settings!=='codex':settings==='codex')&&<div className="agent-config" ref={panel} role="region" aria-label={`${agentCapabilities.find(agent=>agent.id===settings)!.name} 配置`}>
   <div className="agent-config-heading"><strong>{agentCapabilities.find(agent=>agent.id===settings)!.name} 设置</strong><button type="button" aria-label="关闭 Agent 设置" onClick={close}><X size={14}/></button></div>
   {settings==='opencode'?<>
    <label>Provider<select aria-label="OpenCode Provider" disabled={disabled||loading||!models?.available} value={selection?.providerID??''} onChange={event=>onChange({backend:'opencode',opencode:{providerID:event.target.value,modelID:''}})}><option value="">请选择 Provider</option>{models?.providers.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Model<select aria-label="OpenCode Model" disabled={disabled||loading||!models?.available||!provider} value={selection?.modelID??''} onChange={event=>onChange({backend:'opencode',opencode:{providerID:selection!.providerID,modelID:event.target.value}})}><option value="">请选择 Model</option>{provider?.models.map(item=><option value={item.id} key={item.id} disabled={item.capabilities.tools!==true||item.capabilities.structuredOutput!==true}>{item.name}{item.capabilities.tools!==true||item.capabilities.structuredOutput!==true?'（能力不足或未知）':''}</option>)}</select></label>
    <p>实验性 V1；远端 Plan / Review 尚未验证。模型动态发现，启动时再次核验。</p>
    <button type="button" className="text-button" disabled={disabled||loading} onClick={refresh}>刷新模型</button>
   </>:<p>{settings==='claude-code'?'沿用本机 Claude Code 配置与默认模型。':'沿用当前 Codex SDK 配置与默认模型。'}当前没有独立模型选择接口。</p>}
  </div>}
 </section>;
 return <div className="role-board"><div className="role-pools">{pool('decision')}{pool('execution')}</div>{backend==='opencode'&&<div className={`discovery-status ${!loading&&!models?.available?'unavailable':''}`} role="status">{loading?'正在查询已连接的 Provider 与模型…':!models?.available?models?.reason||'模型发现失败，请打开设置刷新。':!valid?'请选择支持原生工具与结构化输出的模型。':`OpenCode · ${selection?.providerID} / ${selection?.modelID}`}</div>}</div>;
}
