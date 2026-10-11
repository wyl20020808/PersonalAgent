import React from 'react';
import {createRoot} from 'react-dom/client';
import PanelResize,{usePanelWidth} from '../src/PanelResize.js';
import {FileCards,FilePreviewContext} from '../src/FilePreview.js';
import '../src/style.css';
import '../src/group.css';
import '../src/codex.css';
function Fixture(){
 const [left,setLeft]=usePanelWidth('test:left',252),[right,setRight]=usePanelWidth('test:right',440);
 const message={id:'fixture',runId:'fixture',role:'codex' as const,kind:'tool' as const,status:'success',time:'',title:'files',text:'',source:'fixture',loop:1,details:{paths:['src/a.ts','src/b.ts']}};
 return <FilePreviewContext.Provider value={{messages:[],openFile:(_,path)=>{document.body.dataset.opened=path;}}}><div className="shell" style={{'--session-width':`${left}px`} as React.CSSProperties}><aside id="left" className="sidebar">会话</aside><PanelResize label="left" controls="left" width={left} onResize={setLeft} side="left" min={180} otherMin={560} fixed/><div className="workspace"><div className="conversation-row resizable-preview" style={{'--preview-width':`${right}px`} as React.CSSProperties}><section className="conversation-column"><FileCards message={message}/></section><PanelResize label="right" controls="right" width={right} onResize={setRight} side="right" min={240} otherMin={280}/><aside id="right" className="project-context preview-sidebar">文件</aside></div></div></div></FilePreviewContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
