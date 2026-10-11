import type {BrowserWindow,Screen} from 'electron';

export type WindowBounds={x:number;y:number;width:number;height:number};
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value);
const overlap=(a:WindowBounds,b:WindowBounds)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));

/** Electron bounds and work areas are both in DIP, including negative monitor coordinates. */
export function restoreWindowBounds(saved:unknown,workAreas:WindowBounds[],primary:WindowBounds):WindowBounds{
 const value=saved as Partial<WindowBounds>|null;
 const width=integer(value?.width)&&value.width>0&&value.width<=7680?value.width:1440;
 const height=integer(value?.height)&&value.height>0&&value.height<=4320?value.height:900;
 const positioned=integer(value?.x)&&integer(value?.y);
 const previous:WindowBounds={x:positioned?value!.x!:0,y:positioned?value!.y!:0,width,height};
 // A sliver of content is insufficient: the title bar must remain usable.
 const title={...previous,height:32};
 const candidates=positioned?workAreas.filter(area=>overlap(title,area)>=Math.min(320,width)*32):[];
 const area=candidates.sort((a,b)=>overlap(previous,b)-overlap(previous,a))[0]??primary;
 const result={width:Math.min(area.width,Math.max(Math.min(1024,area.width),width)),height:Math.min(area.height,Math.max(Math.min(680,area.height),height))};
 const x=candidates.length?previous.x:area.x+Math.floor((area.width-result.width)/2);
 const y=candidates.length?previous.y:area.y+Math.floor((area.height-result.height)/2);
 return {...result,x:Math.max(area.x,Math.min(x,area.x+area.width-result.width)),y:Math.max(area.y,Math.min(y,area.y+area.height-result.height))};
}

export function ensureWindowOnDisplay(window:BrowserWindow,screen:Screen):void{
 if(window.isDestroyed())return;
 const before=window.getBounds();
 const bounds=restoreWindowBounds(before,screen.getAllDisplays().map(display=>display.workArea),screen.getPrimaryDisplay().workArea);
 if(Object.keys(bounds).every(key=>bounds[key as keyof WindowBounds]===before[key as keyof WindowBounds]))return;
 const maximized=window.isMaximized(),fullscreen=window.isFullScreen();
 if(fullscreen)window.setFullScreen(false);
 if(maximized)window.unmaximize();
 window.setMinimumSize(Math.min(1024,bounds.width),Math.min(680,bounds.height));
 window.setBounds(bounds);
 if(maximized)window.maximize();
 if(fullscreen)window.setFullScreen(true);
}

export function watchWindowDisplays(window:BrowserWindow,screen:Screen):void{
 const recover=()=>ensureWindowOnDisplay(window,screen);
 screen.on('display-added',recover);screen.on('display-removed',recover);screen.on('display-metrics-changed',recover);
 window.once('closed',()=>{screen.removeListener('display-added',recover);screen.removeListener('display-removed',recover);screen.removeListener('display-metrics-changed',recover);});
}
