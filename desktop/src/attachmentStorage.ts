import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import type {ChatAttachment} from './types.js';
import {MAX_ATTACHMENTS,MAX_IMAGE_BYTES,MAX_TEXT_BYTES,textAttachment} from './attachments.js';
export function decodeAttachment(item:ChatAttachment):Buffer {
 if(!Number.isSafeInteger(item.size)||item.size<0||item.size>MAX_IMAGE_BYTES)throw Error('单个文件上限 100 MB（100 MiB）');
 if(!item.name||item.name.length>240||/[\r\n\0]/.test(item.name))throw Error('附件名称无效');
 if((item.dataUrl!==undefined)===(item.content!==undefined))throw Error('附件必须包含且只能包含一种完整内容');
 if(item.dataUrl!==undefined){
  if(item.dataUrl.length>Math.ceil(MAX_IMAGE_BYTES/3)*4+64)throw Error('单个文件上限 100 MB（100 MiB）');
  const match=/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(item.dataUrl);
  if(!match||item.mimeType!==match[1])throw Error('图片附件格式无效');
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.toString('base64')!==match[2]||bytes.length>MAX_IMAGE_BYTES||bytes.length!==item.size)throw Error('图片附件大小或编码不匹配');
  const valid=match[1]==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:match[1]==='image/gif'?/^GIF8[79]a$/.test(bytes.subarray(0,6).toString()):bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!valid)throw Error('图片内容与格式不匹配');return bytes;
 }
 if(item.content!.length>MAX_TEXT_BYTES)throw Error('单个文件上限 100 MB（100 MiB）');
 if(!textAttachment(item.name)||item.content!.includes('\0'))throw Error('不支持的文本附件');
 const bytes=Buffer.from(item.content!,'utf8');
 if(bytes.length>MAX_TEXT_BYTES||![bytes.length,bytes.length+3].includes(item.size))throw Error('文本附件大小不匹配或超过单个文件上限 100 MB（100 MiB）');
 return bytes;
}
export function attachmentDigest(items:ChatAttachment[]=[]):string {
 if(items.length>MAX_ATTACHMENTS)throw Error('每条消息最多 8 个附件');
 return createHash('sha256').update(JSON.stringify(items.map(item=>({name:item.name,mimeType:item.mimeType,hash:createHash('sha256').update(decodeAttachment(item)).digest('hex')})))).digest('hex');
}
export function saveAttachments(data:string,sessionId:string,messageId:string,items:ChatAttachment[]):ChatAttachment[]{
 if(![sessionId,messageId].every(id=>/^[a-f0-9-]{36}$/.test(id)))throw Error('附件归属无效');
 attachmentDigest(items);
 const decoded=items.map(decodeAttachment),folder=path.join(data,'session-attachments',sessionId,messageId);
 fs.mkdirSync(folder,{recursive:true});const written:string[]=[];
 try{return items.map((item,index)=>{const ext=item.dataUrl?({'image/png':'.png','image/jpeg':'.jpg','image/gif':'.gif','image/webp':'.webp'}[item.mimeType]??'.bin'):'.txt';const file=path.join(folder,randomUUID()+ext);fs.writeFileSync(file,decoded[index],{flag:'wx'});written.push(file);return {name:item.name,mimeType:item.mimeType,size:decoded[index].length,path:file,sha256:createHash('sha256').update(decoded[index]).digest('hex')};});}
 catch(error){for(const file of written)fs.unlinkSync(file);throw error;}
}
