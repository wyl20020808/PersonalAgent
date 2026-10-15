import fs from 'node:fs';
import path from 'node:path';
import { assertD } from './store.js';
import { runtimeHome } from './platform-runtime.js';

export type InstanceId = 'main' | 'dev' | 'test';
export const sharedRuntime = runtimeHome();
export function instanceId(): InstanceId {
  const id = process.env.PERSONALAGENT_INSTANCE ?? 'main';
  if (id !== 'main' && id !== 'dev' && id !== 'test') throw new Error('PERSONALAGENT_INSTANCE must be main, dev or test');
  return id;
}
export function instanceData(root: string): string {
  const id = instanceId();
  const data = assertD(process.env.PERSONAL_AGENT_DESKTOP_DATA ?? (id === 'main' && process.platform === 'win32' ? path.join(root, '.desktop-data') : path.join(sharedRuntime, 'instances', id)));
  const main = process.platform === 'win32' ? 'D:/PersonalAgent/.desktop-data' : path.join(sharedRuntime, 'instances/main');
  if (id !== 'main' && path.resolve(data).toLowerCase() === path.resolve(main).toLowerCase()) throw new Error(`${id.toUpperCase()} cannot use historical MAIN data`);
  if (id === 'dev' && path.resolve(data).toLowerCase() === path.resolve('D:/PersonalAgent/.desktop-data').toLowerCase()) throw new Error('DEV cannot use historical MAIN data');
  if (id === 'test' && ['D:/PersonalAgent/.desktop-data',path.join(sharedRuntime,'instances/dev')].some(other=>path.resolve(other).toLowerCase()===path.resolve(data).toLowerCase())) throw new Error('TEST cannot use MAIN or DEV data');
  return data;
}
// Claim before Electron opens databases or caches. Existing MAIN data is preserved.
export function claimInstanceData(data: string): void {
  fs.mkdirSync(data, { recursive: true });
  const file = path.join(data, 'instance.json'), id = instanceId();
  try {
    const fd = fs.openSync(file, 'wx');
    try { fs.writeFileSync(fd, JSON.stringify({ version: 1, instanceId: id })); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const owner = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (owner.version !== 1 || owner.instanceId !== id) throw new Error('Runtime data belongs to another instance');
}
