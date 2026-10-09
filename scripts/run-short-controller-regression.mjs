import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Same compiled tests and assertions, copied byte-for-byte to a short disposable
// root. Preserve original long-path failure logs; do not change Git/user settings.
const source = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const concurrency = Number(process.env.PERSONAL_AGENT_TEST_CONCURRENCY ?? 2);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw Error('Test concurrency must be 1..4');
const target = process.platform === 'win32' ? `D:/pa2reg/${randomUUID().slice(0, 8)}` : path.join(source, '.validation', `short-${randomUUID().slice(0, 8)}`);
fs.mkdirSync(target, { recursive: true });
for (const relative of ['dist', 'src', 'test', 'scripts', 'schemas', 'docs', 'package.json', 'package-lock.json', 'tsconfig.json', 'AGENTS.md', 'CLAUDE.md', 'AGENT_WORK_RULES.md', 'PROJECT_EXECUTION_CONTRACT.md', '.gitignore', '.gitattributes']) if (fs.existsSync(path.join(source, relative))) fs.cpSync(path.join(source, relative), path.join(target, relative), { recursive: true, errorOnExist: true });
fs.symlinkSync(path.join(source, 'node_modules'), path.join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const tests = fs.readdirSync(path.join(target, 'dist/test')).filter(name => name.endsWith('.test.js')).sort();
const fingerprints = Object.fromEntries(tests.map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(target, 'dist/test', name))).digest('hex')]));
const output = path.join(source, 'validation/phase2/short-regression-manifest.json');
fs.writeFileSync(output, JSON.stringify({ source, target, tests, fingerprints, concurrency, note: '全部原断言，无跳过；仅缩短临时夹具根路径；每个测试 Run 内仍顺序调度' }, null, 2));
console.log(`Short regression root: ${target}`);
const result = spawnSync('rtk', ['proxy', process.execPath, '--test', `--test-concurrency=${concurrency}`, ...tests.map(name => `dist/test/${name}`)], { cwd: target, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
