import React,{useEffect,useId,useRef,useState} from 'react';
import {CornerDownRight,FileText,LoaderCircle,Pencil,Trash2} from 'lucide-react';
import type {ChatAttachment,SessionMessage} from './types.js';

function Thumbnail({sessionId,messageId,item,onPreview}:{sessionId:string;messageId:string;item:ChatAttachment;onPreview:(image:{name:string;dataUrl:string})=>void}){
 const [image,setImage]=useState<{name:string;dataUrl:string}|null>(null);
 useEffect(()=>{let live=true;if(item.mimeType.startsWith('image/')&&item.sha256)void window.personalAgent.invoke<{name:string;dataUrl:string}>({operation:'sessionAttachment',sessionId,messageId,digest:item.sha256}).then(result=>{if(live)setImage(result);}).catch(()=>{});return ()=>{live=false;};},[sessionId,messageId,item.sha256,item.mimeType]);
 return image?<button type="button" className="queue-thumbnail" title={item.name} aria-label={'预览 '+item.name} onClick={()=>onPreview(image)}><img src={image.dataUrl} alt={item.name}/></button>:<span className="queue-file" title={item.name}><FileText size={15}/><span>{item.name}</span></span>;
}
function QueueMenu({text,busy,failed,onEdit,onRetry}:{text:string;busy:boolean;failed:boolean;onEdit:()=>void;onRetry:()=>void}){
 const id=useId(),menu=useRef<HTMLDivElement>(null);
 return <div className="queue-menu"><button type="button" className="queue-icon" disabled={busy} aria-label={'更多操作：'+text} popoverTarget={id} onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();if(menu.current){menu.current.style.right=Math.max(8,window.innerWidth-rect.right)+'px';menu.current.style.bottom=Math.max(8,window.innerHeight-rect.top+6)+'px';}}}>···</button><div id={id} ref={menu} popover="auto" className="queue-menu-popup"><button type="button" disabled={busy} onClick={()=>{menu.current?.hidePopover();onEdit();}}><Pencil size={13}/>编辑</button>{failed&&<button type="button" disabled={busy} onClick={()=>{menu.current?.hidePopover();onRetry();}}>重试处理</button>}</div></div>;
}
export default function QueuedMessages({sessionId,messages,busy,onSteer,onDelete,onEdit,onRetry,onPreview}:{sessionId:string;messages:SessionMessage[];busy:boolean;onSteer:(id:string)=>void;onDelete:(id:string)=>void;onEdit:(id:string,text:string)=>Promise<void>;onRetry:(id:string)=>void;onPreview:(image:{name:string;dataUrl:string})=>void}){
 const [editing,setEditing]=useState<string|null>(null),[text,setText]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setEditing(null);setError('');},[sessionId]);
 useEffect(()=>{if(editing&&!messages.some(message=>message.id===editing&&['pending','failed','steering'].includes(message.status))){setEditing(null);setError('');}},[messages,editing]);
 const save=async()=>{if(!editing||busy||saving||!text.trim())return;setSaving(true);setError('');try{await onEdit(editing,text.trim());setEditing(null);}catch(error){setError((error as Error).message);}finally{setSaving(false);}};
 if(!messages.length)return null;
 return <section className="queued-messages" aria-label="消息队列" aria-live="polite">{messages.map(message=>{
  const waiting=message.status==='steering',adjusting=message.status==='adjusting';
  return <div className={'queued-message '+(waiting?'is-steering':adjusting?'is-adjusting':'')} key={message.id} data-queued-id={message.id}>
   <CornerDownRight className="queue-mark" size={16}/>
   {Boolean(message.attachments?.length)&&<div className="queue-attachments">{message.attachments!.map((item,index)=><Thumbnail key={item.sha256??index} sessionId={sessionId} messageId={message.id} item={item} onPreview={onPreview}/>)}</div>}
   <div className="queue-content">{editing===message.id?<div className="queue-editor"><textarea autoFocus aria-label="编辑排队消息" value={text} maxLength={5000} disabled={busy||saving} onChange={event=>setText(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'&&!busy&&!saving){event.preventDefault();setEditing(null);}else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.nativeEvent.isComposing){event.preventDefault();void save();}}}/>{error&&<small role="alert">{error}</small>}<div className="queue-edit-actions"><button type="button" disabled={busy||saving} onClick={()=>setEditing(null)}>取消</button><button type="button" disabled={busy||saving||!text.trim()} onClick={()=>void save()}>{saving?'保存中…':'保存'}</button></div></div>:<><span className="queue-text" title={message.text}>{message.text}</span>{(waiting||adjusting||message.status==='failed')&&<small>{message.error??(adjusting?'正在处理引导':waiting?'正在发送引导':'发送失败，请重试')}</small>}</>}</div>
   {editing!==message.id&&
   <div className="queue-actions">{adjusting?<span className="queue-adjusting" title={message.error}><LoaderCircle size={14} className="spin"/>处理中</span>:<>
    <button type="button" className="queue-steer" disabled={busy||waiting} title={waiting?'引导已提交，等待决策者接收':'及时交给决策者，调整后再派发执行者'} aria-label={'引导：'+message.text} onClick={()=>onSteer(message.id)}><CornerDownRight size={15}/>{waiting?'发送中':'引导'}</button>
    <button type="button" className="queue-icon" disabled={busy} title="删除排队消息" aria-label={'删除：'+message.text} onClick={()=>onDelete(message.id)}><Trash2 size={15}/></button>
    <QueueMenu text={message.text} busy={busy||saving} failed={message.status==='failed'} onEdit={()=>{setEditing(message.id);setText(message.text);setError('');}} onRetry={()=>onRetry(message.id)}/>
   </>}</div>}
  </div>;
 })}</section>;
}
