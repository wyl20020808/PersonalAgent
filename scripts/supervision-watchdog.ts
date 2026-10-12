import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {parseArgs} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {crashRestartReason,processAlive,recordCrashRestart,validateWatchdogPaths,watchdogOwner} from '../src/crash-watchdog.js';
import {redact} from '../src/telemetry.js';

const {values}=parseArgs({options:{root:{type:'string'},data:{type:'string'},electron:{type:'string'},owner:{type:'string'}}});
const {root,data,electron,owner}=values;
if(!root||!data||!electron||!owner)throw Error('Watchdog paths required');
validateWatchdogPaths(root,data,electron);
const log=(event:string,reason?:string)=>fs.appendFileSync(path.join(data,'supervision-watchdog.jsonl'),JSON.stringify({time:new Date().toISOString(),event,reason:reason?redact(reason):undefined})+'\n',{flush:true});
try{
  while(true){
    const state=watchdogOwner(data,owner);
    if(state.quitRequested)break;
    if(processAlive(state.pid)){await delay(5000);continue;}
    const file=path.join(data,'supervision-restarts.json'),restarts:number[]=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
    const reason=crashRestartReason(data,state,restarts,Date.now());
    if(reason){log('restart-skipped',reason);break;}
    // A normal quit or disabled setting arriving during inspection wins.
    const fresh=watchdogOwner(data,owner);
    if(fresh.quitRequested||crashRestartReason(data,fresh,restarts,Date.now()))break;
    recordCrashRestart(data,Date.now());
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
    env.PERSONALAGENT_SUPERVISION_RESTART='1';
    const child=spawn(electron,[path.join(root,'desktop')],{cwd:root,env,detached:true,windowsHide:true,stdio:'ignore',shell:false});
    await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    child.unref();log('application-restarted','恢复同一实例；运行锁和 Session 决定后续恢复，未新建任务');break;
  }
}catch(error){log('watchdog-error',String(error));process.exitCode=1;}
