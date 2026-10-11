import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import GroupWorkspace from '../../desktop/src/GroupWorkspace.js';
import '../../desktop/src/style.css';
import '../../desktop/src/codex.css';
import '../../desktop/src/chat-messages.css';
const id='11111111-1111-4111-8111-111111111111',time=new Date().toISOString();
const run:any={id,profileId:id,goal:'暂停与执行者交接 UI 隔离验证',source:'D:/PreviewProject',workspace:'D:/PreviewProject',phase:'executing',reason:'',updatedAt:time,mode:'real',tasks:[{id:'ui',instruction:'暂停按钮',acceptance:['保留记录']}],taskIndex:0,completedTaskIds:[],loops:1,claudeCalls:1,totalReworks:0,config:{maxClaudeCalls:5},evidence:null,failure:null,active:true,decisionAgent:{backend:'claude-code'},executionAgent:{backend:'opencode',opencode:{providerID:'test',modelID:'test'}}};
const session:any={id,title:'暂停任务',projectPath:run.source,projectName:'Preview',settings:{mode:'real',projectMode:'direct'},runs:[{id,profileId:id}],messages:[{id:'user',time,text:'修复按钮',status:'executed'}]};
const interactive=new URLSearchParams(location.search).has('interactive');
if(interactive)localStorage.setItem('personalagent:details-open','0');
const api:any={calls:[],failStop:false,update:null,currentRun:run,timingSince:new Date().toISOString()};(window as any).__test=api;
window.personalAgent={invoke:async(request:any)=>{
 if(request.operation==='sessionDetail')return {session,runs:[run]};
 if(request.operation==='thread'){const state=api.currentRun;return {messages:[],cursor:'fixture',hasMore:false,timing:{decisionMs:62000,executionMs:140000,running:state.active?['planning','review'].includes(state.phase)?'decision':'execution':null,since:state.active?api.timingSince:null}};}
 if(request.operation==='pictures')return [];
 if(request.operation==='listProjectFiles')return {entries:[],truncated:false};
 if(request.operation==='executionModels'||request.operation==='decisionModels')return {available:true,providers:[{id:'test',name:'Test',models:[{id:'test',name:'Test',capabilities:{tools:true,structuredOutput:true}}]}]};
 api.calls.push(request);await new Promise(resolve=>setTimeout(resolve,80));
 if(request.operation==='stop'&&api.failStop)throw Error('暂停请求失败');
 if(interactive&&request.operation==='stop'){await new Promise(resolve=>setTimeout(resolve,500));api.update({phase:'stopped',active:false});}
 if(interactive&&request.operation==='resume'){api.update({phase:request.decisionAgent?'planning':'executing',active:true,...(request.executionAgent?{executionAgent:request.executionAgent}:{}),...(request.decisionAgent?{decisionAgent:request.decisionAgent.backend==='opencode'?{backend:'opencode',...request.decisionAgent.opencode}:request.decisionAgent}:{})});}
 if(request.operation==='sendSession')return session;
 return {requested:true};
}} as any;
function Fixture(){const [state,setState]=useState(run),[readOnly,setReadOnly]=useState(false);api.update=(changes:any,readonly=false)=>{api.currentRun={...run,...changes};setState(api.currentRun);setReadOnly(readonly);};return <><div style={{position:'fixed',top:0,left:0,right:0,height:28,background:'#eef6f4',color:'#426b61',fontSize:12,display:'grid',placeItems:'center',zIndex:100}}>独立分支 UI 演示 · 未连接 DEV · 暂停与切换仅作用于演示状态</div><div style={{height:'100%',paddingTop:28,boxSizing:'border-box'}}><GroupWorkspace run={state} conversation={session} profile={{readOnly} as any} onGoal={()=>{}} onDetails={()=>{}} onDelivery={()=>{}}/></div></>;}
createRoot(document.getElementById('root')!).render(<div style={{height:'100vh'}}><Fixture/></div>);
