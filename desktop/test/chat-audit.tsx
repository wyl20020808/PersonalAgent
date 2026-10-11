import React from 'react';
import {createRoot} from 'react-dom/client';
import '../src/style.css';
import {Message,EventGroup} from '../src/GroupWorkspace.js';
import '../src/codex.css';
import '../src/chat-messages.css';
import type {ChatMessage} from '../src/types.js';
const base:ChatMessage={id:'',role:'user',kind:'output',status:'recorded',title:'',text:'',time:'2026-10-11T01:12:53Z',runId:'ui-fixture',taskId:'chat-ui',loop:1,source:'隔离 UI fixture；未调用真实 Agent'};
const entries:ChatMessage[]=[
 {...base,id:'user',title:'你的需求',text:'检查聊天区：决策者在左，执行者在右，我在中间。保留每个 Agent 的官方头像。'},
 {...base,id:'claude',role:'claude',participantRole:'决策者',title:'检查计划',text:'先核对身份与消息分组，再修正布局。\n\n- 检查工具输出和失败状态\n- 检查验收卡片与原始证据'},
 {...base,id:'codex-decision',role:'codex',participantRole:'主决策者',title:'公开进度摘要',text:'同一个 Codex 也能担任决策者。消息位置应由任务角色决定。'},
 {...base,id:'opencode',role:'opencode',participantRole:'执行者',decisionStage:'execute',title:'OpenCode 工具 · bash',kind:'tool',status:'success',text:JSON.stringify({receipt:{tool:'bash',status:'completed',input:{command:'node scripts/check-layout.mjs'},output:'layout: PASS\navatars: PASS'}}),details:{protocol:'opencode-sdk'}},
 {...base,id:'codex',role:'codex',participantRole:'执行者',decisionStage:'execute',title:'Codex 文件操作',kind:'tool',status:'success',text:'completed\n[{"path":"desktop/src/chat-messages.css","kind":"update"}]',details:{protocol:'codex-sdk-runStreamed'}},
 {...base,id:'check',role:'controller',title:'独立验收通过 · 模拟展示',kind:'tests',status:'pass',text:'这是 UI 测试数据，仅用于检查卡片布局。',details:{tests:[{exitCode:0,stdout:'fixture checks passed',stderr:''}],diff:'diff --git a/example.css b/example.css\n-padding: 0;\n+padding: 16px 18px;'}},
 {...base,id:'failure',role:'codex',participantRole:'执行者',title:'Codex 执行事件',kind:'tool',status:'fail',text:'node missing-script.mjs\nfailed · exit_code=1\nError: Cannot find module missing-script.mjs',details:{protocol:'codex-sdk-runStreamed'}},
];
function Preview(){const [expanded,setExpanded]=React.useState(false);return <><header style={{padding:'20px 28px',borderBottom:'1px solid #e2e7ee',fontSize:14}}>聊天区修复验证 · 模拟数据 · DEV 32ec301 基线</header><div className="chat-feed" style={{maxWidth:1100,margin:'auto',overflow:'visible',height:'auto',minHeight:0}}>{entries.map(message=><Message key={message.id} message={message}/>)}<EventGroup group={{id:'group-fixture',category:'命令',messages:[{...entries[3],id:'group-1'},{...entries[3],id:'group-2'}],status:'success',firstTime:base.time,lastTime:base.time}} expanded={expanded} onToggle={()=>setExpanded(v=>!v)}/></div></>}
createRoot(document.getElementById('root')!).render(<Preview/>);
