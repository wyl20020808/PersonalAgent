import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {CodexLiveProjection,streamingCodex} from '../src/codex-live.js';
import {OpenCodePublicStream} from '../src/opencode-decision-agent.js';

test('official deltas preserve public text, tool receipts, usage and Thread/turn ownership',()=>{
 const p=new CodexLiveProjection('owned','turn');const n=(extra:object)=>({threadId:'owned',turnId:'turn',...extra});
 assert.deepEqual(p.accept('item/agentMessage/delta',n({threadId:'other',itemId:'text',delta:'PRIVATE'})),[]);
 assert.deepEqual(p.accept('item/agentMessage/delta',n({turnId:'other',itemId:'text',delta:'PRIVATE'})),[]);
 assert.deepEqual(p.accept('item/agentMessage/delta',{threadId:'owned',itemId:'text',delta:'PRIVATE'}),[]);
 assert.equal(p.accept('item/agentMessage/delta',n({itemId:'text',delta:'你'}))[0].item.text,'你');
 assert.equal(p.accept('item/agentMessage/delta',n({itemId:'text',delta:'好'}))[0].item.text,'你好');
 const reason=p.accept('item/completed',n({item:{id:'reason',type:'reasoning',summary:['公开摘要'],content:['HIDDEN_REASONING']}}));assert.equal(reason[0].item.text,'公开摘要');assert.ok(!JSON.stringify(reason).includes('HIDDEN'));
 assert.deepEqual(p.accept('item/reasoning/textDelta',n({delta:'HIDDEN_REASONING'})),[]);
 p.accept('item/started',n({item:{id:'cmd',type:'commandExecution',command:'fixture',status:'inProgress'}}));
 assert.equal(p.accept('item/commandExecution/outputDelta',n({itemId:'cmd',delta:'实际输出'}))[0].item.aggregated_output,'实际输出');
 assert.equal(p.accept('item/completed',n({item:{id:'cmd',type:'commandExecution',command:'fixture',status:'completed',exitCode:0}}))[0].item.exit_code,0);
 assert.equal(p.accept('item/completed',n({item:{id:'file',type:'fileChange',status:'completed',changes:[{path:'a.ts',kind:{type:'update'}}]}}))[0].item.changes[0].kind,'update');
 assert.equal(p.accept('item/completed',n({item:{id:'image',type:'imageView',path:'D:/proof.png'}}))[0].item.type,'image_view');
 p.accept('thread/tokenUsage/updated',n({tokenUsage:{last:{inputTokens:12,cachedInputTokens:2,outputTokens:8}}}));assert.deepEqual(p.accept('turn/completed',n({turn:{id:'turn',status:'completed'}}))[0].usage,{input_tokens:12,cached_input_tokens:2,output_tokens:8});
 assert.equal(p.accept('turn/completed',n({turn:{id:'turn',status:'failed',error:{message:'upstream failed'}}}))[0].type,'turn.failed');
});

test('OpenCode separate delta events require owned text metadata; tool input and reasoning do not become text',()=>{
 const s=new OpenCodePublicStream('D:/owned','session');
 const part={id:'part',messageID:'message',sessionID:'session',type:'text',text:'你'};
 assert.equal(s.accept({directory:'D:/owned',payload:{properties:{part}}})[0]!.text,'你');
 const event=(extra:object={})=>({directory:'D:/owned',payload:{type:'message.part.delta',properties:{sessionID:'session',messageID:'message',partID:'part',field:'text',delta:'好',...extra}}});
 assert.equal(s.accept(event())[0]!.text,'你好');assert.deepEqual(s.accept(event({sessionID:'other'})),[]);assert.deepEqual(s.accept(event({partID:'unknown'})),[]);assert.deepEqual(s.accept(event({messageID:'other'})),[]);assert.deepEqual(s.accept(event({field:'input'})),[]);
 assert.deepEqual(s.accept({...event(),directory:'D:/other'}),[]);
});

