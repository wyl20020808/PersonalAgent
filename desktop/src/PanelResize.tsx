import React,{useCallback,useRef,useState} from 'react';
import './panel-resize.css';

export function usePanelWidth(key:string,fallback:number){
 const [width,setWidth]=useState(()=>{try{const value=Number(localStorage.getItem(key));return Number.isFinite(value)&&value>=180?value:fallback;}catch{return fallback;}});
 const update=useCallback((value:number)=>{setWidth(value);try{localStorage.setItem(key,String(value));}catch{}},[key]);
 return [width,update] as const;
}

export default function PanelResize({label,controls,width,onResize,side,min,otherMin,fixed=false}:{label:string;controls:string;width:number;onResize:(width:number)=>void;side:'left'|'right';min:number;otherMin:number;fixed?:boolean}){
 const drag=useRef<{pointer:number;x:number;width:number}|null>(null);
 const direction=side==='left'?1:-1;
 const limits=(element:HTMLElement)=>Math.max(min,Math.min(fixed?window.innerWidth*.35:Infinity,(fixed?window.innerWidth-48:element.parentElement!.getBoundingClientRect().width)-otherMin-6));
 const actual=()=>document.getElementById(controls)?.getBoundingClientRect().width??width;
 const resize=(value:number,element:HTMLElement)=>onResize(Math.round(Math.max(min,Math.min(limits(element),value))));
 return <div className={`panel-resizer ${fixed?'sidebar-resizer':'preview-resizer'}`} role="separator" tabIndex={0} aria-label={label} aria-orientation="vertical" aria-controls={controls} aria-valuemin={min} aria-valuenow={Math.round(width)} title="拖动调整宽度；方向键微调" onPointerDown={event=>{
  if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={pointer:event.pointerId,x:event.clientX,width:actual()};
 }} onPointerMove={event=>{const start=drag.current;if(start?.pointer===event.pointerId)resize(start.width+direction*(event.clientX-start.x),event.currentTarget);}} onPointerUp={event=>{drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} onKeyDown={event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();resize(event.key==='Home'?min:event.key==='End'?limits(event.currentTarget):actual()+direction*(event.key==='ArrowRight'?10:-10),event.currentTarget);
 }}/>;
}
