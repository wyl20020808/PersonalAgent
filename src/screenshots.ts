import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {State} from './store.js';
export interface Screenshot {id:string;path:string;source:string;width:number;height:number;hash:string;time:string;runId:string;taskId:string|null;loop:number;testIndex:number;name:string}
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const inside=(root:string,file:string)=>file.toLowerCase().startsWith(path.resolve(root).toLowerCase()+path.sep);
function checked(file:string,roots:string[]):string {
  const full=path.resolve(file);if(process.platform==='win32'&&!/^D:\\/i.test(full))throw Error('Screenshot must be on D drive');
  if(!roots.some(root=>inside(root,full)))throw Error('Screenshot outside trusted artifacts root');
  let part=full;while(part!==path.dirname(part)){
    if(fs.existsSync(part)&&fs.lstatSync(part).isSymbolicLink())throw Error('Screenshot path redirects through link');part=path.dirname(part);
  }
  const real=fs.realpathSync(full);if(!roots.some(root=>inside(root,real)))throw Error('Screenshot redirects outside trusted root');return real;
}
export function trustedScreenshotRoots(state:State):string[] {
  const roots:string[]=[];
  // Only configured external verifier scripts establish an artifacts root.
  for(const test of state.config.tests)for(const arg of test.args){
    if(!path.isAbsolute(arg)||! /\.(?:[cm]?js|py)$/i.test(arg)||!fs.existsSync(arg))continue;
    const real=fs.realpathSync(arg);if(!fs.statSync(real).isFile()||inside(state.workspace,real)||state.config.allowedRepositories.some(r=>inside(r,real)))continue;
    roots.push(path.join(path.dirname(real),'artifacts'));
  }
  return [...new Set(roots)];
}
export function collectScreenshots(state:State,tests:{stdout:string}[],time=new Date().toISOString()):Screenshot[] {
  const roots=trustedScreenshotRoots(state),images:Screenshot[]=[];
  for(const [testIndex,test] of tests.entries())for(const line of test.stdout.split('\n').filter(Boolean)){
    let result:any;try{result=JSON.parse(line);}catch{continue;}
    if(typeof result.artifacts!=='string')continue;
    let folder:string;try{folder=checked(result.artifacts,roots);}catch{continue;}
    if(!fs.statSync(folder).isDirectory()||inside(state.workspace,folder)||state.config.allowedRepositories.some(r=>inside(r,folder)))continue;
    for(const name of fs.readdirSync(folder).filter(f=>f.endsWith('.png')).slice(0,12))try{
      const file=checked(path.join(folder,name),roots),stat=fs.statSync(file);
      if(!stat.isFile()||stat.size>3*1024*1024||stat.size<24)continue;
      const bytes=fs.readFileSync(file);if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.subarray(12,16).toString()!=='IHDR')continue;
      const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(!width||!height||width>8000||height>8000)continue;
      const hash=sha(bytes),taskId=state.tasks[state.taskIndex]?.id??null;
      const id=createHash('sha256').update(`${file}\0${hash}\0${taskId}\0${state.loops}`).digest('hex');
      images.push({id,path:file,source:`trusted-test:${testIndex}`,width,height,hash,time,runId:state.id,taskId,loop:state.loops,testIndex,name});
    }catch{/* A vanished or unsafe screenshot is not trusted evidence. */}
  }
  return images.slice(-240);
}
export function screenshotBytes(state:State,image:Screenshot):Buffer {
  const file=checked(image.path,trustedScreenshotRoots(state));
  if(fs.statSync(file).size>3*1024*1024)throw Error('Screenshot size changed');
  const bytes=fs.readFileSync(file);if(sha(bytes)!==image.hash)throw Error('Screenshot changed since validation');return bytes;
}
