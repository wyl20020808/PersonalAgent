import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync, unlinkSync, openSync, closeSync, fsyncSync, readSync, fstatSync, copyFileSync, renameSync, constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { assertD, atomicJson, type State, type Store } from './store.js';

export const hashBytes = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
export interface ProjectSnapshot { files: Record<string, string>; digest: string; version?: 2; objectDir?: string }
export interface ScanOptions { maxFiles?: number; maxManifestBytes?: number; signal?: AbortSignal }
export function projectCategory(name: string): 'source' | 'resource' | 'generated' | 'other' {
  if (/\.(uasset|umap|ubulk|uexp|png|jpg|fbx|blend|wav|pak)$/i.test(name)) return 'resource';
  if (/(^|\/)(Intermediate|Saved|Binaries|DerivedDataCache|TestBuild)(\/|$)/i.test(name)) return 'generated';
  return /\.(cpp|c|h|hpp|cs|ts|js|py|ini|uproject|uplugin|md)$/i.test(name) ? 'source' : 'other';
}
// Dependency caches and VCS metadata are not deliverable project files. We never
// traverse junctions or symlinks; a rejected path is reported, not silently copied.
export function projectFiles(root: string, options: ScanOptions = {}): string[] {
  for (const limit of [options.maxFiles, options.maxManifestBytes]) if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('Snapshot scan limits must be positive safe integers');
  const result: string[] = []; let manifestBytes = 0;
  function walk(relative: string): void {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      options.signal?.throwIfAborted();
      if (['.git', 'node_modules'].includes(entry.name)) continue;
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const info = lstatSync(path.join(root, name));
      if (info.isSymbolicLink() || info.nlink > 1 && info.isFile()) throw new Error(`Project symlink/junction/hardlink rejected: ${name}`);
      if (info.isDirectory()) walk(name);
      else if (info.isFile()) {
        manifestBytes += Buffer.byteLength(name) + 80;
        if (result.length >= (options.maxFiles ?? 1000000)) throw new Error(`Project snapshot file count limit exceeded: ${result.length + 1} files; path ${name}. Coverage incomplete; select a smaller project root or explicitly configure scan limits. No safety PASS is available.`);
        if (manifestBytes > (options.maxManifestBytes ?? 64 * 1024 * 1024)) throw new Error(`Project snapshot manifest capacity limit exceeded: ${manifestBytes} bytes; path ${name}. Coverage incomplete; select a smaller project root or explicitly configure scan limits. File content is streamed and is not subject to the former 100 MiB limit.`);
        result.push(name);
      }
      else throw new Error(`Unsupported project entry: ${name}`);
    }
  }
  walk(''); return result.sort();
}
// Full content hashes, never mtime-only reuse. Fixed memory even for UE assets.
export function hashFile(file: string, signal?: AbortSignal): string {
  const hash = createHash('sha256'); updateFileHash(hash, file, signal); return hash.digest('hex');
}
export function updateFileHash(hash: ReturnType<typeof createHash>, file: string, signal?: AbortSignal): void {
  const fd = openSync(file, 'r'), buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink > 1 || lstatSync(file).isSymbolicLink()) throw new Error(`Unsafe snapshot file: ${file}`);
    let length = 0, count: number;
    while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) { signal?.throwIfAborted(); hash.update(buffer.subarray(0, count)); length += count; }
    const after = fstatSync(fd), live = lstatSync(file);
    if (length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || live.ino !== after.ino || live.size !== after.size || live.mtimeMs !== after.mtimeMs || live.ctimeMs !== after.ctimeMs || live.isSymbolicLink()) throw new Error(`Project changed during snapshot: ${file}; coverage incomplete, retry after stopping writers`);
  } finally { closeSync(fd); }
}
export function projectFileHash(snapshot: ProjectSnapshot, name: string): string | null {
  const value = snapshot.files[name];
  return value === undefined ? null : snapshot.version === 2 ? value : hashBytes(Buffer.from(value, 'base64'));
}
export function projectFingerprint(snapshot: ProjectSnapshot): string {
  const files: Record<string, string> = Object.create(null);
  for (const name of Object.keys(snapshot.files).sort()) files[name] = projectFileHash(snapshot, name)!;
  return hashBytes(JSON.stringify(files));
}
export function readProject(root: string, signal?: AbortSignal, names?: string[]): ProjectSnapshot {
  const files: Record<string,string> = Object.create(null);
  for (const name of names ?? projectFiles(root, { signal })) {
    if (names && !existsSync(path.join(root,name))) continue; // Deleted Git index entries.
    files[name] = hashFile(projectTarget(root, name), signal);
  }
  return { version: 2, files, digest: hashBytes(JSON.stringify(files)) };
}
// Write bytes once per SHA-256 in the Run, outside the project. Later rounds
// retain only manifests and add newly changed content. No hardlinks to source.
export function captureProject(root: string, objectDir: string, signal?: AbortSignal, names?: string[]): ProjectSnapshot {
  const snapshot = readProject(root, signal, names); mkdirSync(objectDir, { recursive: true });
  for (const [name, hash] of Object.entries(snapshot.files)) {
    signal?.throwIfAborted(); const object = path.join(objectDir, hash);
    if (!existsSync(object)) {
      const temporary = path.join(objectDir, `${hash}.${randomUUID()}.tmp`);
      try {
        copyFileSync(projectTarget(root, name), temporary, constants.COPYFILE_EXCL);
        if (hashFile(temporary, signal) !== hash) throw new Error(`Project changed during snapshot backup: ${name}`);
        const fd=openSync(temporary,'r+'); try {fsyncSync(fd);} finally {closeSync(fd);}
        renameSync(temporary, object);
      }
      catch (error) { throw new Error(`Project snapshot backup capacity/write failure at ${name}: ${(error as Error).message}. Coverage incomplete; free runtime disk space or select a smaller project root.`); }
      finally { if (existsSync(temporary)) unlinkSync(temporary); }
    }
    if (hashFile(object, signal) !== hash) throw new Error(`Project snapshot backup fingerprint mismatch: ${name}`);
  }
  if (readProject(root, signal, names).digest !== snapshot.digest) throw new Error('Project changed during snapshot backup; retry after stopping writers');
  return { ...snapshot, objectDir: realpathSync(objectDir) };
}
export function projectBytes(snapshot: ProjectSnapshot, name: string): Buffer {
  if (snapshot.version !== 2) return Buffer.from(snapshot.files[name]!, 'base64');
  return readFileSync(projectObject(snapshot,name));
}
function projectObject(snapshot: ProjectSnapshot, name: string): string {
  const hash = snapshot.files[name];
  if (!snapshot.objectDir || !hash || !/^[0-9a-f]{64}$/.test(hash)) throw new Error(`Snapshot content unavailable: ${name}; fingerprint-only diagnostic cannot restore files`);
  const object = path.join(snapshot.objectDir, hash);
  if (hashFile(object) !== hash) throw new Error(`Snapshot backup fingerprint mismatch: ${name}`);
  return object;
}
export function inspectProject(root: string, options: ScanOptions = {}) {
  const files = projectFiles(root, options), categories: Record<string, { files: number; bytes: number }> = {};
  let bytes = 0;
  for (const name of files) { const size = lstatSync(path.join(root,name)).size, category = projectCategory(name); bytes += size; categories[category] ??= { files: 0, bytes: 0 }; categories[category]!.files++; categories[category]!.bytes += size; }
  return { root: realpathSync(root), fileCount: files.length, bytes, categories, excluded: ['.git', 'node_modules'], coverage: 'metadata inventory only; no content hashes, backup, or safety PASS', recommendation: 'Select the actual .uproject/source root. Writing runs retain full content fingerprints and require runtime disk space for unique content backups; generated files are included.' };
}
export function loadProject(file: string): ProjectSnapshot {
  const value = JSON.parse(readFileSync(file,'utf8')) as ProjectSnapshot;
  if (!value.files || hashBytes(JSON.stringify(value.files)) !== value.digest) throw new Error('Project snapshot fingerprint mismatch');
  if (value.version !== undefined && value.version !== 2 || value.version === 2 && Object.values(value.files).some(hash => !/^[0-9a-f]{64}$/.test(hash))) throw new Error('Unsupported project snapshot format');
  if (value.objectDir && realpathSync(value.objectDir) !== realpathSync(path.join(path.dirname(file),'snapshot-objects'))) throw new Error('Snapshot backup directory outside Run');
  return value;
}
export function copyProject(from: string, to: string, overlay = false): ProjectSnapshot {
  const baseline = readProject(from); mkdirSync(to,{recursive:true});
  if(overlay)for(const name of projectFiles(to))if(!Object.hasOwn(baseline.files,name))unlinkSync(projectTarget(to,name));
  for (const name of Object.keys(baseline.files)) { const target = projectTarget(to,name); mkdirSync(path.dirname(target),{recursive:true}); copyFileSync(projectTarget(from,name),target,overlay ? 0 : constants.COPYFILE_EXCL); }
  if (readProject(from).digest !== baseline.digest || readProject(to).digest !== baseline.digest) throw new Error('Project changed during preparation');
  return baseline;
}
export function fileStatus(before: ProjectSnapshot, after: ProjectSnapshot): string {
  return [...new Set([...Object.keys(before.files),...Object.keys(after.files)])].sort().filter(name => projectFileHash(before,name) !== projectFileHash(after,name)).map(name => `${before.files[name] === undefined ? 'A' : after.files[name] === undefined ? 'D' : 'M'} ${name}`).join('\n');
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
    if(readProject(state.source).digest!==projectFingerprint(expected)) throw new Error('Project recovery conflict: files changed since checkpoint');
    // Validate every required backup before any recovery write.
    for (const name of Object.keys(baseline.files)) if (projectFileHash(expected,name)!==projectFileHash(baseline,name) && baseline.version===2) projectObject(baseline,name);
    atomicJson(store.file(`recovery-backup-${Date.now()}.json`),expected);
    for(const name of new Set([...Object.keys(expected.files),...Object.keys(baseline.files)])) {
      if(projectFileHash(expected,name)===projectFileHash(baseline,name)) continue;
      const target=projectTarget(state.source,name);
      if(baseline.files[name]===undefined) unlinkSync(target);
      else {mkdirSync(path.dirname(target),{recursive:true});if(baseline.version===2)copyFileSync(path.join(baseline.objectDir!,baseline.files[name]!),target);else writeFileSync(target,projectBytes(baseline,name));}
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
