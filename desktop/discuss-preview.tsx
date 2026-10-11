import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import GroupWorkspace from './src/GroupWorkspace.js';
import type {Conversation,SessionDraft} from './src/types.js';
import './src/style.css';
function Preview(){
 const [draft,setDraft]=useState<SessionDraft>({projectPath:new URLSearchParams(location.search).get('project')!,projectName:'讨论测试项目',mode:'mock',projectMode:'direct',selectedTests:[],maxClaudeCalls:5});
 const [session,setSession]=useState<Conversation>();
 return <GroupWorkspace draft={draft} onDraft={setDraft} conversation={session} onOpenConversation={setSession} onConversationChange={setSession} run={null} onDetails={()=>{}} onDelivery={()=>{}} onGoal={()=>{}}/>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
