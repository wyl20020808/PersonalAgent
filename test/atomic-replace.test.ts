import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {replaceAtomic} from '../src/store.js';

test('atomic replacement retries transient Windows sharing failures without deleting the destination',()=>{
 const dir=path.join(path.resolve('.validation'),'atomic-replace-'+randomUUID());fs.mkdirSync(dir,{recursive:true});
 const target=path.join(dir,'state.json'),temp=target+'.tmp';fs.writeFileSync(target,'original');fs.writeFileSync(temp,'next');
 let attempts=0;
 replaceAtomic(temp,target,(source,destination)=>{
  attempts++;assert.equal(fs.readFileSync(target,'utf8'),'original');
  if(process.platform==='win32'&&attempts<3)throw Object.assign(new Error('sharing'),{code:'EPERM'});
  fs.renameSync(source,destination);
 });
 assert.equal(attempts,process.platform==='win32'?3:1);assert.equal(fs.readFileSync(target,'utf8'),'next');
 fs.writeFileSync(temp,'pending');attempts=0;
 assert.throws(()=>replaceAtomic(temp,target,()=>{attempts++;throw Object.assign(new Error('still locked'),{code:'EPERM'});}),/still locked/);
 assert.equal(attempts,process.platform==='win32'?6:1);assert.equal(fs.readFileSync(target,'utf8'),'next');assert.equal(fs.readFileSync(temp,'utf8'),'pending');
 attempts=0;assert.throws(()=>replaceAtomic(temp,target,()=>{attempts++;throw Object.assign(new Error('bad path'),{code:'ENOENT'});}),/bad path/);assert.equal(attempts,1);
});
