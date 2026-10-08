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
