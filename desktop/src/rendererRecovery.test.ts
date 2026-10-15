import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import type {BrowserWindow} from 'electron';
import {installRendererRecovery} from './rendererRecovery.js';

function fixture(){
 const window=new EventEmitter(),contents=new EventEmitter();
 let time=0,loads=0,allowed=true,quitting=false,destroyed=false,fail=false,throwLog=false;
 const scheduled=new Map<number,{callback:()=>void;at:number}>(),logs:Record<string,unknown>[]=[];
 let serial=0;
 Object.assign(contents,{isDestroyed:()=>destroyed});
 Object.assign(window,{webContents:contents,isDestroyed:()=>destroyed,loadURL:async(url:string)=>{assert.equal(url,'personalagent://app/index.html');loads++;if(fail)throw Error('load failed');}});
 const recovery=installRendererRecovery(window as unknown as BrowserWindow,{
  quitting:()=>quitting,allowed:()=>allowed,now:()=>time,
  log:entry=>{if(throwLog)throw Error('disk unavailable');logs.push(entry);},
  schedule:(callback,delay)=>{const id=++serial;scheduled.set(id,{callback,at:time+delay});return id as unknown as ReturnType<typeof setTimeout>;},
  cancel:id=>{scheduled.delete(id as unknown as number);},
 });
 const crash=(reason='crashed')=>contents.emit('render-process-gone',{}, {reason,exitCode:-1});
 const advance=async(ms:number)=>{time+=ms;for(const [id,timer] of [...scheduled])if(timer.at<=time){scheduled.delete(id);timer.callback();}await Promise.resolve();await Promise.resolve();};
 return {window,contents,recovery,crash,advance,scheduled,logs,get loads(){return loads;},set allowed(value:boolean){allowed=value;},set quitting(value:boolean){quitting=value;},set destroyed(value:boolean){destroyed=value;},set fail(value:boolean){fail=value;},set throwLog(value:boolean){throwLog=value;}};
}

test('three spaced crashes all recover during one application lifetime',async()=>{
 const f=fixture();for(let i=0;i<3;i++){f.crash();await f.advance(1000);assert.equal(f.loads,i+1);await f.advance(600000);}f.recovery.dispose();
});
test('rapid crashes use a cooldown then recover without restarting Controller',async()=>{
 const f=fixture();for(let i=0;i<2;i++){f.crash();await f.advance(1000);}f.crash();await f.advance(1000);assert.equal(f.loads,2);
 assert.equal(f.scheduled.size,1);assert.ok(f.logs.some(e=>e.event==='renderer-recovery-cooldown'));
 await f.advance(598000);assert.equal(f.loads,3);f.recovery.dispose();
});
test('manual recovery works during cooldown and cancels duplicate timers',async()=>{
 const f=fixture();for(let i=0;i<2;i++){f.crash();await f.advance(1000);}f.crash();f.recovery.recover();await f.advance(0);
 assert.equal(f.loads,3);assert.equal(f.scheduled.size,0);await f.advance(600000);assert.equal(f.loads,3);f.recovery.dispose();
});
test('work mode defers renderer writes and idle resumes pending recovery',async()=>{
 const f=fixture();f.allowed=false;f.crash();await f.advance(1000);assert.equal(f.loads,0);
 assert.ok(f.logs.some(e=>e.reason==='deferred_by_work_mode'));f.allowed=true;await f.advance(10000);assert.equal(f.loads,1);f.recovery.dispose();
});
test('failed loads retry with bounded rate and logging errors cannot block recovery',async()=>{
 const f=fixture();f.fail=true;f.crash();await f.advance(1000);await f.advance(1000);await f.advance(1000);assert.equal(f.loads,2);
 f.fail=false;f.throwLog=true;await f.advance(598000);assert.equal(f.loads,3);assert.equal(f.scheduled.size,0);f.recovery.dispose();
});
test('clean exit, shutdown, destroyed windows and disposal do not reload',async()=>{
 const f=fixture();f.crash('clean-exit');assert.equal(f.scheduled.size,0);f.crash();f.quitting=true;await f.advance(1000);assert.equal(f.loads,0);
 f.quitting=false;f.crash();f.window.emit('closed');assert.equal(f.scheduled.size,0);assert.equal(f.contents.listenerCount('render-process-gone'),0);f.recovery.recover();assert.equal(f.loads,0);
 const g=fixture();g.crash();g.destroyed=true;await g.advance(1000);assert.equal(g.loads,0);g.recovery.dispose();
});
test('closed and repeated shutdown disposal never access destroyed BrowserWindow properties',()=>{
 const f=fixture();f.crash();f.destroyed=true;
 Object.defineProperty(f.window,'webContents',{get(){throw new TypeError('Object has been destroyed');}});
 assert.doesNotThrow(()=>f.window.emit('closed'));
 assert.doesNotThrow(()=>f.recovery.dispose());
 assert.equal(f.contents.listenerCount('render-process-gone'),0);
 assert.equal(f.scheduled.size,0);
});
