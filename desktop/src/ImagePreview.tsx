import React,{useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';

export default function ImagePreview({image,onClose}:{image:{name:string;dataUrl:string};onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [original,setOriginal]=useState(false),[dimensions,setDimensions]=useState('');
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 return <dialog ref={dialog} className="attachment-preview-dialog" aria-label="图片预览" onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
  <div className="attachment-preview-surface"><header><button type="button" className="preview-size-toggle" onClick={()=>setOriginal(value=>!value)}>{original?'适应窗口':'原始尺寸'}</button><button type="button" autoFocus aria-label="关闭图片预览" onClick={onClose}><X size={20}/></button></header><div className={`attachment-preview-canvas ${original?'original-size':''}`}><img src={image.dataUrl} alt={image.name} onLoad={event=>setDimensions(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`)}/></div><footer>{dimensions} · {original?'原始尺寸':'适应窗口'} · Esc 关闭</footer></div>
 </dialog>;
}
