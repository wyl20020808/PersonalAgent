import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRun} from '../src/controller.js';
import {Store} from '../src/store.js';
import {bindRunAttachments,runAttachments,codexInput,claudeInput,opencodeParts} from '../src/multimodal.js';
import {runCodexTurn} from '../src/native-agent.js';
import {runCodexDecisionTurn} from '../src/codex-decision-turn.js';
import {ClaudeCodeDecisionAgent} from '../src/claude-code-decision-agent.js';
import type {Config} from '../src/schema.js';
import {MAX_ATTACHMENT_BYTES,attachmentRefSchema} from '../src/attachment-types.js';

const root=path.resolve('.validation','multimodal-'+randomUUID());
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
test('100 MiB limit is shared by Run schema and native attachment delivery beyond old caps',async()=>{
 assert.equal(attachmentRefSchema.properties.size.maximum,100*1024*1024);
 assert.equal(MAX_ATTACHMENT_BYTES,attachmentRefSchema.properties.size.maximum);
 const {store}=await fixture(),bytes=Buffer.alloc(10*1024*1024,120);
 bindRunAttachments(store,[{name:'large.txt',mimeType:'text/plain',bytes}],true);
 const items=runAttachments(store.load(),store),input=claudeInput('任务',items);
 assert.ok(Buffer.byteLength(input)>9*1024*1024);
 const text=JSON.parse(input).message.content.at(-1).text;assert.ok(text.endsWith(bytes.toString()));
});
async function fixture(){
 const repo=path.join(root,randomUUID());fs.mkdirSync(repo,{recursive:true});
 const config:Config={mode:'real',projectMode:'direct',executionMode:'native',directAuthorization:{projectPath:repo,acknowledgedAt:new Date().toISOString()},allowedRepositories:[repo],runtimeDir:path.join(root,'runtime'),claudeExecutable:'NEVER-PAID',claudeStreaming:false,timeoutMs:5000,maxLoops:4,maxReworks:1,tests:[],mockScenario:'pass'};
 const store=await createRun(config,repo,'fixture');
 bindRunAttachments(store,[{name:'截图.png',mimeType:'image/png',bytes:png},{name:'说明.txt',mimeType:'text/plain',bytes:Buffer.from('中文附件：完整交付')}]);
 return {store,config};
}
test('Run keeps its own attachment bytes across restart and rejects tampering and path escapes',async()=>{
 const {store,config}=await fixture(),restored=new Store(config.runtimeDir,store.id),state=restored.load();
 const items=runAttachments(state,restored);assert.equal(items.length,2);assert.deepEqual(fs.readFileSync(items[0]!.path),png);assert.ok(items[0]!.path.startsWith(store.dir));
 assert.throws(()=>bindRunAttachments(store,[{name:'a',mimeType:'text/plain',bytes:Buffer.from('a')}]));
 const bytes=fs.readFileSync(items[0]!.path);bytes[bytes.length-1]=bytes[bytes.length-1]!^1;fs.writeFileSync(items[0]!.path,bytes);
 assert.throws(()=>runAttachments(state,restored),/完整性/);
 assert.throws(()=>runAttachments({...state,userAttachments:[{...state.userAttachments![0]!,file:'../outside.png'}]},restored),/路径/);
});
test('native serializers send exact pixels and full text; unsupported OpenCode model fails explicitly',async()=>{
 const {store}=await fixture(),items=runAttachments(store.load(),store);
 const input=JSON.parse(claudeInput('任务',items));assert.equal(input.type,'user');assert.deepEqual(Buffer.from(input.message.content.find((p:any)=>p.type==='image').source.data,'base64'),png);assert.ok(input.message.content.some((p:any)=>p.text?.includes('中文附件')));
 const parts=opencodeParts('任务',items,true);assert.equal(parts[1]!.type,'file');assert.ok(JSON.stringify(parts).includes(png.toString('base64')));assert.throws(()=>opencodeParts('任务',items,false),/图片输入能力/);assert.throws(()=>opencodeParts('任务',items),/图片输入能力/);
 const codex=codexInput('任务',items);assert.ok(Array.isArray(codex));assert.equal(codex.filter(p=>p.type==='local_image').length,1);assert.equal(codexInput('text only'),'text only');
});
test('chat follow-up appends verified attachments once and keeps the existing files',async()=>{
 const {store}=await fixture(),before=store.load().userAttachments!;
 const added={name:'follow-up.txt',mimeType:'text/plain',bytes:Buffer.from('new instructions')};
 bindRunAttachments(store,[added],true);bindRunAttachments(store,[added],true);
 assert.equal(store.load().userAttachments!.length,3);assert.deepEqual(store.load().userAttachments!.slice(0,2),before);
 assert.equal(runAttachments(store.load(),store).length,3);
 assert.throws(()=>bindRunAttachments(store,Array.from({length:6},(_,i)=>({...added,name:`extra-${i}.txt`})),true),/数量超限/);
 assert.equal(store.load().userAttachments!.length,3);
});
test('Codex decision and execution SDK boundaries receive local_image, including resume',async()=>{
 const {store}=await fixture(),attachments=runAttachments(store.load(),store);const seen:any[]=[];
 const sdk:any={startThread:()=>({runStreamed:async(input:any)=>{seen.push(input);return {events:(async function*(){yield {type:'thread.started',thread_id:'owned'};yield {type:'item.completed',item:{type:'agent_message',id:'m',text:'{"ok":true}'}};yield {type:'turn.completed',usage:{input_tokens:1,output_tokens:1,cached_input_tokens:0}};})()};}})};sdk.resumeThread=sdk.startThread;
 await runCodexTurn(sdk,{workspace:store.load().workspace,threadId:null,prompt:'execute',attachments},()=>{});
 await runCodexDecisionTurn(sdk,{workspace:store.load().workspace,threadId:'owned',prompt:'review',attachments,runId:store.id,role:'review',schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}},()=>{});
 assert.equal(seen.length,2);for(const input of seen)assert.equal(input.find((p:any)=>p.type==='local_image').path,attachments[0]!.path);
});
test('Claude adapter uses stream-json image input even when text streaming is disabled',async()=>{
 const {store,config}=await fixture();let calls=0;
 const agent=new ClaudeCodeDecisionAgent(config,async(_program,args,options)=>{calls++;assert.equal(args[args.indexOf('--input-format')+1],'stream-json');assert.equal(args[args.indexOf('--output-format')+1],'stream-json');const input=JSON.parse(options.input!);assert.ok(input.message.content.some((p:any)=>p.type==='image'&&p.source.data===png.toString('base64')));const result={type:'result',structured_output:{ok:true}};options.onLine?.(JSON.stringify(result));return {exitCode:0,stdout:'',stderr:''};});
 const state=store.load();const result=await agent.structured({state,store,role:'plan',phase:'plan',prompt:'{}',schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},workspace:state.workspace,runId:state.id,taskId:null,signal:new AbortController().signal,timeoutMs:5000});assert.deepEqual(result.output,{ok:true});assert.equal(calls,1);
});
