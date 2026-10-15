import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {terminateTree} from '../src/process.js';

test('POSIX cancellation ends owned detached descendants and preserves unrelated processes',{skip:process.platform==='win32',timeout:10000},async()=>{
 const unrelated=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
 const parent=spawn(process.execPath,['--input-type=module','-e',`import {spawn} from 'node:child_process';const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});child.on('spawn',()=>console.log(child.pid));setInterval(()=>{},1000);`],{detached:true,stdio:['ignore','pipe','ignore']});
 let descendant:number|undefined;
 const closed=new Promise<void>(resolve=>parent.once('close',()=>resolve()));
 try{
  descendant=await new Promise<number>((resolve,reject)=>{parent.stdout!.once('data',data=>resolve(Number(String(data).trim())));parent.once('error',reject);});
  assert.ok(Number.isInteger(descendant)&&descendant>0);
  await terminateTree(parent.pid!);await closed;
  assert.doesNotThrow(()=>process.kill(unrelated.pid!,0));
  // Reparenting and reaping can take a moment; a zombie is no longer executing.
  let gone=false;for(let attempt=0;attempt<20;attempt++){try{process.kill(descendant,0);}catch{gone=true;break;}await new Promise(r=>setTimeout(r,50));}
  assert.ok(gone,'Detached child must be reaped after owned cancellation');
 }finally{await terminateTree(parent.pid!);if(descendant)try{process.kill(descendant,'SIGKILL');}catch{}await terminateTree(unrelated.pid!);}
});
