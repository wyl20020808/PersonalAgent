import type {ChatMessage} from './types.js';
import {toolPresentation} from './chatPresentation.js';

export type DiffLine={kind:'context'|'add'|'remove'|'header';text:string;oldLine?:number;newLine?:number};
export type FileChange={path:string;oldPath?:string;diff:string;lines:DiffLine[];added:number;removed:number;notice?:string};
const normalized=(name:string)=>name.replaceAll('\\','/');
export function findFileChange(files:FileChange[],name:string,roots:string[]=[]){
 let relative=normalized(name);
 if(/^(?:[a-z]:\/|\/)/i.test(relative)){
  const root=roots.map(normalized).map(value=>value.replace(/\/$/,'')).filter(value=>relative.toLowerCase().startsWith(value.toLowerCase()+'/')).sort((a,b)=>b.length-a.length)[0];
  if(!root)return;relative=relative.slice(root.length+1);
 }
 return files.find(file=>normalized(file.path).toLowerCase()===relative.toLowerCase());
}
function gitPath(value:string){
 value=value.replace(/\t.*$/,'');
 if(value.startsWith('"')){
  // Git quotes non-ASCII UTF-8 bytes as octal escapes.
  value=value.slice(1,-1).replace(/(?:\\[0-7]{3})+/g,part=>new TextDecoder().decode(Uint8Array.from(part.match(/[0-7]{3}/g)!,n=>parseInt(n,8)))).replace(/\\([\\"tnr])/g,(_,c)=>({t:'\t',n:'\n',r:'\r'} as Record<string,string>)[c]??c);
 }
 return value.replace(/^[ab]\//,'');
}
/** Parse only recorded unified diffs; never infer missing file contents. */
const diffCache=new Map<string,FileChange[]>();
export function parseFileChanges(diff:string):FileChange[]{
 const cached=diffCache.get(diff);if(cached)return cached;
 const files:FileChange[]=[];let file:FileChange|undefined,oldLine=0,newLine=0,inHunk=false,newFile=false;
 const finishNewFile=()=>{
  if(!file||!newFile)return;
  let body=file.diff.includes('\n')?file.diff.slice(file.diff.indexOf('\n')+1):'';
  // The split consumes the separator before the next header; remove only the producer's appended newline.
  if(body.endsWith('\n'))body=body.slice(0,-1);
  const content=body?body.split('\n'):[];if(content.at(-1)==='')content.pop();
  file.lines=[file.lines[0],...content.map((text,index):DiffLine=>({kind:'add',text:'+'+text,newLine:index+1}))];file.added=content.length;
 };
 const rows=diff.replaceAll('\r\n','\n').split('\n');
 for(let i=0;i<rows.length;i++){
  const text=rows[i];
  if(text.startsWith('FILE ')){finishNewFile();file={path:text.slice(5).replace(/ \((?:added|deleted)\)$/,''),diff:text,lines:[{kind:'header',text}],added:0,removed:0};files.push(file);inHunk=false;newFile=false;continue;}
  if(text.startsWith('diff --git ')||text.startsWith('NEW FILE ')){
   finishNewFile();
   const match=/^diff --git (.+?) ("?b\/.*)$/.exec(text);
   const next={path:text.startsWith('NEW FILE ')?text.slice(9):match?gitPath(match[2]):text.slice(11),diff:text,lines:[{kind:'header' as const,text}],added:0,removed:0};
   if(file?.diff.startsWith('FILE ')&&file.path===next.path){Object.assign(file,next);}else{file=next;files.push(file);}inHunk=false;newFile=text.startsWith('NEW FILE ');oldLine=0;newLine=1;continue;
  }
  if(!file)continue;
  file.diff+='\n'+text;
  if(newFile)continue;
  const hunk=/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
  if(hunk){oldLine=Number(hunk[1]);newLine=Number(hunk[2]);inHunk=true;file.lines.push({kind:'header',text});continue;}
  if(!inHunk){if(text.startsWith('--- '))file.oldPath=gitPath(text.slice(4));if(text.startsWith('+++ ')&&text.slice(4)!=='/dev/null')file.path=gitPath(text.slice(4));file.lines.push({kind:'header',text});continue;}
  if(text.startsWith('+')){file.added++;file.lines.push({kind:'add',text,newLine:newLine++});}
  else if(text.startsWith('-')){file.removed++;file.lines.push({kind:'remove',text,oldLine:oldLine++});}
  else if(text.startsWith(' '))file.lines.push({kind:'context',text,oldLine:oldLine++,newLine:newLine++});
  else file.lines.push({kind:'header',text});
 }
 finishNewFile();
 for(const item of files)if(!item.lines.some(line=>line.kind!=='header'))item.notice='该记录只有文件级变更，没有可展示的文本 diff（可能为空文件、二进制、大文件或属性变化）。';
 if(diff.length<=8*1024*1024){while(diffCache.size>=4||[...diffCache.keys()].reduce((n,key)=>n+key.length,0)+diff.length>12*1024*1024)diffCache.delete(diffCache.keys().next().value!);diffCache.set(diff,files);}
 return files;
}
export function messageFiles(message:ChatMessage){
 const paths=toolPresentation({kind:message.kind,text:message.text,title:message.title,source:message.details?.protocol})?.paths??message.details?.paths??[];
 return [...new Set([...paths,...parseFileChanges(message.details?.diff??'').map(file=>file.path)])];
}
export function recordedDiff(messages:ChatMessage[],message:ChatMessage):{message:ChatMessage;scope:string}|undefined{
 if(message.details?.diff)return {message,scope:message.kind==='changes'?(message.details.protocol==='Controller limited Git observation'?'该轮结束时的 Git 观测（可能含此前修改）':'该次 Agent 调用的修改'):'该条事件的变更证据'};
 if(message.kind!=='tool')return;
 const index=messages.findIndex(item=>item.id===message.id);
 if(index<0)return;
 for(const candidate of messages.slice(index+1)){
  if(candidate.runId!==message.runId||candidate.role!==message.role)continue;
  if(candidate.kind==='dispatch'||candidate.taskId!==message.taskId||candidate.loop!==message.loop)break;
  if(candidate.kind==='changes')return candidate.details?.diff?{message:candidate,scope:candidate.details.protocol==='Controller limited Git observation'?'该轮结束时的 Git 观测（可能含此前修改）':'该次 Agent 调用的修改'}:undefined;
 }
}
