import fs from 'node:fs';
import path from 'node:path';
import {homedir} from 'node:os';
import {codexPublicEvent,type PublicActivity} from './telemetry.js';

/** SDK 0.161 omits native ImageView items. Read only the bound Thread's public
 * completed-image events, incrementally; never publish messages or image bytes. */
export function observeCodexImages(workspace:string,thread:()=>string|null|undefined,emit:(event:PublicActivity,time:string)=>void,
  home=process.env.CODEX_HOME??path.join(homedir(),'.codex'),startedAt=Date.now()){
 const sessions=path.join(home,'sessions');let file:string|undefined,offset=0,partial='',skip=false,owned=false,closed=false;
 const chunk=Buffer.alloc(256*1024);
 const line=(text:string)=>{
  if(!text.includes('session_meta')&&!text.includes('ImageView'))return;
  try{
   const event=JSON.parse(text),data=event.payload;
   if(event.type==='session_meta'){owned=data?.id===thread()&&path.resolve(data.cwd)===path.resolve(workspace);return;}
   const time=Date.parse(event.timestamp);
   if(!owned||!Number.isFinite(time)||event.type!=='event_msg'||data?.type!=='item_completed'||data.thread_id!==thread()||time<startedAt||data.item?.type!=='ImageView'||typeof data.item.path!=='string'||typeof data.item.id!=='string')return;
   const activity=codexPublicEvent({type:'item.completed',item:{type:'image_view',id:data.item.id,path:data.item.path}});if(activity)emit(activity,event.timestamp);
  }catch{/* Incomplete/unknown native records never become receipts. */}
 };
 function poll(){
  if(closed)return;
  try{
   const id=thread();if(!id||!/^[a-f\d-]{36}$/i.test(id)||!fs.existsSync(sessions))return;
   if(!file){const relative=fs.readdirSync(sessions,{recursive:true}).find(name=>typeof name==='string'&&name.endsWith('-'+id+'.jsonl'));if(!relative)return;
    const resolved=fs.realpathSync(path.join(sessions,String(relative))),root=fs.realpathSync(sessions),rel=path.relative(root,resolved);if(rel.startsWith('..')||path.isAbsolute(rel))return;file=resolved;
   }
   const fd=fs.openSync(file,'r');try{
    if(fs.fstatSync(fd).size<offset){owned=false;return;}
    for(let count=0;count<16;count++){
     const read=fs.readSync(fd,chunk,0,chunk.length,offset);if(!read)break;offset+=read;
     // UTF-8 paths can cross read boundaries. A streaming decoder retains them.
     const text=decoder.decode(chunk.subarray(0,read),{stream:true});
     for(const segment of text.split(/(?<=\n)/)){
      const end=segment.endsWith('\n');if(!skip){partial+=segment;if(partial.length>65536){partial='';skip=true;}else if(end){line(partial);partial='';}}
      if(end)skip=false;
     }
    }
   }finally{fs.closeSync(fd);}
  }catch{/* Optional observability cannot change Controller outcomes. */}
 }
 const decoder=new TextDecoder(),timer=setInterval(poll,1500);timer.unref();
 return {poll,finish(){clearInterval(timer);try{poll();if(file)while(offset<fs.statSync(file).size){const before=offset;poll();if(before===offset)break;}}catch{/* Preserve the original model result. */}finally{closed=true;}}};
}
