import React from 'react';
import {createRoot} from 'react-dom/client';
import GroupWorkspace from '../src/GroupWorkspace.js';
import '../src/style.css';
import '../src/group.css';
import '../src/codex.css';
import '../src/chat-messages.css';
const start=new Date(Date.now()-10000).toISOString();
const run:any={id:'fixture',profileId:'fixture',active:true,phase:'executing',source:'D:/fixture',workspace:'D:/fixture',tasks:[],taskIndex:0,updatedAt:start,config:{},decisionAgent:{backend:'codex'},executionAgent:{backend:'codex'}};
let stopped=false;
(window as any).personalAgent={invoke:async(request:any)=>{
 if(request.operation==='pictures')return [];
 if(request.operation==='stop'){stopped=true;document.body.dataset.stopped='true';return {requested:true};}
 if(request.operation==='thread')return {messages:[{id:'fixture-message',runId:'fixture',role:'codex',participantRole:'执行者',kind:'text',status:'success',time:start,title:'fixture',text:'fixture',source:'fixture',loop:1}],timing:{decisionMs:0,executionMs:0,running:stopped?null:run.phase==='review'?'decision':'execution',since:start},cursor:null,hasMore:false,reset:false,capabilities:{}};
 throw Error('Unexpected operation '+request.operation);
}};
const root=createRoot(document.getElementById('root')!);
const render=()=>root.render(<GroupWorkspace run={{...run}} onDetails={()=>{}} onDelivery={()=>{}} onGoal={()=>{}}/>);
(window as any).fixture={review:()=>{run.phase='review';render();},finish:()=>{run.active=false;render();}};
render();
