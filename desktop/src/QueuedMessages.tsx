import React,{useEffect,useState} from 'react';
import {CornerDownRight,FileText,LoaderCircle,Pencil,Trash2} from 'lucide-react';
import type {ChatAttachment,SessionMessage} from './types.js';

function Thumbnail({sessionId,messageId,item,onPreview}:{sessionId:string;messageId:string;item:ChatAttachment;onPreview:(image:{name:string;dataUrl:string})=>void}){
 const [image,setImage]=useState<{name:string;dataUrl:string}|null>(null);
 useEffect(()=>{let live=true;if(item.mimeType.startsWith('image/')&&item.sha256)void window.personalAgent.invoke<{name:string;dataUrl:string}>({operation:'sessionAttachment',sessionId,messageId,digest:item.sha256}).then(result=>{if(live)setImage(result);}).catch(()=>{});return ()=>{live=false;};},[sessionId,messageId,item.sha256,item.mimeType]);
 return image?<button type="button" className="queue-thumbnail" title={item.name} aria-label={'预览 '+item.name} onClick={()=>onPreview(image)}><img src={image.dataUrl} alt={item.name}/></button>:<span className="queue-file" title={item.name}><FileText size={15}/><span>{item.name}</span></span>;
}
export default function QueuedMessages({sessionId,messages,busy,onSteer,onDelete,onEdit,onRetry,onPreview}:{sessionId:string;messages:SessionMessage[];busy:boolean;onSteer:(id:string)=>void;onDelete:(id:string)=>void;onEdit:(message:SessionMessage)=>void;onRetry:(id:string)=>void;onPreview:(image:{name:string;dataUrl:string})=>void}){
 if(!messages.length)return null;
 return <section className="queued-messages" aria-label="消息队列" aria-live="polite">{messages.map(message=>{
  const waiting=message.status==='steering',adjusting=message.status==='adjusting';
  return <div className={'queued-message '+(waiting?'is-steering':adjusting?'is-adjusting':'')} key={message.id} data-queued-id={message.id}>
   <CornerDownRight className="queue-mark" size={16}/>
   {Boolean(message.attachments?.length)&&<div className="queue-attachments">{message.attachments!.map((item,index)=><Thumbnail key={item.sha256??index} sessionId={sessionId} messageId={message.id} item={item} onPreview={onPreview}/>)}</div>}
   <div className="queue-content"><span className="queue-text" title={message.text}>{message.text}</span>{(waiting||adjusting||message.status==='failed')&&<small>{adjusting?'决策者调整中':waiting?'等待任务边界':message.error??'发送失败，请重试'}</small>}</div>
   <div className="queue-actions">{adjusting?<span className="queue-adjusting" title={message.error}><LoaderCircle size={14} className="spin"/>调整中</span>:<>
    <button type="button" className="queue-steer" disabled={busy||waiting} title={waiting?'已送达 Controller，当前调用继续执行':'在当前小任务验收后交给决策者，不停止执行'} aria-label={'引导：'+message.text} onClick={()=>onSteer(message.id)}><CornerDownRight size={15}/>{waiting?'已引导':'引导'}</button>
    <button type="button" className="queue-icon" disabled={busy} title="删除排队消息" aria-label={'删除：'+message.text} onClick={()=>onDelete(message.id)}><Trash2 size={15}/></button>
    <details className="queue-menu"><summary aria-label={'更多操作：'+message.text}>···</summary><div><button type="button" disabled={busy} onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');onEdit(message);}}><Pencil size={13}/>修改消息</button>{message.status==='failed'&&<button type="button" disabled={busy} onClick={()=>onRetry(message.id)}>重试处理</button>}</div></details>
   </>}</div>
  </div>;
 })}</section>;
}