function fixture(){
 const root=path.resolve('.validation','live-rpc-'+randomUUID());fs.mkdirSync(root,{recursive:true});
 fs.writeFileSync(path.join(root,'app-server'),`import fs from 'node:fs';import readline from 'node:readline';fs.writeFileSync('server.pid',String(process.pid));const out=e=>console.log(JSON.stringify(e));readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);fs.appendFileSync('requests.jsonl',line+'\\n');if(r.method==='initialize')out({id:r.id,result:{}});if(r.method==='thread/start'||r.method==='thread/resume')out({id:r.id,result:{thread:{id:r.params.threadId??'owned-thread',cwd:process.cwd()}}});if(r.method==='thread/compact/start'){out({id:r.id,result:{}});const p={threadId:r.params.threadId,turnId:'compact-turn'};out({method:'turn/started',params:{...p,turn:{id:'compact-turn'}}});out({method:'item/started',params:{...p,item:{id:'compact-item',type:'contextCompaction'}}});out({method:'item/completed',params:{...p,item:{id:'compact-item',type:'contextCompaction'}}});out({method:'turn/completed',params:{...p,turn:{id:'compact-turn',status:'completed'}}});}if(r.method==='turn/start'){out({id:r.id,result:{turn:{id:'owned-turn'}}});if(r.params.input[0].text==='HANG')return;const p={threadId:r.params.threadId,turnId:'owned-turn'};out({method:'item/agentMessage/delta',params:{...p,threadId:'other',itemId:'reply',delta:'PRIVATE'}});out({method:'item/agentMessage/delta',params:{...p,itemId:'reply',delta:'你'}});setTimeout(()=>{out({method:'item/agentMessage/delta',params:{...p,itemId:'reply',delta:'好'}});out({method:'item/completed',params:{...p,item:{id:'reply',type:'agentMessage',text:'你好'}}});out({method:'turn/completed',params:{...p,turn:{id:'owned-turn',status:'completed'}}});},30);}});`);
 return {root,client:streamingCodex({codexPathOverride:process.execPath})};
}
test('owned RPC stream resumes original Thread, transports effort/schema, closes service and emits deltas before completion',async()=>{
 const f=fixture(),seen:any[]=[];
 const {events}=await f.client.resumeThread('original-thread',{workingDirectory:f.root,model:'fixture',modelReasoningEffort:'medium',sandboxMode:'read-only',networkAccessEnabled:false}).runStreamed('reply',{outputSchema:{type:'object'}});
 for await(const e of events)seen.push(e);
 assert.equal(seen[0].thread_id,'original-thread');assert.equal(seen.filter(e=>e.type==='item.updated').length,2);assert.equal(seen.at(-1).type,'turn.completed');assert.ok(!JSON.stringify(seen).includes('PRIVATE'));
 const rows=fs.readFileSync(path.join(f.root,'requests.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s));const start=rows.find(r=>r.method==='turn/start');assert.equal(start.params.effort,'medium');assert.equal(start.params.sandboxPolicy.type,'readOnly');assert.deepEqual(start.params.outputSchema,{type:'object'});assert.equal(rows.find(r=>r.method==='thread/resume').params.threadId,'original-thread');
 const pid=Number(fs.readFileSync(path.join(f.root,'server.pid'),'utf8'));assert.throws(()=>process.kill(pid,0));
});
test('abort interrupts an owned RPC turn and confirms child process exit',async()=>{
 const f=fixture(),stop=new AbortController();const {events}=await f.client.startThread({workingDirectory:f.root}).runStreamed('HANG',{signal:stop.signal});
 const timer=setTimeout(()=>stop.abort(),300);try{await assert.rejects(async()=>{for await(const _e of events){}},/Stopped/);}finally{clearTimeout(timer);}
 const pid=Number(fs.readFileSync(path.join(f.root,'server.pid'),'utf8'));assert.throws(()=>process.kill(pid,0));
});

test('preflight compaction waits for native completion on original Thread before starting work',async()=>{
 const f=fixture(),client=streamingCodex({codexPathOverride:process.execPath,compactBeforeTurn:true,config:{model_auto_compact_token_limit:850}}),seen:any[]=[];
 const {events}=await client.resumeThread('original-thread',{workingDirectory:f.root}).runStreamed('reply',{signal:AbortSignal.timeout(10000)});
 for await(const e of events)seen.push(e);
 assert.deepEqual(seen.filter(e=>e.type==='context.compaction').map(e=>e.status),['compacting','compacted']);
 assert.equal(seen.at(-1).type,'turn.completed');
 const requests=fs.readFileSync(path.join(f.root,'requests.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s));
 assert.ok(requests.findIndex(r=>r.method==='thread/compact/start')<requests.findIndex(r=>r.method==='turn/start'));
 assert.equal(requests.find(r=>r.method==='thread/compact/start').params.threadId,'original-thread');
 assert.equal(requests.find(r=>r.method==='thread/resume').params.config.model_auto_compact_token_limit,850);
});
