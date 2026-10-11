import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseFileChanges,messageFiles,recordedDiff,findFileChange} from './fileChanges.js';
import type {ChatMessage,ChatFilePreview} from './types.js';
import {DesktopService,validateRequest} from './service.js';
import {git} from '../../dist/src/workspace.js';

const patch='diff --git a/src/code.ts b/src/code.ts\n--- a/src/code.ts\n+++ b/src/code.ts\n@@ -8,2 +8,3 @@\n keep\n-old\n+new\n+extra\n';
const tool:ChatMessage={id:'audit:'+ 'a'.repeat(64),role:'codex',runId:'run',taskId:'task',loop:2,time:'',title:'Codex 文件操作',kind:'tool',status:'success',source:'audit',text:'completed\n'+JSON.stringify([{path:'D:/Demo/src/code.ts',kind:'update'}]),details:{protocol:'codex-sdk-runStreamed'}};
test('unified diff counts content only and retains old/new line numbers',()=>{
 const [file]=parseFileChanges(patch);assert.equal(file.path,'src/code.ts');assert.equal(file.added,2);assert.equal(file.removed,1);
 assert.deepEqual(file.lines.find(line=>line.text==='-old'),{kind:'remove',text:'-old',oldLine:9});assert.deepEqual(file.lines.find(line=>line.text==='+extra'),{kind:'add',text:'+extra',newLine:10});
 const [prefix]=parseFileChanges(patch.replace('+new','+++new'));assert.equal(prefix.added,2);
});
test('quoted paths, deletion, new files, snapshot wrapper and multiple files',()=>{
 const quoted=patch.replaceAll('src/code.ts','folder/a b.ts').replace('--- a/folder/a b.ts','--- "a/folder/a b.ts"').replace('+++ b/folder/a b.ts','+++ "b/folder/a b.ts"');assert.equal(parseFileChanges(quoted)[0].path,'folder/a b.ts');
 assert.equal(parseFileChanges(patch.replace('+++ b/src/code.ts','+++ /dev/null'))[0].path,'src/code.ts');
 assert.equal(parseFileChanges('NEW FILE hello.txt\nhello\n')[0].added,1);
 assert.equal(parseFileChanges('\nNEW FILE hello.txt\nhello\n\n')[0].added,1);
 assert.deepEqual(parseFileChanges('\nNEW FILE a\nhello\n\n\nNEW FILE b\nworld\n\n').map(file=>file.added),[1,1]);
 assert.deepEqual(parseFileChanges('\nNEW FILE a\nhello\n\n\n\nNEW FILE b\nworld\n\n\n').map(file=>file.added),[2,2]);
 assert.equal(parseFileChanges('\nNEW FILE a\n\n')[0].added,0);
 assert.equal(parseFileChanges('FILE src/code.ts\n'+patch+'\nFILE other.ts\n'+patch.replaceAll('src/code.ts','other.ts')).length,2);
 const unicode=String.raw`diff --git "a/\344\270\255.ts" "b/\344\270\255.ts"`+'\n'+String.raw`--- "a/\344\270\255.ts"`+'\n'+String.raw`+++ "b/\344\270\255.ts"`+'\n@@ -1 +1 @@\n-a\n+b\n';assert.equal(parseFileChanges(unicode)[0].path,'中.ts');
 const binary=parseFileChanges('FILE picture.png\nContent requires asset/large-file review; SHA-256 ...\n');assert.equal(binary[0].path,'picture.png');assert.ok(binary[0].notice);
 const files=parseFileChanges(patch.replaceAll('src/code.ts','index.ts')+patch.replaceAll('src/code.ts','src/index.ts'));assert.equal(findFileChange(files,'D:/Demo/src/index.ts',['D:/Demo'])?.path,'src/index.ts');assert.equal(findFileChange(files.slice(0,1),'D:/Demo/src/index.ts',['D:/Demo']),undefined);assert.equal(findFileChange(files,'D:/Other/src/index.ts',['D:/Demo']),undefined);assert.equal(parseFileChanges(patch),parseFileChanges(patch),'cached parsing shares one immutable result');
});
test('Git fallback supports a registered project inside a parent repository',async()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),data=path.join(root,'.v3c3','nested-'+randomUUID()),service=new DesktopService(root,data,process.execPath),repository=path.join(data,'repository'),project=path.join(repository,'sub');fs.mkdirSync(project,{recursive:true});
 await git(repository,['init']);await git(repository,['config','user.name','Test']);await git(repository,['config','user.email','test@example.invalid']);fs.writeFileSync(path.join(project,'code.ts'),'old\n');await git(repository,['add','sub/code.ts']);await git(repository,['commit','-m','fixture']);
 service.launch=()=>{};const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',projectMode:'direct'}),sent=await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'nested preview',directAcknowledged:true}),ref=sent.runs[0],store=service.store(ref.profileId,ref.id);
 fs.writeFileSync(path.join(project,'code.ts'),'new\n');store.audit('edits-applied',{paths:['code.ts'],summary:'test'});const message=service.thread(ref.profileId,ref.id).messages.find((item:any)=>item.details?.paths?.includes('code.ts'))!,preview=await service.readChatFile(ref.profileId,ref.id,message.id,'code.ts');assert.equal(preview.change?.path,'code.ts');assert.equal(preview.change?.added,1);assert.equal(preview.change?.removed,1);
 fs.writeFileSync(path.join(project,'binary.bin'),Buffer.from([0,255]));store.audit('edits-applied',{paths:['binary.bin'],summary:'binary'});const binary=service.thread(ref.profileId,ref.id).messages.find((item:any)=>item.details?.paths?.includes('binary.bin'))!;assert.match((await service.readChatFile(ref.profileId,ref.id,binary.id,'binary.bin')).notice??'',/无法生成文本/);
});
test('file cards associate only the same Run, Agent invocation and loop',()=>{
 const finish={...tool,id:'finish',kind:'changes',text:'',details:{diff:patch,protocol:'Controller limited Git observation'}};
 assert.deepEqual(messageFiles(tool),['D:/Demo/src/code.ts']);assert.match(recordedDiff([tool,finish],tool)!.scope,/此前修改/);
 assert.equal(recordedDiff([tool,{...finish,loop:3}],tool),undefined);
 assert.equal(recordedDiff([tool,{...tool,id:'start',kind:'dispatch'},finish],tool),undefined);
 assert.equal(recordedDiff([tool,{...finish,runId:'other'}],tool),undefined);
});
test('chat file IPC validates event membership, isolates workspace, preserves history and supports deleted files',async()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),data=path.join(root,'.v3c3','file-'+randomUUID()),service=new DesktopService(root,data,process.execPath),project=path.join(data,'project');
 fs.mkdirSync(path.join(project,'src'),{recursive:true});fs.writeFileSync(path.join(project,'src/code.ts'),'new\nextra\n');service.launch=()=>{};
 const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',projectMode:'direct'}),sent=await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'file preview',directAcknowledged:true}),ref=sent.runs[0],store=service.store(ref.profileId,ref.id);
 store.audit('agent-activity',{agent:'codex',taskId:'hello',loop:1,kind:'tool',title:tool.title,text:'completed\n'+JSON.stringify([{path:path.join(project,'src/code.ts'),kind:'update'}]),source:'codex-sdk-runStreamed'});
 store.audit('agent-finish',{agent:'codex',role:'execute',taskId:'hello',loop:1,durationMs:1,changed:true,diff:patch});
 const message=service.thread(ref.profileId,ref.id).messages.find((item:any)=>item.title===tool.title)!,before=fs.readFileSync(store.file('audit.jsonl'));
 const request={operation:'readChatFile',profileId:ref.profileId,runId:ref.id,messageId:message.id,file:path.join(project,'src/code.ts')};
 const preview=await service.dispatch(request) as ChatFilePreview;assert.equal(preview.path,'src/code.ts');assert.equal(preview.change?.added,2);assert.equal(preview.file?.text,'new\nextra\n');assert.deepEqual(fs.readFileSync(store.file('audit.jsonl')),before);
 await assert.rejects(service.dispatch({...request,file:'../outside'}),/未在/);await assert.rejects(service.dispatch({...request,messageId:'audit:'+'f'.repeat(64)}),/不存在/);
 assert.throws(()=>validateRequest({...request,projectPath:project}));
 store.audit('independent-check',{passed:true,diff:patch+' '.repeat(160000),tests:[]});const truncated=service.thread(ref.profileId,ref.id).messages.find((item:any)=>item.details?.diffTruncated)!;assert.ok(truncated);assert.equal((await service.readChatFile(ref.profileId,ref.id,truncated.id,'src/code.ts')).change?.added,2);
 store.audit('agent-activity',{agent:'codex',taskId:'hello',loop:1,kind:'output',title:'Codex 公开输出',text:'[报告](<'+path.join(project,'src/code.ts').replaceAll('\\','/')+'>) 和 `src/code.ts`',source:'codex-sdk-runStreamed'});
 const output=service.thread(ref.profileId,ref.id).messages.find((item:any)=>item.kind==='output'&&item.text.includes('[报告]'))!;
 assert.ok(output);assert.equal((await service.readChatFile(ref.profileId,ref.id,output.id,'src/code.ts')).file?.text,'new\nextra\n');
 assert.equal(await service.chatFileLocation(ref.profileId,ref.id,output.id,'src/code.ts'),path.join(project,'src/code.ts'));
 assert.equal(validateRequest({...request,operation:'chatFileMenu'}).operation,'chatFileMenu');
 fs.unlinkSync(path.join(project,'src/code.ts'));const deleted=await service.dispatch(request) as ChatFilePreview;assert.equal(deleted.change?.removed,1);assert.ok(deleted.contentError);
 // Absolute paths outside the Run and junctions never enable arbitrary reads.
 const outside=path.join(data,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'secret.txt'),'secret');
 store.audit('agent-activity',{agent:'codex',kind:'tool',title:tool.title,text:'completed\n'+JSON.stringify([{path:path.join(outside,'secret.txt')}]),source:'codex-sdk-runStreamed'});
 const external=service.thread(ref.profileId,ref.id).messages.filter((item:any)=>item.title===tool.title).at(-1)!;await assert.rejects(service.readChatFile(ref.profileId,ref.id,external.id,path.join(outside,'secret.txt')),/不属于/);
 store.audit('agent-activity',{agent:'codex',kind:'output',title:'Codex 公开输出',text:'[外部](<'+path.join(outside,'secret.txt').replaceAll('\\','/')+'>)',source:'codex-sdk-runStreamed'});
 const outsideOutput=service.thread(ref.profileId,ref.id).messages.find((item:any)=>item.kind==='output'&&item.text.includes('[外部]'))!;
 await assert.rejects(service.chatFileLocation(ref.profileId,ref.id,outsideOutput.id,path.join(outside,'secret.txt').replaceAll('\\','/')),/不属于/);
 fs.symlinkSync(outside,path.join(project,'alias'),'junction');store.audit('edits-applied',{paths:['alias/secret.txt'],summary:'test'});
 const alias=service.thread(ref.profileId,ref.id).messages.find((item:any)=>item.details?.paths?.includes('alias/secret.txt'))!;assert.ok((await service.readChatFile(ref.profileId,ref.id,alias.id,'alias/secret.txt')).contentError);
});
test('missing historical diff uses actual current Git HEAD delta, including untracked files',async()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),data=path.join(root,'.v3c3','git-file-'+randomUUID()),service=new DesktopService(root,data,process.execPath),project=path.join(data,'project');fs.mkdirSync(project,{recursive:true});
 await git(project,['init']);await git(project,['config','user.name','Test']);await git(project,['config','user.email','test@example.invalid']);fs.writeFileSync(path.join(project,'code.ts'),'old\n');await git(project,['add','code.ts']);await git(project,['commit','-m','fixture']);
 service.launch=()=>{};const session=service.sessions.create({operation:'createSession',projectPath:project,mode:'mock',projectMode:'direct'}),sent=await service.sessions.send({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'preview',directAcknowledged:true}),ref=sent.runs[0],store=service.store(ref.profileId,ref.id);
 fs.writeFileSync(path.join(project,'code.ts'),'new\nextra\n');fs.writeFileSync(path.join(project,'added.ts'),'export const added=true;\n');store.audit('edits-applied',{paths:['code.ts','added.ts'],summary:'test'});const message=service.thread(ref.profileId,ref.id).messages.find((item:any)=>item.details?.paths?.includes('code.ts'))!;
 const changed=await service.readChatFile(ref.profileId,ref.id,message.id,'code.ts');assert.match(changed.scope,/Git HEAD/);assert.equal(changed.change?.added,2);assert.equal(changed.change?.removed,1);
 const added=await service.readChatFile(ref.profileId,ref.id,message.id,'added.ts');assert.equal(added.change?.added,1);assert.equal(added.change?.removed,0);
 fs.writeFileSync(path.join(project,'code.ts'),'old\n');assert.match((await service.readChatFile(ref.profileId,ref.id,message.id,'code.ts')).notice??'',/没有文本差异/);
 fs.writeFileSync(path.join(project,'added.ts'),'x'.repeat(200001));const large=await service.readChatFile(ref.profileId,ref.id,message.id,'added.ts');assert.equal(large.change,undefined);assert.match(large.notice??'',/截断/);
});
