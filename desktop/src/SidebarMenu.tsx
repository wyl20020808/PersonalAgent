import React,{useEffect,useRef,useState} from 'react';

export type SidebarTarget={kind:'project'|'session';name:string;path:string;id?:string;running?:boolean};
type Action='open'|'new'|'parallel'|'rename'|'delete'|'folder'|'copy';
export default function SidebarMenu({target,position,onClose,onAction}:{target:SidebarTarget;position:{x:number;y:number};onClose:()=>void;onAction:(action:Action,value?:string)=>Promise<boolean>}){
 const menu=useRef<HTMLDivElement>(null),[mode,setMode]=useState<'menu'|'rename'|'delete'>('menu'),[name,setName]=useState(target.name),[busy,setBusy]=useState(false);
 const perform=async(action:Action,value?:string)=>{setBusy(true);try{if(await onAction(action,value))onClose();}finally{setBusy(false);}};
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  menu.current?.querySelector<HTMLElement>('input,button:not(:disabled)')?.focus();
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!busy){event.preventDefault();onClose();return;}
   const controls=Array.from(menu.current?.querySelectorAll<HTMLElement>('input,button:not(:disabled)')??[]),index=controls.indexOf(document.activeElement as HTMLElement);
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&mode==='menu'){event.preventDefault();controls[event.key==='Home'?0:event.key==='End'?controls.length-1:(index+(event.key==='ArrowDown'?1:-1)+controls.length)%controls.length]?.focus();}
   if(event.key==='Tab'){event.preventDefault();controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length]?.focus();}
  };
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};
 },[mode,busy,onClose]);
 const button=(action:Action,label:string,disabled=false)=><button role="menuitem" type="button" disabled={busy||disabled} onClick={()=>action==='rename'?setMode('rename'):action==='delete'?setMode('delete'):void perform(action)}>{label}</button>;
 return <div className="sidebar-menu-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}} onContextMenu={event=>{event.preventDefault();if(!busy)onClose();}}>
  <div ref={menu} className={'sidebar-context-menu '+(mode==='menu'?'':'sidebar-menu-dialog')} role={mode==='menu'?'menu':'dialog'} aria-modal={mode==='menu'?undefined:true} aria-label={mode==='rename'?'重命名':mode==='delete'?'确认删除':target.name+' 操作'} style={mode==='menu'?{left:Math.max(8,Math.min(position.x,window.innerWidth-238)),top:Math.max(8,Math.min(position.y,window.innerHeight-300))}:undefined}>
   {mode==='menu'?<>{target.kind==='session'?button('open','打开会话'):<>{button('new','新建会话')}{button('parallel','新建并行会话')}</>}{button('rename','重命名')}<div className="sidebar-menu-divider"/>{button('folder','打开项目文件夹',!target.path)}{button('copy','复制项目路径',!target.path)}<div className="sidebar-menu-divider"/>{button('delete',target.running?'运行中，无法删除':target.kind==='project'?'删除项目':'删除会话',target.running)}</>:mode==='rename'?<form onSubmit={event=>{event.preventDefault();if(name.trim())void perform('rename',name.trim());}}><strong>重命名{target.kind==='project'?'项目':'会话'}</strong><input aria-label="新名称" maxLength={80} value={name} disabled={busy} onFocus={event=>event.currentTarget.select()} onChange={event=>setName(event.target.value)}/>{target.kind==='project'&&<p>只修改显示名称，磁盘文件夹名称保持不变。</p>}<div className="sidebar-menu-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="submit" disabled={busy||!name.trim()}>保存</button></div></form>:<><strong>删除“{target.name}”？</strong><p>{target.kind==='project'?'从侧栏移除此项目及所属会话。':'从侧栏移除此会话。'}项目文件、会话数据和历史 Run 保留。</p><div className="sidebar-menu-actions"><button disabled={busy} onClick={onClose}>取消</button><button className="danger" disabled={busy} onClick={()=>void perform('delete')}>删除</button></div></>}
  </div>
 </div>;
}
