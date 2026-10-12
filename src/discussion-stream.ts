export type DiscussionProgress={reply?:string;status?:string};

/** Decode only the reply string of a partially received root JSON object. */
export function partialDiscussionReply(source:string,field='reply'):string|undefined{
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
  if(key.value===field)return source[cursor]==='"'?string().value.replace(/[\uD800-\uDBFF]$/,''):undefined;
  let depth=0;
  while(cursor<source.length){const character=source[cursor];if(character==='"'){if(!string().complete)return undefined;continue;}if(!depth&&(character===','||character==='}'))break;if(character==='{'||character==='[')depth++;if(character==='}'||character===']')depth--;cursor++;}
  if(source[cursor++]!==',')return undefined;
 }return undefined;
}

/** Public prose and unvalidated task instructions only; no thinking or raw tool arguments. */
export class DiscussionStream {
 private claudeBlocks=new Map<number,{kind:string;text:string}>();
 private messages=new Map<string,string>();
 private structured=false;
 private claudeMessage=0;
 private lastRender=-Infinity;
 private jsonSource:string|undefined;
 private lastReply:string|undefined;
 constructor(private emit?: (progress:DiscussionProgress)=>void,private interval=0,private clock=Date.now){}
 private render(force=false){if(!this.emit||!force&&this.clock()-this.lastRender<this.interval)return;this.lastRender=this.clock();const reply=this.jsonSource!==undefined?partialPublicText(this.jsonSource):[...this.messages.values()].map(part=>partialPublicText(part)??(part.trimStart().startsWith('{')?'':part)).filter(Boolean).join('\n\n');if(reply!==undefined&&reply!==this.lastReply){this.lastReply=reply;this.emit({reply:reply.slice(0,20000),status:'正在生成回复…'});}}
 flush(){this.render(true);}
 text(id:string,text:string){if(!this.emit||this.structured)return;this.messages.set(id,text);this.render();}
 json(text:string){this.structured=true;this.jsonSource=text;this.render();}
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
  if(event.type==='assistant')for(const block of event.message?.content??[]){if(block.type==='tool_use'&&block.name==='StructuredOutput'&&block.input&&typeof block.input==='object')this.json(JSON.stringify(block.input));}
 }
 codex(event:any){const item=event?.item;if(['item.updated','item.completed'].includes(event?.type)&&item?.type==='agent_message')this.text(item.id??'codex',item.text??'');if(item?.type==='command_execution'||item?.type==='file_change')this.emit?.({status:'正在检索项目资料…'});}
 opencode(part:any){if(part?.type==='text')this.text(part.id,part.text??'');if(part?.type==='tool')this.emit?.({status:'正在检索项目资料…'});}
}

/** Public prose fields shared by discussion, review and execution schemas. */
export function partialPublicText(text:string):string|undefined{
 for(const field of ['reply','summary','reason','humanDecision']){const value=partialDiscussionReply(text,field);if(value!==undefined)return value;}
 return partialPlanText(text);
}

/** Only root tasks[].instruction is displayed; proposals remain unvalidated. */
function partialPlanText(text:string):string|undefined{
 let i=0;const ws=()=>{while(i<text.length&&/\s/.test(text[i]!))i++;};
 const skipString=()=>{i++;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i++]==='"')return true;}return false;};
 ws();if(text[i++]!=='{')return;
 while(i<text.length){ws();if(text[i]!=='"')return;const start=i;if(!skipString())return;let key:string;try{key=JSON.parse(text.slice(start,i));}catch{return;}ws();if(text[i++]!==':')return;ws();
  if(key==='tasks'&&text[i]==='['){i++;const parts:string[]=[];while(i<text.length){ws();if(text[i]===']')return parts.join('\n\n');if(text[i]!=='{')return parts.length?parts.join('\n\n'):undefined;const from=i;let depth=0;while(i<text.length){if(text[i]==='"'){if(!skipString())break;continue;}const c=text[i++];if(c==='{'||c==='[')depth++;if(c==='}'||c===']')depth--;if(!depth)break;}const instruction=partialDiscussionReply(text.slice(from,i),'instruction');if(instruction!==undefined)parts.push(`${parts.length+1}. ${instruction}`);ws();if(text[i]===','){i++;continue;}return parts.length?parts.join('\n\n'):undefined;}return parts.length?parts.join('\n\n'):undefined;}
  let depth=0;while(i<text.length){if(text[i]==='"'){if(!skipString())return;continue;}const c=text[i];if(!depth&&(c===','||c==='}'))break;if(c==='{'||c==='[')depth++;if(c==='}'||c===']')depth--;i++;}if(text[i++]!==',')return;
 }
}
