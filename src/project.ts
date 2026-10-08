import { existsSync } from 'node:fs';
import path from 'node:path';
import { git } from './workspace.js';
export const projectCapabilities = { isolatedGit:true, isolatedFolder:true, directGit:true, directFolder:true } as const;
export async function projectHead(root:string):Promise<string> {
  if(!existsSync(path.join(root,'.git'))) return 'NO_GIT';
  try {return await git(root,['rev-parse','HEAD']);} catch {return 'unborn';}
}
