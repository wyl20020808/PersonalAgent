import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import AgentRoleBoard from './src/AgentRoleBoard.js';
import type {DecisionAgent,ExecutionAgent,DecisionDiscussion} from './src/types.js';
import './src/style.css';
import './src/codex.css';
const providers=[{id:'fixture',name:'已连接 Provider（UI 夹具）',models:[{id:'tool-model',name:'支持工具的模型（UI 夹具）',reasoningEfforts:['high','max'],capabilities:{tools:true,structuredOutput:true}},{id:'weak',name:'能力不足（UI 夹具）',capabilities:{tools:false,structuredOutput:true}}]}];
const queries:Record<string,number>={};(window as any).modelQueries=queries;
window.personalAgent={invoke:async(request:any)=>{const key=request.backend??request.operation;queries[key]=(queries[key]??0)+1;if(request.operation==='nativeModels')return{models:request.backend==='claude-code'?[{id:'sonnet',name:'Sonnet',description:''},{id:'opus',name:'Opus',description:''}]:[{id:'fixture-codex',name:'Codex 列表模型（UI 夹具）',description:'',reasoningEfforts:['low','high','max']}]} as any;if(request.operation==='decisionModels'||request.operation==='executionModels')return{available:true,providers} as any;throw Error('Unexpected preview request');}};
function Preview(){const [decision,setDecision]=useState<DecisionAgent>({backend:'claude-code'}),[execution,setExecution]=useState<ExecutionAgent>({backend:'codex'}),[discussion,setDiscussion]=useState<DecisionDiscussion|undefined>(),[valid,setValid]=useState(false);return <main style={{maxWidth:960,margin:'70px auto',padding:24}}><p style={{textAlign:'center',fontSize:12,color:'#8390a0'}}>隔离组件 UI 验证 · 模型列表为本地夹具</p><AgentRoleBoard value={decision} onChange={setDecision} execution={execution} onExecution={setExecution} discussion={discussion} onDiscussion={(discussion,single)=>{setDiscussion(discussion);setDecision(single??discussion?.participants.find(p=>p.id===discussion.primary)?.agent??decision);}} onValid={setValid}/><pre id="selection" hidden>{JSON.stringify({decision,execution,discussion,valid})}</pre></main>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
