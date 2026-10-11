import React,{useEffect,useState} from 'react';
import type {DecisionAgent,DecisionModels,Run} from './types.js';
import {Settings2} from 'lucide-react';
import AgentModelDialog from './AgentModelDialog.js';

export function decisionLabel(selection?:DecisionAgent|Run['decisionAgent']):string {
 if(selection?.backend==='codex')return `Codex（${selection.model??'SDK 默认模型'}）`;
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
 const valid=backend!=='opencode'?(!value||value.backend==='opencode'||!value.model||/^[a-zA-Z0-9._:/-]{1,200}$/.test(value.model)):Boolean(!discovering&&models?.available&&model?.capabilities.tools===true&&model?.capabilities.structuredOutput===true);
 return {backend,selection,models,loading:discovering,provider,model,valid,refresh:()=>setRevision(n=>n+1)};
}
export default function DecisionAgentSelect({value,onChange,onValid,projectPath,disabled=false}:{value?:DecisionAgent;onChange:(value:DecisionAgent)=>void;onValid:(valid:boolean)=>void;projectPath?:string;disabled?:boolean}){
 const choice=value??{backend:'claude-code'},[settings,setSettings]=useState<DecisionAgent|null>(null);
 const {valid}=useDecisionModels(choice,projectPath);
 useEffect(()=>onValid(valid),[valid,onValid]);
 return <div className="decision-agent-settings"><label>决策 Agent<select aria-label="决策 Agent" disabled={disabled} value={choice.backend} onChange={event=>{const backend=event.target.value as DecisionAgent['backend'];if(backend==='opencode')setSettings({backend,opencode:{providerID:'',modelID:''}});else onChange({backend});}}><option value="claude-code">Claude Code</option><option value="opencode">OpenCode</option><option value="codex">Codex</option></select></label><button type="button" className="decision-model-button" aria-label="决策者模型设置" aria-haspopup="dialog" disabled={disabled} onClick={()=>setSettings(choice)}><span>{decisionLabel(choice)}</span><Settings2 size={14}/></button>{settings&&<AgentModelDialog role="decision" value={settings} projectPath={projectPath} onClose={()=>setSettings(null)} onConfirm={onChange}/>}</div>;
}
