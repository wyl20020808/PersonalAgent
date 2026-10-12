import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {decodeAttachment,attachmentDigest,saveAttachments} from './attachmentStorage.js';
import {readAttachment} from './attachments.js';
import {refreshLoop} from './refreshLoop.js';
import {DesktopService,validateRequest} from './service.js';
import {MAX_ATTACHMENT_BYTES} from '../../dist/src/attachment-types.js';
import {runAttachments} from '../../dist/src/multimodal.js';
import {chatRoute} from './chatRouting.js';
import {sessionDiscussionReply,messageLane} from './chatPresentation.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const data=path.join(root,'.v3c3','workbench-'+randomUUID());
const text={name:'a.txt',mimeType:'text/plain',size:3,content:'abc'};
test('Discuss replies from every decision backend render on the decision side; mode notices stay system messages',()=>{
 const message={id:randomUUID(),time:new Date().toISOString(),text:'/discuss question',status:'recorded' as const,discussionReply:'Reply'};
 for(const backend of ['claude-code','codex','opencode'] as const){const choice=backend==='opencode'?{backend,opencode:{providerID:'fixture',modelID:'fixture'}}:{backend};assert.equal(messageLane(sessionDiscussionReply(message,'session',choice)!),'decision');}
 assert.equal(messageLane(sessionDiscussionReply({...message,discussionNotice:true},'session')!),'system');assert.equal(sessionDiscussionReply({...message,status:'cancelled'},'session'),undefined);
});
test('attachment limits allow larger images and text and reject above 100 MiB before reading',async()=>{
 const content='x'.repeat(3*1024*1024),item={...text,size:content.length,content};
 assert.equal(decodeAttachment(item).length,content.length);
 const bytes=Buffer.alloc(3*1024*1024);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
 const image={name:'large.png',mimeType:'image/png',size:bytes.length,dataUrl:'data:image/png;base64,'+bytes.toString('base64')};
 assert.equal(decodeAttachment(image).length,bytes.length);
 const request={operation:'sendSession',sessionId:randomUUID(),messageId:randomUUID(),text:'附件',attachments:[image,item]};
 assert.doesNotThrow(()=>validateRequest(request));
 // Schema and File metadata boundaries avoid allocating a 100 MiB fixture.
 assert.doesNotThrow(()=>validateRequest({...request,attachments:[{...text,size:MAX_ATTACHMENT_BYTES}]}));
 assert.throws(()=>validateRequest({...request,attachments:[{...text,size:MAX_ATTACHMENT_BYTES+1}]}));
 let read=false;const file={name:'large.txt',type:'text/plain',size:MAX_ATTACHMENT_BYTES,arrayBuffer:async()=>{read=true;return new ArrayBuffer(0);}} as File;
 await readAttachment(file);assert.equal(read,true);read=false;
 await assert.rejects(readAttachment({...file,size:MAX_ATTACHMENT_BYTES+1} as File),/100 MB/);assert.equal(read,false);
 assert.throws(()=>decodeAttachment({...text,size:MAX_ATTACHMENT_BYTES+1}),/100 MB/);
});
test('chat routes from runtime state without treating quoted commands as controls',()=>{
 assert.equal(chatRoute('做一个功能'),'start');
 assert.equal(chatRoute('修改停止按钮',{phase:'executing'}),'queue');
 assert.equal(chatRoute('停止',{phase:'executing'}),'stop');
 assert.equal(chatRoute('保持暂停',{phase:'paused'}),'hold');
 assert.equal(chatRoute('继续',{phase:'paused',nextPhase:'verify'}),'resume');
 assert.equal(chatRoute('把按钮改小',{phase:'paused',nextPhase:'verify'}),'rework');
 assert.equal(chatRoute('继续',{phase:'paused',nextPhase:'verify'},true),'rework');
 assert.equal(chatRoute('不需要改代码，只解释一下',{phase:'completed'}),'start');
});
test('chat resume is idempotent, preserves Run and attaches new verified input; failures remain visible',async()=>{
 const service=new DesktopService(root,path.join(data,'chat-resume'),process.execPath),project=path.join(data,'chat-resume-project');fs.mkdirSync(project,{recursive:true});
 const calls:{decision?:string;intent?:string}[]=[];service.launch=(_store,_file,decision,_limit,intent)=>{calls.push({decision,intent});};
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 const initial=await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'初始需求',directAcknowledged:true});
 const ref=initial.runs[0],store=service.store(ref.profileId,ref.id),state=store.load();state.phase='paused';state.nextPhase='planning';store.save(state);
 const request={operation:'sendSession' as const,sessionId:session.id,messageId:randomUUID(),text:'按附件修改计划',attachments:[text]};
 const resumed=await service.sessions.send(request);await service.sessions.send(request);
 assert.equal(resumed.runs.length,1);assert.equal(resumed.messages.at(-1)?.status,'executed');assert.equal(calls.length,2);assert.equal(calls[1].intent,'resume');assert.equal(calls[1].decision,request.text);assert.equal(runAttachments(store.load(),store).length,1);
 // Validate the failure using the public routing boundary without changing schema-owned failure data.
 const original=service.validateResume.bind(service);service.validateResume=()=>{throw Error('该失败不可自动恢复');};
 const failed=await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'继续'});
 assert.equal(failed.messages.at(-1)?.status,'failed');assert.match(failed.messages.at(-1)?.error??'',/不可自动恢复/);assert.equal(calls.length,2);service.validateResume=original;
});
test('queued chat drains after completion, pauses do not replay, and stop holds queued work',async()=>{
 const service=new DesktopService(root,path.join(data,'chat-queue'),process.execPath),project=path.join(data,'chat-queue-project');fs.mkdirSync(project,{recursive:true});service.launch=()=>{};
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',projectMode:'direct'});
 const send=(value:string)=>service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:value,directAcknowledged:true});
 const initial=await send('初始需求'),ref=initial.runs[0],store=service.store(ref.profileId,ref.id);
 await send('谢谢');await send('第二个需求');
 const paused=store.load();paused.phase='paused';store.save(paused);await service.sessions.drainCompleted(ref.id);assert.equal(service.sessions.get(session.id).runs.length,1);
 const complete=store.load();complete.phase='completed';store.save(complete);await service.sessions.drainCompleted(ref.id);
 const fresh=service.sessions.get(session.id);assert.equal(fresh.runs.length,2);assert.equal(fresh.messages[1].status,'recorded');assert.equal(fresh.messages[2].status,'executed');
 await send('第三个需求');const stopped=await send('停止');assert.equal(stopped.messages.at(-2)?.autoQueued,false);assert.equal(stopped.messages.at(-1)?.action,'stop');
 const last=fresh.runs.at(-1)!;assert.ok(fs.existsSync(service.store(last.profileId,last.id).file('stop.request')));
});
test('attachment batches reject metadata-only, truncated, binary and forged images',()=>{
 assert.throws(()=>decodeAttachment({...text,content:undefined}),/完整内容/);
 assert.throws(()=>decodeAttachment({...text,size:100}),/大小/);
 assert.throws(()=>decodeAttachment({...text,content:'a\0c'}),/文本/);
 assert.throws(()=>decodeAttachment({name:'fake.png',mimeType:'image/png',size:3,dataUrl:'data:image/png;base64,YWJj'}),/格式不匹配/);
 assert.throws(()=>decodeAttachment({...text,dataUrl:'data:image/png;base64,YWJj'}),/一种/);
 assert.notEqual(attachmentDigest([text]),attachmentDigest([{...text,content:'def'}]));
 const session=randomUUID(),message=randomUUID();assert.throws(()=>saveAttachments(data,session,message,[text,{...text,size:9}]));assert.equal(fs.existsSync(path.join(data,'session-attachments',session,message)),false);
 const saved=saveAttachments(data,session,message,[text]);assert.equal(fs.readFileSync(saved[0].path!,'utf8'),'abc');assert.equal(saved[0].content,undefined);
});
test('client reads full UTF-8 content and rejects unsupported or oversized files',async()=>{
 assert.equal((await readAttachment(new File(['hello'],'test.txt'))).content,'hello');
 await assert.rejects(readAttachment(new File(['pdf'],'test.pdf')),/仅支持/);
 assert.equal((await readAttachment(new File(['a'.repeat(200001)],'large.txt'))).content?.length,200001);
 await assert.rejects(readAttachment(new File([new Uint8Array([255])],'bad.txt')),/UTF-8/);
});
test('refresh notifications coalesce, never overlap, and stop prevents further reads',async()=>{
 let calls=0,active=0,maximum=0,release!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve);
 const loop=refreshLoop(async()=>{calls++;maximum=Math.max(maximum,++active);try{if(calls===1)await gate;}finally{active--;}} ,10000);
 for(let i=0;i<100;i++)loop.refresh();assert.equal(calls,1);release();await sleep(150);
 assert.equal(calls,2);assert.equal(maximum,1);loop.stop();loop.refresh();await sleep(10);assert.equal(calls,2);
});
test('continuous notifications keep IPC reads bounded to ten per second',async()=>{
 let calls=0;const loop=refreshLoop(async()=>{calls++;},10000),burst=setInterval(()=>{for(let i=0;i<100;i++)loop.refresh();},5);
 try{await sleep(260);assert.ok(calls>=2&&calls<=4);}finally{clearInterval(burst);loop.stop();}
 const stopped=calls;await sleep(120);assert.equal(calls,stopped);
});
test('failed refresh retries; stopping during an in-flight read cancels follow-up',async()=>{
 let calls=0;const loop=refreshLoop(async()=>{calls++;throw Error('offline');},10000,5);await sleep(150);loop.stop();assert.ok(calls>=2);const stopped=calls;await sleep(20);assert.equal(calls,stopped);
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let count=0;const pending=refreshLoop(async()=>{count++;await gate;},1);pending.refresh();pending.stop();release();await sleep(10);assert.equal(count,1);
});
test('file browser handles directories, rejects escapes, unknown roots and binary previews; SVG stays text',()=>{
 const service=new DesktopService(root,path.join(data,'service'),process.execPath),project=path.join(data,'project');
 fs.mkdirSync(path.join(project,'src'),{recursive:true});fs.writeFileSync(path.join(project,'src','code.ts'),'export const ok=true;');fs.writeFileSync(path.join(project,'image.svg'),'<svg/>');fs.writeFileSync(path.join(project,'binary.bin'),Buffer.from([0,255]));
 assert.throws(()=>service.readProjectFile(project,'image.svg'),/已选择/);service.inspectProject(project);
 assert.ok(service.listProjectFiles(project,'').entries.find(e=>e.name==='src'&&e.directory));assert.equal(service.readProjectFile(project,'src/code.ts').text,'export const ok=true;');assert.equal(service.readProjectFile(project,'image.svg').dataUrl,undefined);
 assert.throws(()=>service.readProjectFile(project,'../escape.txt'));assert.throws(()=>service.readProjectFile(project,'binary.bin'),/不支持/);
 const outside=path.join(data,'outside');fs.mkdirSync(outside,{recursive:true});fs.symlinkSync(outside,path.join(project,'alias'),'junction');assert.throws(()=>service.listProjectFiles(project,'alias'));assert.ok(!service.listProjectFiles(project,'').entries.some(e=>e.name==='alias'));
});
test('idempotent session sends bind both text and attachment bytes',async()=>{
 const service=new DesktopService(root,path.join(data,'sessions'),process.execPath),project=path.join(data,'project');
 fs.mkdirSync(project,{recursive:true});const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock'});
 // Existing paused run keeps the message queued without any Agent invocation.
 service.overview=()=>({runs:[{source:project,active:true}],profiles:[],warnings:[],recentProjects:[]}) as any;
 const request={operation:'sendSession' as const,sessionId:session.id,messageId:randomUUID(),text:'hello',attachments:[text]};
 await service.sessions.send(request);await service.sessions.send(request);
 assert.equal(service.sessions.get(session.id).messages.length,1);
 await assert.rejects(service.sessions.send({...request,attachments:[{...text,content:'def'}]}),/different content/);
});
test('Session binds verified attachment bytes into its Run before launch; restart preserves manifest',async()=>{
 const service=new DesktopService(root,path.join(data,'native-session'),process.execPath),project=path.join(data,'native-project');fs.mkdirSync(project,{recursive:true});
 let launches=0;service.launch=(store)=>{launches++;assert.equal(runAttachments(store.load(),store).length,1);};
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',projectMode:'direct'});
 const sent=await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'process attachment',attachments:[text],directAcknowledged:true});
 assert.equal(launches,1);const ref=sent.runs[0],store=service.store(ref.profileId,ref.id),items=runAttachments(store.load(),store);
 assert.equal(fs.readFileSync(items[0].path,'utf8'),'abc');assert.ok(!store.load().goal.includes('session-attachments'));
 const restarted=new DesktopService(root,service.data,process.execPath),again=restarted.store(ref.profileId,ref.id);assert.deepEqual(again.load().userAttachments,store.load().userAttachments);
});
