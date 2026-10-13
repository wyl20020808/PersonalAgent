import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compatibleOpencodeExecutable,resolveOpencodeExecutable,startCompatibleOpencodeService,type OpenCodeLauncher,type OpenCodeService} from '../src/opencode-decision-agent.js';

const api={paths:{'/session/{sessionID}/message':{post:{requestBody:{content:{'application/json':{schema:{properties:{format:{properties:{type:{enum:['json_schema']}}}}}}}}}}}};
function fixture(supported:boolean,close:()=>Promise<void>=async()=>{}):OpenCodeService{return{client:{} as any,openapi:supported?api:{paths:{}},close};}

test('CLI defaults to installed compatible runtime without desktop environment; explicit selection still wins',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'opencode-format-')),file=path.join(root,'compatible.exe');fs.writeFileSync(file,'fixture');
 const previous=process.env.PERSONAL_AGENT_OPENCODE_COMPATIBLE_EXECUTABLE,selected=process.env.PERSONAL_AGENT_OPENCODE_EXECUTABLE;
 try{process.env.PERSONAL_AGENT_OPENCODE_COMPATIBLE_EXECUTABLE=file;delete process.env.PERSONAL_AGENT_OPENCODE_EXECUTABLE;
  assert.equal(compatibleOpencodeExecutable(),fs.realpathSync(file));assert.equal(resolveOpencodeExecutable(),fs.realpathSync(file));
  assert.equal(resolveOpencodeExecutable(process.execPath),fs.realpathSync(process.execPath));
  assert.throws(()=>resolveOpencodeExecutable(path.join(root,'missing.exe')),/not found/);
 }finally{if(previous===undefined)delete process.env.PERSONAL_AGENT_OPENCODE_COMPATIBLE_EXECUTABLE;else process.env.PERSONAL_AGENT_OPENCODE_COMPATIBLE_EXECUTABLE=previous;if(selected===undefined)delete process.env.PERSONAL_AGENT_OPENCODE_EXECUTABLE;else process.env.PERSONAL_AGENT_OPENCODE_EXECUTABLE=selected;}
});

test('missing format closes incompatible service before one fallback; private runtime and cancellation signal retained',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'opencode-format-')),file=path.join(root,'compatible.exe');fs.writeFileSync(file,'fixture');
 const events:string[]=[],signal=new AbortController().signal;
 const launcher:OpenCodeLauncher=async(executable,directory,received,runtime)=>{assert.equal(directory,root);assert.equal(received,signal);assert.equal(runtime,executable===file?'private-session-runtime':'private-session-runtime.format-probe');events.push(executable===file?'fallback':'first');return fixture(executable===file,async()=>{events.push('close');});};
 const result=await startCompatibleOpencodeService(process.execPath,root,signal,'private-session-runtime',launcher,file);
 assert.deepEqual(events,['first','close','fallback']);assert.equal(result.compatibilityRecovery,'json-schema-format');await result.close();
});

test('compatible service returns directly; identical executable or absent fallback never loops',async()=>{
 for(const [supported,fallback] of [[true,process.execPath],[false,process.execPath],[false,undefined]] as const){let calls=0;const service=fixture(supported);const launcher:OpenCodeLauncher=async()=>{calls++;return service;};
  // Empty string suppresses the machine default for the absent-fallback fixture.
  assert.equal(await startCompatibleOpencodeService(process.execPath,'.',new AbortController().signal,undefined,launcher,fallback??''),service);assert.equal(calls,1);
 }
});

test('unsupported fallback also closes; startup/auth failures are not retried',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'opencode-format-')),file=path.join(root,'compatible.exe');fs.writeFileSync(file,'fixture');
 let calls=0,closes=0;const launcher:OpenCodeLauncher=async()=>{calls++;return fixture(false,async()=>{closes++;});};
 await assert.rejects(()=>startCompatibleOpencodeService(process.execPath,root,new AbortController().signal,undefined,launcher,file),/compatible runtime lacks/);assert.equal(calls,2);assert.equal(closes,2);
 calls=0;const denied:OpenCodeLauncher=async()=>{calls++;throw Error('authentication refused');};
 await assert.rejects(()=>startCompatibleOpencodeService(process.execPath,root,new AbortController().signal,undefined,denied,file),/authentication refused/);assert.equal(calls,1);
});

test('supported explicit runtime is probed in isolation then opens original persistence without recovery',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'opencode-format-')),file=path.join(root,'compatible.exe');fs.writeFileSync(file,'fixture');
 const runtimes:(string|undefined)[]=[],events:string[]=[];const launcher:OpenCodeLauncher=async(executable,_directory,_signal,runtime)=>{assert.equal(executable,fs.realpathSync(process.execPath));runtimes.push(runtime);events.push('start');return fixture(true,async()=>{events.push('close');});};
 const service=await startCompatibleOpencodeService(process.execPath,root,new AbortController().signal,'original',launcher,file);
 assert.deepEqual(runtimes,['original.format-probe','original']);assert.deepEqual(events,['start','close','start']);assert.equal(service.compatibilityRecovery,undefined);await service.close();
});

test('cancellation after first service cleanup prevents fallback dispatch',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'opencode-format-')),file=path.join(root,'compatible.exe');fs.writeFileSync(file,'fixture');
 const controller=new AbortController();let calls=0;const launcher:OpenCodeLauncher=async()=>{calls++;return fixture(false,async()=>{controller.abort();});};
 await assert.rejects(()=>startCompatibleOpencodeService(process.execPath,'.',controller.signal,undefined,launcher,file),/abort/i);assert.equal(calls,1);
});
