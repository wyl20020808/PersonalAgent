import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { godotLanguagePort, startGodotLanguageService } from '../src/godot-language-service.js';
import type { runProcess } from '../src/process.js';

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-godot-lsp-'));
  const server = net.createServer(socket => socket.end());
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  fs.writeFileSync(path.join(root, 'project.godot'), 'config_version=5\n');
  fs.mkdirSync(path.join(root, '.serena'));
  fs.writeFileSync(path.join(root, '.serena/project.yml'), `language_servers: [gdscript]\nls_specific_settings:\n  gdscript:\n    port: ${port}\n`);
  return { root, port, server, lock: path.join(os.tmpdir(), `personalagent-godot-lsp-${port}.lock`) };
}

test('GDScript prerequisites honor global/project ports and skip unrelated projects', async () => {
  const f = await fixture(), home = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-serena-home-'));
  fs.mkdirSync(path.join(home, '.serena'));
  fs.writeFileSync(path.join(home, '.serena/serena_config.yml'), 'ls_specific_settings:\n  gdscript:\n    port: 6219\n');
  try {
    assert.equal(godotLanguagePort(f.root, home), f.port);
    fs.writeFileSync(path.join(f.root, '.serena/project.yml'), 'language_servers: [gdscript]\n');
    assert.equal(godotLanguagePort(f.root, home), 6219);
    fs.writeFileSync(path.join(f.root, '.serena/project.yml'), 'languages: [gdscript]\nls_specific_settings:\n  gdscript:\n    port: 0\n');
    assert.throws(() => godotLanguagePort(f.root, home), /Invalid/);
    fs.writeFileSync(path.join(f.root, '.serena/project.yml'), 'language_servers: [typescript]\n');
    assert.equal(godotLanguagePort(f.root, home), null);
  } finally { fs.rmSync(f.root, { recursive: true }); fs.rmSync(home, { recursive: true }); }
});

test('owned headless LSP has exclusive lease, correct project and cleanup; competing calls cannot adopt it', async () => {
  const f = await fixture(); let stopped = false;
  const runner: typeof runProcess = async (_exe, args, options) => {
    assert.ok(args.includes('--headless')); assert.ok(args.includes('--recovery-mode'));
    assert.equal(args[args.indexOf('--path') + 1], f.root);
    assert.equal(args[args.indexOf('--lsp-port') + 1], String(f.port));
    assert.equal(options.interaction?.headless, true);
    await new Promise<void>(resolve => f.server.listen(f.port, '127.0.0.1', resolve));
    await new Promise<void>(resolve => options.signal!.addEventListener('abort', () => f.server.close(() => resolve()), { once: true }));
    stopped = true; return { exitCode: 0, stdout: '', stderr: '' };
  };
  const env = { PERSONAL_AGENT_GODOT_EXECUTABLE: process.execPath };
  const service = await startGodotLanguageService(f.root, env, undefined, runner);
  try {
    assert.match(service.guidance, /已为当前项目启动/); assert.ok(fs.existsSync(f.lock));
    const other = await startGodotLanguageService(f.root, env, undefined, runner);
    assert.match(other.guidance, /服务锁已占用/); await other.close();
    assert.ok(fs.existsSync(f.lock)); assert.equal(stopped, false);
  } finally { await service.close(); await service.close(); fs.rmSync(f.root, { recursive: true }); }
  assert.equal(stopped, true); assert.equal(fs.existsSync(f.lock), false);
});

test('unknown listener is preserved and engine startup failure releases only owned lease', async () => {
  const f = await fixture(), env = { PERSONAL_AGENT_GODOT_EXECUTABLE: process.execPath };
  await new Promise<void>(resolve => f.server.listen(f.port, '127.0.0.1', resolve));
  try {
    const service = await startGodotLanguageService(f.root, env, undefined, async () => { throw Error('must not spawn'); });
    assert.match(service.guidance, /未知项目占用/); await service.close();
    assert.equal(f.server.listening, true); assert.equal(fs.existsSync(f.lock), false);
  } finally { await new Promise<void>(resolve => f.server.close(() => resolve())); }
  const failed = await startGodotLanguageService(f.root, env, undefined, async () => { throw Error('engine missing'); });
  assert.match(failed.guidance, /engine missing/); assert.equal(fs.existsSync(f.lock), false);
  const stop = new AbortController(); stop.abort();
  await assert.rejects(startGodotLanguageService(f.root, env, stop.signal), /abort/i);
  assert.equal(fs.existsSync(f.lock), false);
  fs.writeFileSync(path.join(f.root, 'project.godot'), 'config_version=4\n');
  const older = await startGodotLanguageService(f.root, env, undefined, async () => { throw Error('must not convert'); });
  assert.match(older.guidance, /不是已确认的 Godot 4/);
  fs.rmSync(f.root, { recursive: true });
});

test('abort after readiness stops owned editor; cleanup preserves a replaced lease', async () => {
  const f = await fixture(), stop = new AbortController(); let stopped = false;
  const runner: typeof runProcess = async (_exe, _args, options) => {
    await new Promise<void>(resolve => f.server.listen(f.port, '127.0.0.1', resolve));
    await new Promise<void>(resolve => options.signal!.addEventListener('abort', () => f.server.close(() => resolve()), { once: true }));
    stopped = true; return { exitCode: 0, stdout: '', stderr: '' };
  };
  const service = await startGodotLanguageService(f.root, { PERSONAL_AGENT_GODOT_EXECUTABLE: process.execPath }, stop.signal, runner);
  fs.writeFileSync(f.lock, JSON.stringify({ token: 'other-owner' }));
  stop.abort(); await service.close();
  assert.equal(stopped, true); assert.deepEqual(JSON.parse(fs.readFileSync(f.lock, 'utf8')), { token: 'other-owner' });
  // The fixture owns this replacement; production cleanup deliberately left it alone.
  fs.unlinkSync(f.lock); fs.rmSync(f.root, { recursive: true });
});
