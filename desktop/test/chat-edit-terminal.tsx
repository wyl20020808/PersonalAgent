import React from 'react';
import {createRoot} from 'react-dom/client';
import {EventGroup} from '../src/GroupWorkspace.js';
import {FilePreviewContext} from '../src/FilePreview.js';
import type {ChatMessage} from '../src/types.js';
import '../src/style.css';
import '../src/group.css';
import '../src/chat-messages.css';
const base:ChatMessage={id:'audit:'+'a'.repeat(64),runId:'run',role:'codex',kind:'tool',status:'success',time:'',title:'Codex 文件操作',text:'',source:'fixture',taskId:'task',loop:1,details:{protocol:'codex-sdk-runStreamed',profileId:'profile'}};
const edited={...base,text:'completed\n'+JSON.stringify([{path:'D:/Demo/src/code.ts',kind:'update'},{path:'D:\\Demo\\other\\code.ts',kind:'update'}])};
const created={...base,id:'audit:'+'b'.repeat(64),text:'completed\n'+JSON.stringify([{path:'D:/Demo/new.py',kind:'add'}])};
const binary={...base,id:'audit:'+'c'.repeat(64),text:'completed\n'+JSON.stringify([{path:'D:/Demo/image.png',kind:'update'}])};
const command={...base,id:'command',title:'Codex 执行事件',text:'rtk npm run build\ncompleted · exit_code=0\nline one\nline two\n'+('long output '.repeat(90))};
const patch=(name:string,extra=false)=>`diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -1 +1,${extra?2:1} @@\n-old\n+new\n${extra?'+extra\n':''}`;
const finish={...base,id:'finish',kind:'changes',text:'',details:{diff:patch('src/code.ts',true)+patch('other/code.ts'),protocol:'Controller limited Git observation'}};
const real=await fetch('/real-data.json').then(response=>response.json());
const messages:ChatMessage[]=real?.messages??[edited,created,binary,command,finish];
window.personalAgent={invoke:async(request:any)=>real?real.previews[request.file]:request.file.endsWith('.png')?{path:request.file,scope:'当前工作区',notice:'二进制文件'}:{path:request.file,scope:'当前工作区与 Git HEAD 比较（不是历史事件快照）',change:{path:request.file,added:4,removed:0,lines:[],diff:''}}} as any;
function Fixture(){
 return <FilePreviewContext.Provider value={{messages,roots:real?.roots??['D:/Demo'],openFile:(_,path)=>{document.body.dataset.opened=path;}}}><div className="group-workspace" data-profile-id="profile"><div className="chat-feed"><EventGroup group={{id:'fixture',category:'执行操作',messages:real?messages:messages.slice(0,4),status:'success'} as any} expanded onToggle={()=>{}}/></div></div></FilePreviewContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
