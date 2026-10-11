import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import type {BrowserWindow,Screen} from 'electron';
import {restoreWindowBounds,ensureWindowOnDisplay,watchWindowDisplays,type WindowBounds} from './windowPlacement.js';
const primary={x:0,y:0,width:1920,height:1040},left={x:-2560,y:0,width:2560,height:1400};
const inside=(b:WindowBounds,a:WindowBounds)=>b.x>=a.x&&b.y>=a.y&&b.x+b.width<=a.x+a.width&&b.y+b.height<=a.y+a.height;

test('stale third-monitor position returns to current primary after primary/layout change',()=>{
 const saved={x:2937,y:295,width:1453,height:913};
 const bounds=restoreWindowBounds(saved,[primary,left],primary);
 assert.ok(inside(bounds,primary));assert.equal(bounds.width,1453);assert.equal(bounds.height,913);
 assert.deepEqual(saved,{x:2937,y:295,width:1453,height:913});
});
test('valid negative-coordinate secondary and vertically arranged display positions stay intact',()=>{
 const upper={x:0,y:-1440,width:2560,height:1440};
 for(const [saved,areas] of [[{x:-2400,y:80,width:1300,height:900},[primary,left]],[{x:500,y:-1300,width:1300,height:900},[primary,upper]]] as const){assert.deepEqual(restoreWindowBounds(saved,[...areas],primary),saved);}
});
test('only a sliver or content without a title bar cannot strand the window',()=>{
 for(const saved of [{x:1900,y:100,width:1440,height:900},{x:100,y:-850,width:1440,height:900},{x:-90000,y:90000,width:1440,height:900}])assert.ok(inside(restoreWindowBounds(saved,[primary],primary),primary));
});
test('reduced resolution/DPI work areas and taskbar offsets fit the whole window',()=>{
 const small={x:40,y:24,width:800,height:576};
 for(const saved of [{x:0,y:0,width:7680,height:4320},{x:2937,y:295,width:1453,height:913},null])assert.ok(inside(restoreWindowBounds(saved,[small],small),small));
 assert.deepEqual(restoreWindowBounds(null,[small],small),small);
 const tallTaskbar={x:0,y:50,width:1920,height:990};assert.ok(inside(restoreWindowBounds({x:100,y:0,width:1440,height:900},[tallTaskbar],tallTaskbar),tallTaskbar));
});
test('missing, malformed and unsafe saved data falls back safely',()=>{
 for(const saved of [undefined,null,[],{},'oops',{width:NaN,height:-1,x:Infinity,y:0},{width:1440,height:900,x:Number.MAX_SAFE_INTEGER+1,y:2}])assert.ok(inside(restoreWindowBounds(saved,[primary],primary),primary));
});

function fake(){
 const window=new EventEmitter() as EventEmitter&Record<string,any>,screen=new EventEmitter() as EventEmitter&Record<string,any>;
 let bounds={x:90000,y:90000,width:1440,height:900},maximized=false,fullscreen=false,closed=false;
 const actions:string[]=[];
 Object.assign(window,{isDestroyed:()=>closed,getBounds:()=>({...bounds}),isMaximized:()=>maximized,isFullScreen:()=>fullscreen,setFullScreen:(value:boolean)=>{fullscreen=value;actions.push('fullscreen:'+value);},unmaximize:()=>{maximized=false;actions.push('unmaximize');},maximize:()=>{maximized=true;actions.push('maximize');},setMinimumSize:(w:number,h:number)=>{actions.push('minimum:'+w+':'+h);},setBounds:(value:WindowBounds)=>{bounds=value;actions.push('bounds');}});
 Object.assign(screen,{getAllDisplays:()=>[{workArea:primary}],getPrimaryDisplay:()=>({workArea:primary})});
 return {window:window as unknown as BrowserWindow,screen:screen as unknown as Screen,actions,getBounds:()=>bounds,move:(value:WindowBounds)=>{bounds=value;},maximize:()=>{maximized=true;},fullscreen:()=>{fullscreen=true;},close:()=>{closed=true;window.emit('closed');}};
}
test('recovery preserves maximize/fullscreen and leaves already visible windows alone',()=>{
 for(const state of ['normal','maximized','fullscreen']){const f=fake();if(state==='maximized')f.maximize();if(state==='fullscreen')f.fullscreen();ensureWindowOnDisplay(f.window,f.screen);assert.ok(inside(f.getBounds(),primary));if(state==='maximized')assert.ok(f.actions.includes('maximize'));if(state==='fullscreen')assert.ok(f.actions.includes('fullscreen:true'));const before=f.actions.length;ensureWindowOnDisplay(f.window,f.screen);assert.equal(f.actions.length,before);}
});
test('display change handlers repair hidden positions and detach on window close',()=>{
 const f=fake();watchWindowDisplays(f.window,f.screen);
 for(const event of ['display-added','display-removed','display-metrics-changed']){f.move({x:90000,y:90000,width:1440,height:900});f.screen.emit(event);assert.ok(inside(f.getBounds(),primary));assert.equal(f.screen.listenerCount(event),1);}
 f.close();assert.equal(f.screen.listenerCount('display-removed'),0);const before=f.actions.length;ensureWindowOnDisplay(f.window,f.screen);assert.equal(f.actions.length,before);
});
