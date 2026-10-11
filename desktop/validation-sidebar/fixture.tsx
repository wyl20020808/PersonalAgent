import React from 'react';
import {createRoot} from 'react-dom/client';
import '../src/style.css';
import GroupWorkspace from '../src/GroupWorkspace.js';
import '../src/codex.css';
import '../src/chat-messages.css';
import type {Run,Picture} from '../src/types.js';
const time=new Date().toISOString();
const run={id:'fixture-run',profileId:'fixture',source:'D:/fixture',workspace:'D:/fixture',goal:'核验右侧决策与多标签预览',phase:'paused',reason:'fetch failed',updatedAt:time,mode:'real',tasks:[{id:'sidebar',instruction:'预览',acceptance:[]}],taskIndex:0,completedTaskIds:[],loops:1,claudeCalls:1,totalReworks:0,reworks:0,executorExitCode:-1,config:{maxLoops:8,maxClaudeCalls:8,maxReworks:1},evidence:null,failure:{kind:'transport',message:'fetch failed',recoverable:true},active:false} as Run;
const pictures:Picture[]=['第一张.png','第二张.png'].map((name,index)=>({id:String(index),name,width:1,height:1,hash:'a'.repeat(64),time,taskId:'sidebar',loop:1,source:'fixture',url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/e0AAAAASUVORK5CYII='}));
(window as any).calls=[];
window.personalAgent={invoke:async(request)=>{(window as any).calls.push(request);switch(request.operation){case 'thread':return {messages:[],cursor:null,hasMore:false,capabilities:{}} as any;case 'pictures':return pictures as any;case 'listProjectFiles':return {entries:[{name:'one.ts',directory:false},{name:'two.ts',directory:false}],truncated:false} as any;case 'readProjectFile':return {path:request.file,text:'export const name = '+JSON.stringify(request.file)+';',truncated:false} as any;default:return {} as any;}}};
const root=createRoot(document.getElementById('root')!);
(window as any).switchRun=()=>render({...run,id:'other-run',source:'D:/other',phase:'completed',active:false,evidence:{passed:true,verificationScope:'聚焦验证夹具',issues:[],tests:[],diff:''}});
function render(value:Run){root.render(<div className="workspace" style={{marginLeft:0,width:'100%'}}><main><GroupWorkspace run={value} onDetails={()=>{}} onDelivery={()=>{}} onGoal={()=>{}}/></main></div>);}
render(run);
