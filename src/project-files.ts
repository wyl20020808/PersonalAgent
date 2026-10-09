import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync, unlinkSync, openSync, closeSync, fsyncSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertD, atomicJson, type State, type Store } from './store.js';

export const hashBytes = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
export interface ProjectSnapshot { files: Record<string, string>; digest: string }
// Dependency caches and VCS metadata are not deliverable project files. We never
// traverse junctions or symlinks; a rejected path is reported, not silently copied.
export function projectFiles(root: string): string[] {
  const result: string[] = []; let bytes = 0;
  function walk(relative: string): void {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      if (['.git', 'node_modules'].includes(entry.name)) continue;
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const info = lstatSync(path.join(root, name));
      if (info.isSymbolicLink() || info.nlink > 1 && info.isFile()) throw new Error(`Project symlink/junction/hardlink rejected: ${name}`);
      if (info.isDirectory()) walk(name);
      else if (info.isFile()) { bytes += info.size; if (bytes > 100 * 1024 * 1024 || result.length >= 20000) throw new Error('Project snapshot limit exceeded (100 MiB / 20000 files)'); result.push(name); }
      else throw new Error(`Unsupported project entry: ${name}`);
    }
  }
  walk(''); return result.sort();
}
export function readProject(root: string): ProjectSnapshot {
  const files: Record<string,string> = Object.create(null);
  for (const name of projectFiles(root)) files[name] = readFileSync(path.join(root,name)).toString('base64');
  return { files, digest: hashBytes(JSON.stringify(files)) };
}
export function loadProject(file: string): ProjectSnapshot {
  const value = JSON.parse(readFileSync(file,'utf8')) as ProjectSnapshot;
  if (!value.files || hashBytes(JSON.stringify(value.files)) !== value.digest) throw new Error('Project snapshot fingerprint mismatch');
  return value;
}
export function copyProject(from: string, to: string, overlay = false): ProjectSnapshot {
  const baseline = readProject(from); mkdirSync(to,{recursive:true});
  if(overlay)for(const name of projectFiles(to))if(!Object.hasOwn(baseline.files,name))unlinkSync(projectTarget(to,name));
  for (const [name, bytes] of Object.entries(baseline.files)) { const target = projectTarget(to,name); mkdirSync(path.dirname(target),{recursive:true}); writeFileSync(target,Buffer.from(bytes,'base64'),{flag:overlay?'w':'wx'}); }
  if (readProject(from).digest !== baseline.digest || readProject(to).digest !== baseline.digest) throw new Error('Project changed during preparation');
  return baseline;
}
export function fileStatus(before: ProjectSnapshot, after: ProjectSnapshot): string {
  return [...new Set([...Object.keys(before.files),...Object.keys(after.files)])].sort().filter(name => before.files[name] !== after.files[name]).map(name => `${before.files[name] === undefined ? 'A' : after.files[name] === undefined ? 'D' : 'M'} ${name}`).join('\n');
}
export function projectTarget(root: string, name: string): string {
  if (!name || name.includes('\\') || name.includes(':') || name.startsWith('/') || /[\x00-\x1f]/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(\.git|CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(part))) throw new Error('Unsafe project path');
  const target = path.resolve(root,name); let cursor = realpathSync(root);
  if (!target.toLowerCase().startsWith(`${cursor.toLowerCase()}${path.sep}`)) throw new Error('Project path escape');
  for (const part of name.split('/')) { cursor = path.join(cursor,part); if (existsSync(cursor)) { const info=lstatSync(cursor); if(info.isSymbolicLink() || info.isFile() && info.nlink>1) throw new Error('Project symlink/junction/hardlink rejected'); } }
  return target;
}
// Explicit recovery is conflict-safe: current bytes must match the recorded
// checkpoint. Never overwrite changes made after that checkpoint.
export function restoreProject(store: Store, checkpoint: string, decision: string): void {
  const unlock=store.lock();let release:(()=>void)|undefined;
  try {
    const state=store.load();
    if(state.config.projectMode!=='direct' || !decision.trim() || !['completed','paused','failed','stopped'].includes(state.phase)) throw new Error('Direct recovery requires stopped run and explicit decision');
    release=lockProject(state);
    if(!/^recovery-[0-9a-f-]+\.json$/.test(checkpoint)) throw new Error('Invalid recovery checkpoint');
    const expected=loadProject(store.file(checkpoint)), baseline=loadProject(store.file('project-baseline.json'));
    if(readProject(state.source).digest!==expected.digest) throw new Error('Project recovery conflict: files changed since checkpoint');
    atomicJson(store.file(`recovery-backup-${Date.now()}.json`),expected);
    for(const name of new Set([...Object.keys(expected.files),...Object.keys(baseline.files)])) {
      if(expected.files[name]===baseline.files[name]) continue;
      const target=projectTarget(state.source,name);
      if(baseline.files[name]===undefined) unlinkSync(target);
      else {mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,Buffer.from(baseline.files[name]!,'base64'));}
    }
    store.audit('direct-recovery',{checkpoint,decision,before:expected.digest,after:readProject(state.source).digest});
    state.phase='stopped'; state.reason='User explicitly restored project baseline'; state.evidence=null; store.save(state);
  } finally {release?.();unlock();}
}
export function assertProjectRuntime(root: string, runtime: string): void {
  const destination=assertD(runtime).toLowerCase(), project=realpathSync(root).toLowerCase();
  if(destination===project || destination.startsWith(`${project}${path.sep}`) || project.startsWith(`${destination}${path.sep}`)) throw new Error('Runtime and project directories must not overlap');
}
export function lockProject(state: State): () => void {
  if(state.config.projectMode!=='direct') return () => {};
  const directory=process.platform==='win32' ? 'D:/PersonalAgent-data/project-locks' : path.resolve('.project-locks'); mkdirSync(directory,{recursive:true});
  const file=path.join(directory,`${hashBytes(realpathSync(state.source).toLowerCase())}.json`);
  const guard=openSync(`${file}.recovery`,'wx');
  try {
      if(existsSync(file)) {
        const owner=JSON.parse(readFileSync(file,'utf8')) as {pid:number};
        if(!Number.isInteger(owner.pid)||owner.pid<1)throw new Error('Invalid project lock; manual inspection required');
        let alive=true;try{process.kill(owner.pid,0);}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')alive=false;}
        if(alive)throw new Error('Project is already running in direct mode');
        unlinkSync(file);
      }
  const fd=openSync(file,'wx');try{writeFileSync(fd,JSON.stringify({pid:process.pid,runId:state.id}));fsyncSync(fd);}finally{closeSync(fd);}
  } finally {closeSync(guard);unlinkSync(`${file}.recovery`);}
  return () => unlinkSync(file);
}
