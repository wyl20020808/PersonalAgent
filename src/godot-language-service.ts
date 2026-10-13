import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { parse } from 'yaml';
import { runProcess } from './process.js';

export interface GodotLanguageService { guidance: string; close(): Promise<void> }
const inactive = (guidance = ''): GodotLanguageService => ({ guidance, close: async () => {} });

export function godotLanguagePort(workspace: string, home = os.homedir()): number | null {
  if (!fs.existsSync(path.join(workspace, 'project.godot'))) return null;
  const file = path.join(workspace, '.serena', 'project.yml');
  if (!fs.existsSync(file)) return null;
  const project = parse(fs.readFileSync(file, 'utf8'));
  if (!(project.language_servers ?? project.languages ?? []).includes('gdscript')) return null;
  const globalFile = path.join(home, '.serena', 'serena_config.yml');
  const global = fs.existsSync(globalFile) ? parse(fs.readFileSync(globalFile, 'utf8')) : {};
  const port = project.ls_specific_settings?.gdscript?.port ?? global?.ls_specific_settings?.gdscript?.port ?? 6008;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid Serena GDScript port');
  return port;
}

export function findGodot(env: NodeJS.ProcessEnv): string | undefined {
  if (env.PERSONAL_AGENT_GODOT_EXECUTABLE) return env.PERSONAL_AGENT_GODOT_EXECUTABLE;
  const names = process.platform === 'win32' ? ['godot.exe', 'godot4.exe'] : ['godot', 'godot4'];
  const pathValue = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  for (const directory of pathValue.split(path.delimiter)) for (const name of names) {
    const file = path.join(directory, name); if (fs.existsSync(file)) return file;
  }
  // Existing local Windows tool installation; never download or install an engine.
  const directory = 'D:/Tools/Godot';
  if (process.platform === 'win32' && fs.existsSync(directory)) {
    for (const version of fs.readdirSync(directory).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
      const folder = path.join(directory, version); if (!fs.statSync(folder).isDirectory()) continue;
      const name = fs.readdirSync(folder).find(name => /^Godot_v4.*_win64_console\.exe$/i.test(name));
      if (name) return path.join(folder, name);
    }
  }
  return undefined;
}

async function listening(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (value: boolean) => { socket.destroy(); resolve(value); };
    socket.once('connect', () => done(true)); socket.once('error', () => done(false));
    socket.setTimeout(200, () => done(false));
  });
}

/** Own the headless editor only for this invocation. Never adopt or stop another editor. */
export async function startGodotLanguageService(workspace: string, env: NodeJS.ProcessEnv, signal?: AbortSignal, runner = runProcess): Promise<GodotLanguageService> {
  let port: number | null;
  try { port = godotLanguagePort(workspace); }
  catch (error) { return inactive(`Serena GDScript 配置读取失败：${String(error)}。使用聚焦文本读取继续，记录具体原因。`); }
  if (port === null) return inactive();
  const unavailable = (reason: string) => inactive(`Serena MCP 与 GDScript LSP 是两层服务。GDScript LSP 不可用：${reason}。不要把它报告为 GPT 或整个 Serena 不可用；使用聚焦文本读取继续。`);
  if (!/^\s*config_version\s*=\s*5\s*$/m.test(fs.readFileSync(path.join(workspace, 'project.godot'), 'utf8'))) {
    return unavailable('项目不是已确认的 Godot 4 配置；不自动启动其他版本引擎或转换项目');
  }
  const executable = findGodot(env);
  if (!executable) return unavailable('未找到 Godot 4；设置 PERSONAL_AGENT_GODOT_EXECUTABLE 或 PATH');
  const lock = path.join(os.tmpdir(), `personalagent-godot-lsp-${port}.lock`);
  const token = randomUUID();
  let descriptor: number;
  try { descriptor = fs.openSync(lock, 'wx'); }
  catch { return unavailable(`端口 ${port} 的服务锁已占用；不接管其他调用`); }
  const stop = new AbortController(); let running: Promise<unknown> | undefined;
  const abort = () => stop.abort(); signal?.addEventListener('abort', abort, { once: true });
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true; stop.abort();
    await running; signal?.removeEventListener('abort', abort);
    fs.closeSync(descriptor);
    // A replaced lease belongs to someone else, even if it uses the same path.
    try { if (JSON.parse(fs.readFileSync(lock, 'utf8')).token === token) fs.unlinkSync(lock); }
    catch { /* Keep an unconfirmed or externally removed lease untouched. */ }
  };
  try {
    fs.writeFileSync(descriptor, JSON.stringify({ token, pid: process.pid, workspace, port, startedAt: new Date().toISOString() }));
    signal?.throwIfAborted();
    if (await listening(port)) { await close(); return unavailable(`127.0.0.1:${port} 已由未知项目占用；不复用或终止该进程`); }
    let ended = false, diagnostic = '';
    running = runner(executable, ['--headless', '--editor', '--recovery-mode', '--path', workspace, '--lsp-port', String(port), '--max-fps', '10', '--log-file', path.join(os.tmpdir(), `personalagent-godot-lsp-${token}.log`)], {
      cwd: workspace, env, signal: stop.signal, timeoutMs: 0, streamOutput: true,
      interaction: { kind: 'shell', headless: true },
    }).then(result => { diagnostic = `Godot exited ${result.exitCode}: ${(result.stderr || result.stdout).slice(-500)}`; }, error => { diagnostic = String(error); }).finally(() => { ended = true; });
    const deadline = Date.now() + 30000;
    while (!ended && Date.now() < deadline) {
      signal?.throwIfAborted();
      if (await listening(port)) return { guidance: `已为当前项目启动受管理的 headless Godot GDScript LSP，127.0.0.1:${port}。调用 Serena initial_instructions、activate_project，再进行符号读取；工具实际结果才是可用性证据。此编辑器由调用管理，不要另起或终止它。`, close };
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await close(); return unavailable(diagnostic || `等待 127.0.0.1:${port} 超时`);
  } catch (error) { await close(); if (signal?.aborted) throw error; return unavailable(String(error)); }
}
