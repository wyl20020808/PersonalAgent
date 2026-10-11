import React,{useEffect,useRef,useState} from 'react';
import {ArrowRight,LoaderCircle,X} from 'lucide-react';
import {decisionLabel,useDecisionModels} from './DecisionAgentSelect.js';
import {executionLabel} from './ExecutionAgentSelect.js';
import type {DecisionAgent,ExecutionAgent} from './types.js';

export default function AgentSwitchDialog({role,value,projectPath,busy,onClose,onConfirm}:{role:'decision'|'execution';value:DecisionAgent;projectPath?:string;busy:boolean;onClose:()=>void;onConfirm:(choice:DecisionAgent)=>void}){
 const [choice,setChoice]=useState<DecisionAgent>(value),dialog=useRef<HTMLDivElement>(null),latest=useRef({busy,onClose});latest.current={busy,onClose};
 const {models,loading,selection,provider,valid,refresh}=useDecisionModels(choice,projectPath,role==='decision'?'decisionModels':'executionModels');
 const label=role==='decision'?'决策者':'执行者',changed=JSON.stringify(choice)!==JSON.stringify(value);
 const current=role==='decision'?decisionLabel(value):executionLabel(value as ExecutionAgent);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLElement>('select')?.focus();
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!latest.current.busy)latest.current.onClose();if(event.key==='Tab'){const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled)')??[]),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};
 },[]);
 return <div className="agent-switch-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}><div ref={dialog} className="agent-switch-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-switch-title"><header><div><h3 id="agent-switch-title">切换{label}</h3><p>当前：{current}</p></div><button type="button" className="icon-button" aria-label="关闭切换" disabled={busy} onClick={onClose}><X size={17}/></button></header>
  <label>{label}<select aria-label={`新的${label}`} disabled={busy} value={choice.backend} onChange={event=>{const backend=event.target.value as DecisionAgent['backend'];setChoice(backend==='opencode'?{backend,opencode:{providerID:'',modelID:''}}:{backend});}}>{role==='decision'&&<option value="claude-code">Claude Code</option>}<option value="codex">Codex</option><option value="opencode">OpenCode</option></select></label>
  {choice.backend==='opencode'?<><label>Provider<select aria-label="切换 Provider" disabled={busy||loading||!models?.available} value={selection?.providerID??''} onChange={event=>setChoice({backend:'opencode',opencode:{providerID:event.target.value,modelID:''}})}><option value="">选择 Provider</option>{models?.providers.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Model<select aria-label="切换 Model" disabled={busy||loading||!provider} value={selection?.modelID??''} onChange={event=>setChoice({backend:'opencode',opencode:{providerID:selection!.providerID,modelID:event.target.value}})}><option value="">选择 Model</option>{provider?.models.map(item=><option key={item.id} value={item.id} disabled={item.capabilities.tools!==true||item.capabilities.structuredOutput!==true}>{item.name}</option>)}</select></label><div className="agent-switch-discovery" role="status">{loading?'正在查询模型…':models?.available?'仅显示当前 Provider 的模型':models?.reason??'模型暂不可用'}<button type="button" className="text-button" disabled={busy||loading} onClick={refresh}>刷新</button></div></>:role==='decision'&&<label>Model<input aria-label="切换决策 Model" placeholder="留空使用默认模型" disabled={busy} value={choice.model??''} onChange={event=>setChoice({...choice,model:event.target.value||undefined})}/></label>}
  <p className="agent-switch-handoff">{role==='decision'?'已有计划与修改保留，新决策者接手未完成节点。':'已有修改保留，新执行者继续当前任务。'}输入框草稿会作为交接说明。</p>
  <footer><button type="button" className="button secondary" disabled={busy} onClick={onClose}>取消</button><button type="button" className="button primary" disabled={busy||!changed||!valid} onClick={()=>onConfirm(choice)}>{busy?<LoaderCircle size={15} className="spin"/>:<ArrowRight size={15}/>}切换并继续</button></footer>
 </div></div>;
}
