import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function runtimeHome(platform: NodeJS.Platform = process.platform, home = os.homedir()): string {
  return platform === 'win32' ? 'D:/PersonalAgent-data' : platform === 'darwin' ? path.posix.join(home, 'Library/Application Support/PersonalAgent') : path.posix.join(home, '.local/share/PersonalAgent');
}

// Finder does not inherit interactive shell startup files. Do not execute them.
export function desktopPath(current = process.env.PATH ?? '', platform: NodeJS.Platform = process.platform, home = os.homedir()): string {
  if (platform === 'win32') return current;
  return [...new Set([...current.split(':'), ...['.local/bin', '.opencode/bin', '.cargo/bin'].map(dir => path.posix.join(home, dir)), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].filter(Boolean))].join(':');
}

export function findExecutable(name: string, search = process.env.PATH ?? '', platform: NodeJS.Platform = process.platform): string | undefined {
  const names = platform === 'win32' && !path.extname(name) ? [name + '.exe', name] : [name];
  for (const dir of search.split(platform === 'win32' ? ';' : ':').filter(Boolean)) for (const file of names) {
    const candidate = path.join(dir, file);
    try { fs.accessSync(candidate, platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK); if (fs.statSync(candidate).isFile()) return candidate; } catch { /* Try the next installation. */ }
  }
  return undefined;
}

export function desktopNode(root: string): string {
  const bundled = path.resolve(root, '../node/bin/node');
  const candidate = process.env.PERSONAL_AGENT_NODE_EXECUTABLE ?? (process.platform === 'win32' ? 'C:/Program Files/nodejs/node.exe' : fs.existsSync(bundled) ? bundled : findExecutable('node'));
  if (!candidate || !path.isAbsolute(candidate) || !fs.existsSync(candidate)) throw Error('Node.js 22+ required; install Node or set PERSONAL_AGENT_NODE_EXECUTABLE to its absolute path');
  return candidate;
}

export function claudeExecutable(): string {
  return process.env.PERSONAL_AGENT_CLAUDE_EXECUTABLE ?? (process.platform === 'win32' ? 'C:/Users/WYL20/.local/bin/claude.exe' : findExecutable('claude') ?? 'claude');
}

export function npmCli(node: string): string {
  const candidates = [path.join(path.dirname(node), 'node_modules/npm/bin/npm-cli.js'), path.resolve(path.dirname(node), '../lib/node_modules/npm/bin/npm-cli.js')];
  const npm = findExecutable('npm');
  if (npm) { try { const real = fs.realpathSync(npm); if (real.endsWith('npm-cli.js')) candidates.push(real); } catch { /* Report below. */ } }
  const cli = candidates.find(file => fs.existsSync(file));
  if (!cli) throw Error('未找到本机 npm CLI；请安装包含 npm 的 Node.js');
  return cli;
}
