import React,{useEffect,useRef,useState} from 'react';
import {Check,Settings2,X} from 'lucide-react';
import {agentCapabilities,supportsPool,type AgentId,type AgentPoolRole} from '../../src/agent-capabilities.js';
import type {DecisionAgent,DecisionDiscussion} from './types.js';
import DecisionAgentSelect,{useDecisionModels} from './DecisionAgentSelect.js';
import AgentLogo from './AgentLogo.js';
import './role-board.css';

export default function AgentRoleBoard({value,discussion,onDiscussion,onChange,onValid,projectPath,disabled=false}: {
 value?:DecisionAgent;discussion?:DecisionDiscussion;onDiscussion?:(value:DecisionDiscussion|undefined)=>void;onChange:(value:DecisionAgent)=>void;onValid:(valid:boolean)=>void;projectPath?:string;disabled?:boolean;
}) {
 const first=discussion?.participants.find(p=>p.id==='a')?.agent??value;
 const second=discussion?.participants.find(p=>p.id==='b')?.agent;
 const {backend,selection,models,loading,provider,valid,refresh}=useDecisionModels(first,projectPath);
 const [secondValid,setSecondValid]=useState(true);
 const changeFirst=(agent:DecisionAgent)=>{if(discussion)onDiscussion?.({...discussion,participants:discussion.participants.map(p=>p.id==='a'?{...p,agent}:p)});else onChange(agent);};
 const [settings,setSettings]=useState<AgentId|null>(null),[settingsRole,setSettingsRole]=useState<AgentPoolRole>('decision');
 const settingsButton=useRef<HTMLButtonElement|null>(null),panel=useRef<HTMLDivElement|null>(null);
 const close=()=>{setSettings(null);settingsButton.current?.focus();};
 const modelValid=first?.backend!=='claude-code'||!first.model||/^[a-zA-Z0-9._:/-]{1,200}$/.test(first.model);
 useEffect(()=>onValid(valid&&modelValid&&(!discussion||secondValid)),[valid,modelValid,discussion,secondValid,onValid]);
 useEffect(()=>{
  if(!settings)return;
  panel.current?.querySelector<HTMLElement>('select:not(:disabled),button:not(:disabled)')?.focus();
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();close();}};
  document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);
 },[settings,settingsRole]);
 const select=(id:AgentId)=>{
  if(id===backend)return;
  onValid(id!=='opencode');
  changeFirst(id==='opencode'?{backend:'opencode',opencode:{providerID:'',modelID:''}}:id==='codex'?{backend:'codex'}:{backend:'claude-code'});
  setSettingsRole('decision');setSettings(id==='opencode'?'opencode':null);
 };
 const modelText=(id:AgentId)=>id==='opencode'?(selection?.modelID||'选择 Provider 与模型'):id==='claude-code'?(first?.backend==='claude-code'?first.model||'本机默认模型':'本机默认模型'):(first?.backend==='codex'?first.model||'SDK 默认模型':'SDK 默认模型');
 const pool=(role:AgentPoolRole)=><section className={'agent-pool '+role} aria-label={role==='decision'?'决策池':'执行池'}>
  <header><h4>{role==='decision'?'决策池':'执行池'}</h4>{role==='decision'&&onDiscussion&&<select aria-label="决策者模式" disabled={disabled} value={discussion?'dual':'single'} onChange={e=>{setSecondValid(true);if(e.target.value==='single'){onDiscussion(undefined);}else onDiscussion({participants:[{id:'a',agent:first??{backend:'claude-code'}},{id:'b',agent:{backend:'claude-code'}}],primary:'a',rounds:1});}}><option value="single">单决策者</option><option value="dual">双决策者</option></select>}</header>
  {role==='decision'&&discussion&&<p className="participant-label">决策者 A</p>}
  <div className="agent-cards">{agentCapabilities.map(agent=>{
   const supported=supportsPool(agent,role),selected=role==='decision'?backend===agent.id:agent.id==='codex';
   const status=!supported?'尚未支持':agent.id==='opencode'?(backend!=='opencode'?'实验性 · V1':loading?'正在发现模型':!models?.available?'不可用':valid?'实验性 · 已就绪':'待配置'):'可用';
   return <div className={`agent-card ${selected?'selected':''} ${!supported?'unsupported':''}`} key={agent.id}>
    <button type="button" className="agent-choice" aria-label={`${role==='decision'?'决策池':'执行池'} ${agent.name}`} aria-pressed={selected} disabled={disabled||!supported} onClick={()=>role==='decision'&&select(agent.id)}>
     <AgentLogo agent={agent.id}/><span className="agent-card-copy"><strong>{agent.name}</strong><span>{role==='decision'?'决策者':'执行者'} · {status}</span><small>{supported?(role==='execution'?'SDK 默认模型':modelText(agent.id)):role==='decision'?'决策适配将在后续开放':'执行适配将在后续开放'}</small></span>{selected&&<Check className="agent-selected-mark" size={15}/>}
    </button>
    {supported&&<button type="button" className="agent-settings" aria-label={`${role==='decision'?'决策池':'执行池'} ${agent.name} 设置`} aria-expanded={settings===agent.id&&settingsRole===role} disabled={disabled} onClick={event=>{settingsButton.current=event.currentTarget;setSettingsRole(role);if(role==='decision'&&backend!==agent.id)select(agent.id);setSettings(settings===agent.id&&settingsRole===role?null:agent.id);}}><Settings2 size={14}/></button>}
   </div>;
  })}</div>
  {settings&&settingsRole===role&&(role==='decision'?true:settings==='codex')&&<div className="agent-config" ref={panel} role="region" aria-label={`${agentCapabilities.find(agent=>agent.id===settings)!.name} 配置`}>
   <div className="agent-config-heading"><strong>{agentCapabilities.find(agent=>agent.id===settings)!.name} 设置</strong><button type="button" aria-label="关闭 Agent 设置" onClick={close}><X size={14}/></button></div>
   {settings==='opencode'?<>
    <label>Provider<select aria-label="OpenCode Provider" disabled={disabled||loading||!models?.available} value={selection?.providerID??''} onChange={event=>changeFirst({backend:'opencode',opencode:{providerID:event.target.value,modelID:''}})}><option value="">请选择 Provider</option>{models?.providers.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Model<select aria-label="OpenCode Model" disabled={disabled||loading||!models?.available||!provider} value={selection?.modelID??''} onChange={event=>changeFirst({backend:'opencode',opencode:{providerID:selection!.providerID,modelID:event.target.value}})}><option value="">请选择 Model</option>{provider?.models.map(item=><option value={item.id} key={item.id} disabled={item.capabilities.tools!==true||item.capabilities.structuredOutput!==true}>{item.name}{item.capabilities.tools!==true||item.capabilities.structuredOutput!==true?'（能力不足或未知）':''}</option>)}</select></label>
    <p>实验性 V1；远端 Plan / Review 尚未验证。模型动态发现，启动时再次核验。</p>
    <button type="button" className="text-button" disabled={disabled||loading} onClick={refresh}>刷新模型</button>
   </>:settings==='claude-code'?<><label>Provider<select aria-label="Claude Code Provider" disabled><option>本机 Claude Code 配置</option></select></label><label>Model<input aria-label="Claude Code Model" disabled={disabled} placeholder="本机默认；或 sonnet / opus / 完整模型 ID" value={first?.backend==='claude-code'?first.model??'':''} onChange={e=>changeFirst({backend:'claude-code',...(e.target.value?{model:e.target.value}:{})})}/></label><p>独立 Session；模型通过 CLI --model 绑定，空值沿用本机默认。</p></>:role==='decision'?<><label>Model<input aria-label="Codex Decision Model" disabled={disabled} placeholder="SDK 默认；或当前账户支持的模型 ID" value={first?.backend==='codex'?first.model??'':''} onChange={e=>changeFirst({backend:'codex',...(e.target.value?{model:e.target.value}:{})})}/></label><p>独立决策 Thread；SDK model 配置。模型可用性由服务校验。</p></>:<p>执行者沿用当前 Codex SDK 默认模型。</p>}
  </div>}
  {role==='decision'&&discussion&&<div className="second-decision" aria-label="决策者 B 配置"><p className="participant-label"><AgentLogo agent={second?.backend??'claude-code'}/>决策者 B</p><DecisionAgentSelect value={second} projectPath={projectPath} disabled={disabled} onValid={setSecondValid} onChange={agent=>{setSecondValid(agent.backend!=='opencode');onDiscussion?.({...discussion,participants:discussion.participants.map(p=>p.id==='b'?{...p,agent}:p)});}}/><div className="discussion-options"><label>主决策者<select aria-label="主决策者" disabled={disabled} value={discussion.primary} onChange={e=>onDiscussion?.({...discussion,primary:e.target.value as 'a'|'b'})}><option value="a">决策者 A</option><option value="b">决策者 B</option></select></label><label>讨论轮数<select aria-label="讨论轮数" disabled={disabled} value={discussion.rounds} onChange={e=>onDiscussion?.({...discussion,rounds:Number(e.target.value) as 0|1})}><option value="0">0 轮 · 独立初稿后汇总</option><option value="1">1 轮 · 交换初稿后汇总</option></select></label></div></div>}
 </section>;
 return <div className="role-board"><div className="role-pools">{pool('decision')}{pool('execution')}</div>{backend==='opencode'&&<div className={`discovery-status ${!loading&&!models?.available?'unavailable':''}`} role="status">{loading?'正在查询已连接的 Provider 与模型…':!models?.available?models?.reason||'模型发现失败，请打开设置刷新。':!valid?'请选择支持原生工具与结构化输出的模型。':`OpenCode · ${selection?.providerID} / ${selection?.modelID}`}</div>}</div>;
}
