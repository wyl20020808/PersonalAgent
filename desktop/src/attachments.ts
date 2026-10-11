import type {ChatAttachment} from './types.js';

export const MAX_ATTACHMENTS=8;
export const MAX_IMAGE_BYTES=2*1024*1024;
export const MAX_TEXT_BYTES=200000;
export const attachmentAccept='image/png,image/jpeg,image/gif,image/webp,.txt,.md,.json,.yaml,.yml,.ts,.tsx,.js,.jsx,.css,.cpp,.h,.hpp,.py,.log';
export const textAttachment=(name:string)=>/\.(txt|md|json|ya?ml|ts|tsx|js|jsx|css|cpp|h|hpp|py|log)$/i.test(name);
export async function readAttachment(file:File):Promise<ChatAttachment>{
 const image=/^image\/(png|jpeg|gif|webp)$/.test(file.type);
 if(!image&&!textAttachment(file.name))throw Error(`${file.name}：仅支持 PNG、JPEG、GIF、WebP 和文本源码文件`);
 if(file.size>(image?MAX_IMAGE_BYTES:MAX_TEXT_BYTES))throw Error(`${file.name}：${image?'图片上限 2 MiB':'文本上限 200 KB'}；未截断或上传`);
 const item:ChatAttachment={name:file.name,mimeType:image?file.type:'text/plain',size:file.size};
 if(image)item.dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error(`${file.name}：读取失败`));reader.readAsDataURL(file);});
 else {const bytes=await file.arrayBuffer();try{item.content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error(`${file.name}：请使用 UTF-8 文本`);}if(item.content.includes('\0'))throw Error(`${file.name}：不支持二进制内容`);}
 return item;
}
