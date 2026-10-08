import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import path from 'node:path';
import { assertD } from '../src/store.js';
import { runProcess } from '../src/process.js';

// Explicit migration of existing local CLI login; never prints credential content.
const runtime = assertD(process.argv[2] ?? path.resolve('.runtime'));
mkdirSync(runtime, { recursive: true });
if (process.platform === 'win32') {
  const result = await runProcess('icacls.exe', [runtime, '/inheritance:r', '/grant:r', `${userInfo().username}:(OI)(CI)F`], { cwd: runtime, timeoutMs: 10000 });
  if (result.exitCode !== 0) throw new Error('Could not restrict runtime ACL; credentials were not copied');
}
for (const [source, target] of [[path.join(homedir(), '.codex', 'auth.json'), path.join(runtime, 'codex', 'auth.json')], [path.join(homedir(), '.claude', '.credentials.json'), path.join(runtime, 'claude', '.credentials.json')]]) {
  if (!source || !target || !existsSync(source)) continue;
  mkdirSync(path.dirname(target), { recursive: true });
  if (existsSync(target)) { console.log(`Existing login kept: ${target}`); continue; }
  copyFileSync(source, target); console.log(`Local login copied to protected D drive directory: ${target}`);
}
