import React,{useEffect,useState} from 'react';
import type {DecisionAgent,DecisionModels,Run} from './types.js';

export function decisionLabel(selection?:DecisionAgent|Run['decisionAgent']):string {
 if(selection?.backend!=='opencode')return `Claude Code（${selection?.model??'本机默认模型'}）`;
 const model='opencode' in selection?selection.opencode:selection;
 return `OpenCode · ${model.providerID} / ${model.modelID}`;
}
export function useDecisionModels(value?:DecisionAgent,projectPath?:string,operation:"decisionModels"|"executionModels"="decisionModels"){
 const [models,setModels]=useState<DecisionModels|null>(null),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
 const backend=value?.backend??'claude-code',selection=value?.backend==='opencode'?value.opencode:null;
 const scope=`${operation}:${backend}:${projectPath??''}:${revision}`;
 const [discoveredScope,setDiscoveredScope]=useState('');
 useEffect(()=>{
  let live=true;
  if(backend!=='opencode'){setLoading(false);setModels(null);return;}
  setLoading(true);setModels(null);
  void window.personalAgent.invoke<DecisionModels>({operation,...(projectPath?{projectPath}:{})}).then(result=>{if(live){setModels(result);setDiscoveredScope(scope);}}).catch(error=>{if(live){setModels({available:false,reason:error.message,providers:[]});setDiscoveredScope(scope);}}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[backend,projectPath,revision,operation]);
 const provider=models?.providers.find(p=>p.id===selection?.providerID),model=provider?.models.find(m=>m.id===selection?.modelID);
 const discovering=backend==='opencode'&&(loading||discoveredScope!==scope);
 const valid=backend==='claude-code'?(value?.backend!=='claude-code'||!value.model||/^[a-zA-Z0-9._:/-]{1,200}$/.test(value.model)):Boolean(!discovering&&models?.available&&model?.capabilities.tools===true&&model?.capabilities.structuredOutput===true);
 return {backend,selection,models,loading:discovering,provider,model,valid,refresh:()=>setRevision(n=>n+1)};
}
export default function DecisionAgentSelect({value,onChange,onValid,projectPath,disabled=false}:{value?:DecisionAgent;onChange:(value:DecisionAgent)=>void;onValid:(valid:boolean)=>void;projectPath?:string;disabled?:boolean}){
 const {backend,selection,models,loading,provider,valid,refresh}=useDecisionModels(value,projectPath);
 useEffect(()=>onValid(valid),[valid,onValid]);
 return <div className="decision-agent-settings">
  <label>决策 Agent<select aria-label="决策 Agent" disabled={disabled} value={backend} onChange={e=>onChange(e.target.value==='opencode'?{backend:'opencode',opencode:{providerID:'',modelID:''}}:{backend:'claude-code'})}><option value="claude-code">Claude Code</option><option value="opencode">OpenCode</option></select></label>
  {backend==='claude-code'&&<><label>Provider<select aria-label="Claude Code Provider" disabled><option>本机 Claude Code 配置</option></select></label><label>Model<input aria-label="Claude Code Model" placeholder="本机默认；或 sonnet / opus / 完整模型 ID" disabled={disabled} value={value?.backend==='claude-code'?value.model??'':''} onChange={e=>onChange({backend:'claude-code',...(e.target.value?{model:e.target.value}:{})})}/></label></>}
  {backend==='opencode'&&<><label>Provider<select aria-label="OpenCode Provider" disabled={disabled||loading||!models?.available} value={selection?.providerID??''} onChange={e=>onChange({backend:'opencode',opencode:{providerID:e.target.value,modelID:''}})}><option value="">请选择 Provider</option>{models?.providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Model<select aria-label="OpenCode Model" disabled={disabled||loading||!models?.available||!provider} value={selection?.modelID??''} onChange={e=>onChange({backend:'opencode',opencode:{providerID:selection!.providerID,modelID:e.target.value}})}><option value="">请选择 Model</option>{provider?.models.map(m=><option key={m.id} value={m.id} disabled={m.capabilities.tools!==true||m.capabilities.structuredOutput!==true}>{m.name}{m.capabilities.tools!==true||m.capabilities.structuredOutput!==true?'（能力不足或未知）':''}</option>)}</select></label><p className="field-help" role="status">{loading?'正在查询已连接的 Provider 与模型…':!models?.available?models?.reason:!valid?'请选择支持原生工具与结构化输出的模型。':'模型来自当前受控服务动态发现；启动时再次核验。'}</p><button type="button" className="text-button" disabled={disabled||loading} onClick={refresh}>刷新模型</button></>}
  <p className="field-help">OpenCode 为实验性可选后端，仅验证 V1 CLI 本地协议；远端 Plan/Review 尚未验证。默认使用 Claude Code。任务轮数、返工与交付审批保持不变。</p>
 </div>;
}
