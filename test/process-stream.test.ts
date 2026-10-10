import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import type {spawn} from 'node:child_process';
import {runProcess} from '../src/process.js';

for(const channel of ['stdout','stderr'] as const)test(`process ${channel} ENOTCONN becomes rejected operation instead of uncaught Socket error`,async()=>{
  const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),pid:undefined});
  const spawnChild=(()=>{setImmediate(()=>{child[channel].emit('error',Object.assign(new Error('read ENOTCONN'),{code:'ENOTCONN'}));child.emit('close',1);});return child;}) as unknown as typeof spawn;
  await assert.rejects(runProcess('LOCAL-MOCK-ONLY',[],{cwd:process.cwd(),timeoutMs:1000},spawnChild),/read ENOTCONN/);
});
test('Windows excessive working directory is rejected before starting a process',{skip:process.platform!=='win32'},async()=>{
  const spawnChild=(()=>{throw new Error('must not spawn');}) as unknown as typeof spawn;
  await assert.rejects(runProcess('NEVER-LAUNCH',[],{cwd:`D:/${'x'.repeat(300)}`,timeoutMs:1000},spawnChild),/259-character limit/);
});

for (const channel of ['stdout','stderr'] as const) test(`streaming ${channel} retains a bounded tail without killing verbose tasks`, async () => {
  const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),pid:undefined});
  const spawnChild=(()=>{setImmediate(()=>{
    for(let i=0;i<160;i++)child[channel].write('x'.repeat(64*1024));
    child[channel].write('TAIL');child.emit('close',0);
  });return child;}) as unknown as typeof spawn;
  const result=await runProcess('LOCAL-MOCK-ONLY',[],{cwd:process.cwd(),timeoutMs:0,streamOutput:true},spawnChild);
  assert.equal(result.exitCode,0);assert.equal(result[channel].length,1024*1024);assert.ok(result[channel].endsWith('TAIL'));
});

test('non-streaming output still rejects excessive buffered output',async()=>{
  const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),pid:undefined});
  const spawnChild=(()=>{setImmediate(()=>{
    for(let i=0;i<130;i++)child.stderr.write('x'.repeat(64*1024));
    child.emit('close',0);
  });return child;}) as unknown as typeof spawn;
  await assert.rejects(runProcess('LOCAL-MOCK-ONLY',[],{cwd:process.cwd(),timeoutMs:0},spawnChild),/Process output limit exceeded/);
});

test('streaming line callbacks preserve lines across chunks',async()=>{
  const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),pid:undefined});
  const spawnChild=(()=>{setImmediate(()=>{child.stdout.write('first');child.stdout.write('\nsecond\n');child.emit('close',0);});return child;}) as unknown as typeof spawn;
  const lines:string[]=[];
  await runProcess('LOCAL-MOCK-ONLY',[],{cwd:process.cwd(),timeoutMs:0,streamOutput:true,onLine:line=>lines.push(line)},spawnChild);
  assert.deepEqual(lines,['first','second']);
});
