import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runProcess } from '../src/process.js';

const dir = path.resolve('.validation', `v02a-regression-${randomUUID()}`); mkdirSync(dir, { recursive: true });
const tests = readdirSync(path.resolve('dist/test')).filter(file => file.endsWith('.test.js')).map(file => path.resolve('dist/test', file));
const result = await runProcess(process.execPath, ['--test', ...tests], { cwd: path.resolve('.'), timeoutMs: 180000 });
writeFileSync(path.join(dir, 'regression.tap'), result.stdout); writeFileSync(path.join(dir, 'stderr.txt'), result.stderr);
const count = (name: string) => Number(result.stdout.match(new RegExp(`# ${name} (\\d+)`))?.[1] ?? -1);
const summary = { exitCode: result.exitCode, tests: count('tests'), pass: count('pass'), fail: count('fail'), skipped: count('skipped'), realClaudeCalls: 0, realCodexCalls: 0, log: path.join(dir, 'regression.tap'), stderr: path.join(dir, 'stderr.txt') };
writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary)); process.exitCode = result.exitCode;
