import React,{useEffect,useRef,useState} from 'react';
import {Check,ChevronDown,Code2,GitBranch,MessageSquare} from 'lucide-react';

export type WorkMode='direct'|'isolated'|'discuss';
const modes=[
 {value:'direct' as const,label:'直接开发',description:'在当前项目中开始执行',icon:Code2},
 {value:'isolated' as const,label:'隔离开发',description:'在独立工作区中开发',icon:GitBranch},
 {value:'discuss' as const,label:'先聊天 · Discuss',description:'先讨论方案，由你决定何时执行',icon:MessageSquare}
];
export default function WorkModeMenu({value,disabled,onChange}:{value:WorkMode;disabled:boolean;onChange:(value:WorkMode)=>void}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const selected=modes.find(mode=>mode.value===value)??modes[0],Icon=selected.icon;
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[open]);
 const choose=(mode:WorkMode)=>{onChange(mode);setOpen(false);trigger.current?.focus();};
 return <div className="work-mode-picker" ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}} onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();setOpen(false);trigger.current?.focus();}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!open){setOpen(true);requestAnimationFrame(()=>root.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')?.focus());return;}const buttons=[...root.current!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
 }}>
  <button ref={trigger} type="button" className={`work-mode-trigger ${value==='discuss'?'is-discuss':''}`} aria-label="新会话工作方式" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(!open)}><Icon size={15}/><span>{selected.label}</span><ChevronDown size={13} className={open?'is-open':''}/></button>
  {open&&<div className="work-mode-menu" role="menu" aria-label="选择工作方式"><span className="work-mode-caption">工作方式</span>{modes.map(mode=>{const ModeIcon=mode.icon;return <button key={mode.value} type="button" role="menuitemradio" aria-checked={mode.value===value} data-mode={mode.value} onClick={()=>choose(mode.value)}><span className="work-mode-icon"><ModeIcon size={18}/></span><span className="work-mode-copy"><strong>{mode.label}</strong><small>{mode.description}</small></span>{mode.value===value&&<Check size={16} className="work-mode-check"/>}</button>;})}</div>}
 </div>;
}
