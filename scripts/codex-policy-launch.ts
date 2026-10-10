import path from 'node:path';
import { runProcess } from '../src/process.js';
// Optional managed standalone CLI entry. Arbitrary Desktop starts are not covered.
// Uses exec only, hidden process, existing user configuration and original instructions.
const [executable, workspace, ...args] = process.argv.slice(2);
try {
  if (!executable || !workspace || !path.isAbsolute(executable) || !path.isAbsolute(workspace)) throw Error('Absolute Codex executable and workspace required');
  const result = await runProcess(executable, ['exec', ...args], { cwd: workspace, env: { ...process.env }, interaction: { kind: 'model' }, timeoutMs: 60 * 60 * 1000, streamOutput: true, onLine: line => process.stdout.write(line + '\n') });
  process.stderr.write(result.stderr); process.exitCode = result.exitCode;
} catch (error) { process.stderr.write((error as Error).message + '\n'); process.exitCode = 1; }
