import React from 'react';
import {createRoot} from 'react-dom/client';
import GroupWorkspace from './src/GroupWorkspace.js';
import './src/style.css';
import './src/codex.css';
const id='11111111-1111-4111-8111-111111111111';
const time=new Date().toISOString();
const run:any={id,profileId:id,goal:'优化聊天工作台的附件交付与事件更新',source:'D:/PreviewProject',workspace:'D:/PreviewProject',phase:'executing',reason:'',updatedAt:time,mode:'real',tasks:[{id:'chat',instruction:'附件与事件流',acceptance:['附件完整保存']}],taskIndex:0,completedTaskIds:[],loops:1,claudeCalls:1,totalReworks:0,config:{maxClaudeCalls:5,maxLoops:8,maxReworks:1},evidence:null,failure:null,active:true,decisionAgent:{backend:'claude-code'},executionAgent:{backend:'codex'}};
const session:any={id,title:'聊天工作台优化',projectPath:run.source,projectName:'Personal Agent',createdAt:time,updatedAt:time,settings:{mode:'real',projectMode:'direct',decisionAgent:{backend:'claude-code'},executionAgent:{backend:'codex'},maxClaudeCalls:5,maxLoops:8,maxReworks:1},runs:[{id,profileId:id}],messages:[{id:'user',time,text:'支持图片粘贴、逐个移除，并让任务提交状态更清楚。',status:'executed'}],budget:{claudeUsed:1,loopsUsed:1,claudeRemaining:4,loopsRemaining:7},status:'executing'};
const messages=[{id:'decision',role:'claude',participantRole:'规划 · 审查',title:'本轮计划',text:'先检查附件是否完整保存，再修复事件通知与重连。\n\n文件浏览放到右侧，聊天区域专注当前任务。',time,kind:'plan',status:'success',runId:id,taskId:'chat',loop:1,source:'preview fixture'},{id:'execution',role:'codex',participantRole:'执行者',title:'正在实现',text:'已补充附件校验和发送状态。正在验证重复事件不会并发刷新。',time,kind:'message',status:'running',runId:id,taskId:'chat',loop:1,source:'preview fixture'}];
messages.push({...messages[1],id:'command-preview',title:'Codex 执行事件',text:'```powershell\nrtk proxy node --test dist/test/example.test.js\n```',kind:'activity',category:'commands'} as any);
messages.push({...messages[0],id:'controller-preview',role:'controller',participantRole:'独立验收',title:'独立验收通过',text:'可信验收程序已完成。',kind:'tests',status:'pass'});
(window as any).__sent=[];
window.personalAgent={invoke:async(r:any)=>{
 if(r.operation==='sessionDetail')return {session,runs:[run]};
 if(r.operation==='thread')return {messages,cursor:'fixture',hasMore:false,reset:false,total:2,lastActivity:time,capabilities:{claudeStreaming:true,codexPublicEvents:true,imagesToClaude:false}};
 if(r.operation==='pictures')return [];
 if(r.operation==='listProjectFiles')return {entries:[{name:'desktop',directory:true},{name:'src',directory:true},{name:'README.md',directory:false},{name:'package.json',directory:false}],truncated:false};
 if(r.operation==='readProjectFile'){await new Promise(resolve=>setTimeout(resolve,r.file==='README.md'?180:10));return {path:r.file,size:25,mimeType:'text/plain',text:'# Personal Agent\n只读项目预览',truncated:false};}
 if(r.operation==='sendSession'){(window as any).__sent.push(r);await new Promise(resolve=>setTimeout(resolve,800));return session;}
 throw Error('Unexpected fixture request: '+r.operation);
}} as any;
localStorage.setItem('personalagent:details-open','1');
createRoot(document.getElementById('root')!).render(<div style={{height:'100vh',background:'#f5f7f9'}}><div style={{position:'fixed',bottom:4,right:12,fontSize:10,color:'#64748b',zIndex:30}}>隔离 UI 验证 · 示例会话 · 未调用 Agent</div><GroupWorkspace run={run} conversation={session} onGoal={()=>{}} onDetails={()=>{}} onDelivery={()=>{}}/></div>);
