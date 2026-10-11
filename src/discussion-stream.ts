export type DiscussionProgress={reply?:string;status?:string};

/** Decode only the reply string of a partially received root JSON object. */
export function partialDiscussionReply(source:string):string|undefined{
 let cursor=0;
 const whitespace=()=>{while(/\s/.test(source[cursor]??'')&&cursor<source.length)cursor++;};
 const string=():{value:string;complete:boolean}=>{
  cursor++;let value='';
  while(cursor<source.length){const character=source[cursor++];if(character==='"')return {value,complete:true};if(character!=='\\'){value+=character;continue;}
   if(cursor>=source.length)break;const escaped=source[cursor++]!;
   if(escaped==='u'){const hex=source.slice(cursor,cursor+4);if(!/^[0-9a-f]{4}$/i.test(hex))break;value+=String.fromCharCode(parseInt(hex,16));cursor+=4;}
   else{const escapes:Record<string,string>={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};if(!(escaped in escapes))break;value+=escapes[escaped];}
  }return {value,complete:false};
 };
 whitespace();if(source[cursor++]!=='{')return undefined;
 while(cursor<source.length){
  whitespace();if(source[cursor]!== '"')return undefined;const key=string();if(!key.complete)return undefined;
  whitespace();if(source[cursor++]!==':')return undefined;whitespace();
  if(key.value==='reply')return source[cursor]==='"'?string().value:undefined;
  let depth=0;
  while(cursor<source.length){const character=source[cursor];if(character==='"'){if(!string().complete)return undefined;continue;}if(!depth&&(character===','||character==='}'))break;if(character==='{'||character==='[')depth++;if(character==='}'||character===']')depth--;cursor++;}
  if(source[cursor++]!==',')return undefined;
 }return undefined;
}

/** Public answer/tool progress only. Thinking, raw tool arguments and plans never become drafts. */
export class DiscussionStream {
 private claudeBlocks=new Map<number,{kind:string;text:string}>();
 private messages=new Map<string,string>();
 private structured=false;
 private claudeMessage=0;
 constructor(private emit?: (progress:DiscussionProgress)=>void){}
 text(id:string,text:string){if(!this.emit||this.structured)return;this.messages.set(id,text);const publicParts=[...this.messages.values()].map(part=>partialDiscussionReply(part)??(part.trimStart().startsWith('{')?'':part));this.emit({reply:publicParts.filter(Boolean).join('\n\n').slice(0,20000),status:'正在生成回复…'});}
 json(text:string){const reply=partialDiscussionReply(text);if(reply!==undefined){this.structured=true;this.emit?.({reply:reply.slice(0,20000),status:'正在生成回复…'});}}
 claude(event:any){
  if(!this.emit)return;
  const native=event.event;
  if(event.type==='system'&&event.subtype==='init')this.emit({status:'决策者已连接，正在思考…'});
  if(event.type==='stream_event'&&native?.type==='content_block_start'){
   const block=native.content_block;this.claudeBlocks.set(native.index,{kind:block?.type==='tool_use'&&block.name==='StructuredOutput'?'json':block?.type??'',text:block?.text??''});
   if(block?.type==='tool_use'&&block.name!=='StructuredOutput')this.emit({status:'正在检索项目资料…'});
  }
  if(event.type==='stream_event'&&native?.type==='content_block_delta'){
   const block=this.claudeBlocks.get(native.index);if(!block)return;
   if(block.kind==='text'&&native.delta?.type==='text_delta'){block.text+=native.delta.text;this.text('claude:'+this.claudeMessage+':'+native.index,block.text);}
   if(block.kind==='json'&&native.delta?.type==='input_json_delta'){block.text+=native.delta.partial_json;this.json(block.text);}
  }
  if(event.type==='stream_event'&&native?.type==='message_start'){this.claudeMessage++;this.claudeBlocks.clear();}
  if(event.type==='assistant')for(const block of event.message?.content??[]){if(block.type==='tool_use'&&block.name==='StructuredOutput'&&typeof block.input?.reply==='string')this.json(JSON.stringify(block.input));}
 }
 codex(event:any){const item=event?.item;if(['item.updated','item.completed'].includes(event?.type)&&item?.type==='agent_message')this.text(item.id??'codex',item.text??'');if(item?.type==='command_execution'||item?.type==='file_change')this.emit?.({status:'正在检索项目资料…'});}
 opencode(part:any){if(part?.type==='text')this.text(part.id,part.text??'');if(part?.type==='tool')this.emit?.({status:'正在检索项目资料…'});}
}
