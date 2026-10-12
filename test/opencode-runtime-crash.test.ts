import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';import {createServer} from 'node:http';import {once} from 'node:events';
import {opencodeEnvironment} from '../src/opencode-runtime.js';import {startOpencodeService} from '../src/opencode-decision-agent.js';import type {spawn} from 'node:child_process';
test('Windows long private snapshot paths disable provider snapshots without touching user config or Session directories',()=>{
 const root=path.resolve('.validation','runtime-crash-'+randomUUID()),file=path.join(root,'user.json');fs.mkdirSync(root,{recursive:true});const bytes=JSON.stringify({provider:{fixture:{name:'Local fixture'}}});fs.writeFileSync(file,bytes);
 const before=process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE;process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE=file;
 try{const runtime=path.join(root,'x'.repeat(70)),env=opencodeEnvironment(root,runtime),config=JSON.parse(env.OPENCODE_CONFIG_CONTENT!);
  if(process.platform==='win32')assert.equal(config.snapshot,false);else assert.equal(config.snapshot,undefined);
  assert.equal(env.XDG_DATA_HOME,path.join(runtime,'data'));assert.equal(env.OPENCODE_DB,path.join(runtime,'data/opencode.db'));assert.equal(config.provider.fixture.name,'Local fixture');assert.equal(fs.readFileSync(file,'utf8'),bytes);
 }finally{if(before===undefined)delete process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE;else process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE=before;}
});
test('owned service records abnormal exit code separately from requested cleanup, without stderr or authentication',async()=>{
 const root=path.resolve('.validation','service-exit-'+randomUUID());fs.mkdirSync(root,{recursive:true});const executable=path.join(root,'fixture.exe');fs.writeFileSync(executable,'LOCAL FAKE');
 const server=createServer((_request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify({paths:{}}));});server.listen(0,'127.0.0.1');await once(server,'listening');
 const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),pid:undefined});
 const spawnFixture=((_executable:any,_args:any,_options:any)=>{setImmediate(()=>child.stdout.write(`opencode server listening on http://127.0.0.1:${(server.address() as any).port}\n`));return child;}) as unknown as typeof spawn;
 const service=await startOpencodeService(executable,root,new AbortController().signal,path.join(root,'runtime'),spawnFixture);
 try{assert.equal(service.diagnostics?.().closed,false);child.emit('close',37,null);assert.deepEqual(service.diagnostics?.(),{pid:undefined,closed:true,code:37,signal:null,requestedClose:false});await service.close();assert.equal(service.diagnostics?.().requestedClose,false);assert.ok(!JSON.stringify(service.diagnostics?.()).includes('password'));}
 finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
