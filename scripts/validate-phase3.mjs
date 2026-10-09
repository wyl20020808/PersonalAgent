import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const source = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const phase = process.argv[2] ?? 'controller-short';
const evidence = path.join(source, 'validation/phase3'); fs.mkdirSync(evidence, { recursive: true });
const stamp = Date.now(), logFile = path.join(evidence, `${phase}-${stamp}.log`), log = fs.openSync(logFile, 'wx');
let cwd = source, args;
if (phase === 'controller-short') {
  cwd = process.platform === 'win32' ? `D:/pa3reg/${randomUUID().slice(0, 8)}` : path.join(source, '.validation', `short-${randomUUID()}`);
  fs.mkdirSync(cwd, { recursive: true });
  for (const relative of ['dist', 'src', 'test', 'scripts', 'schemas', 'docs', 'package.json', 'package-lock.json', 'tsconfig.json', 'AGENTS.md', 'CLAUDE.md', 'AGENT_WORK_RULES.md', 'PROJECT_EXECUTION_CONTRACT.md', '.gitignore', '.gitattributes']) if (fs.existsSync(path.join(source, relative))) fs.cpSync(path.join(source, relative), path.join(cwd, relative), { recursive: true, errorOnExist: true });
  fs.symlinkSync(path.join(source, 'node_modules'), path.join(cwd, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const tests = fs.readdirSync(path.join(cwd, 'dist/test')).filter(name => name.endsWith('.test.js')).sort();
  const fingerprints = Object.fromEntries(tests.map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(cwd, 'dist/test', name))).digest('hex')]));
  fs.writeFileSync(path.join(evidence, `short-manifest-${stamp}.json`), JSON.stringify({ source, cwd, tests, fingerprints, note: '原编译测试和断言逐字复制；仅缩短夹具目录，限制独立测试文件并发为2；不修改Git配置，不删除原始失败日志。' }, null, 2), { flag: 'wx' });
  args = ['proxy', process.execPath, '--test', '--test-concurrency=2', ...tests.map(name => `dist/test/${name}`)];
} else if (phase === 'desktop-test') {
  cwd = path.join(source, 'desktop'); args = ['proxy', process.execPath, '--test', '--test-concurrency=1', 'out/service.test.js', 'out/thread.test.js', 'out/unified.test.js', 'out/sessions.test.js'];
} else if (phase === 'controller-full') args = ['proxy', process.execPath, '--test', '--test-concurrency=2', ...fs.readdirSync(path.join(source, 'dist/test')).filter(name => name.endsWith('.test.js')).map(name => `dist/test/${name}`)];
else throw Error('Unknown deterministic validation phase');
console.log(JSON.stringify({ phase, cwd, logFile }));
const child = spawn('rtk', args, { cwd, windowsHide: true, stdio: ['ignore', log, log] });
child.once('error', error => { fs.closeSync(log); console.error(error); process.exitCode = 1; });
child.once('close', code => { fs.closeSync(log); console.log(JSON.stringify({ phase, code, logFile })); process.exitCode = code ?? 1; });
