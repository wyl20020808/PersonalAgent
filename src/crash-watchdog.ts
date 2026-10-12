import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assertD,atomicJson} from './store.js';
import {instanceId,instanceData} from './instance-runtime.js';

export type WatchdogOwner={pid:number;quitRequested:boolean;time:string};
export const CRASH_RESTART_WINDOW_MS=10*60*1000;

export function processAlive(pid:number):boolean {
  if(!Number.isSafeInteger(pid)||pid<=0)throw Error('Invalid watchdog owner PID');
  try{process.kill(pid,0);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return false;return true;}
}

// Only inspect this instance's trusted registered runtimes. Missing/corrupt
// metadata never supplies authority to open another workspace or instance.
export function crashRestartReason(data:string,owner:WatchdogOwner,restarts:number[],now:number):string|undefined {
  if(owner.quitRequested)return '用户正常退出';
  const registry=JSON.parse(fs.readFileSync(path.join(data,'profiles.json'),'utf8'));
  if(registry.automaticDevelopment?.enabled!==true)return '全自动开发模式关闭';
  if(restarts.filter(time=>now-time<CRASH_RESTART_WINDOW_MS).length>=3)return '十分钟内已重启三次，停止崩溃循环';
  const claimed=JSON.parse(fs.readFileSync(path.join(data,'instance.json'),'utf8'));
  if(claimed.instanceId!==instanceId())return '实例身份不匹配';
  const active=['planning','execute','executing','applying','verify','review','paused'];
  for(const profile of registry.profiles){
    if(profile.readOnly)continue;
    try{
      const bytes=fs.readFileSync(assertD(profile.file));
      if(createHash('sha256').update(bytes).digest('hex')!==profile.hash)continue;
      const config=JSON.parse(bytes.toString('utf8')),runtime=assertD(config.runtimeDir);
      const realData=fs.realpathSync(data).toLowerCase(),realRuntime=fs.realpathSync(runtime).toLowerCase();
      // Automatically created runtimes belong to instance data. A writable
      // MAIN legacy profile may instead explicitly authorize an external runtime.
      if(instanceId()!=='main'&&!realRuntime.startsWith(realData+path.sep))continue;
      const runs=path.join(runtime,'runs');if(!fs.existsSync(runs))continue;
      for(const id of fs.readdirSync(runs).filter(id=>/^[0-9a-f-]{36}$/.test(id))){
       try{
        const folder=path.join(runs,id),state=JSON.parse(fs.readFileSync(path.join(folder,'state.json'),'utf8'));
        if(state.id===id&&path.resolve(state.config.runtimeDir).toLowerCase()===path.resolve(runtime).toLowerCase()&&state.purpose!=='conversation-discussion'&&(active.includes(state.phase)||state.phase==='failed'&&state.failure?.recoverable===true)&&!fs.existsSync(path.join(folder,'stop.request')))return undefined;
       }catch{/* One corrupt Run must not hide another recoverable Run. */}
      }
    }catch{/* An unavailable profile is not restart authority. */}
  }
  return '退出时没有运行中的开发任务';
}

export function watchdogOwner(data:string,file:string):WatchdogOwner {
  const target=path.resolve(file),base=path.resolve(data);
  if(path.dirname(target)!==base||!/^supervision-owner-[a-f0-9-]{36}\.json$/.test(path.basename(target)))throw Error('Invalid watchdog owner file');
  const owner=JSON.parse(fs.readFileSync(target,'utf8')) as WatchdogOwner;
  if(!Number.isSafeInteger(owner.pid)||owner.pid<=0||typeof owner.quitRequested!=='boolean')throw Error('Invalid watchdog owner');
  return owner;
}

export function recordCrashRestart(data:string,now:number):number[] {
  const file=path.join(data,'supervision-restarts.json');
  const previous:number[]=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
  if(!Array.isArray(previous)||previous.some(time=>!Number.isFinite(time)))throw Error('Invalid crash restart history');
  const recent=previous.filter(time=>now-time<CRASH_RESTART_WINDOW_MS);
  if(recent.length>=3)throw Error('Crash restart limit reached');
  recent.push(now);atomicJson(file,recent);return recent;
}

export function validateWatchdogPaths(root:string,data:string,electron:string){
  assertD(root);assertD(data);
  if(path.resolve(instanceData(root)).toLowerCase()!==path.resolve(data).toLowerCase())throw Error('Watchdog data mismatch');
  if(!path.isAbsolute(electron)||!fs.existsSync(electron)||!fs.existsSync(path.join(root,'desktop','out','main.js')))throw Error('Watchdog application unavailable');
}
