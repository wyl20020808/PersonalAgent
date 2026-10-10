import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { State } from './store.js';

function acceptanceFiles(state: Pick<State, 'config' | 'workspace'>, externalOnly: boolean): string[] {
  const files = new Set<string>();
  for (const test of state.config.tests) {
    const names = process.platform === 'win32' && !path.extname(test.executable) ? [test.executable, `${test.executable}.exe`] : [test.executable];
    const candidates = path.isAbsolute(test.executable) ? [test.executable] : /[\\/]/.test(test.executable) ? [path.resolve(state.workspace, test.executable)] : (process.env.PATH ?? '').split(path.delimiter).flatMap(dir => names.map(name => path.join(dir, name)));
    const executable = candidates.find(file => existsSync(file) && statSync(file).isFile());
    if (!executable) throw new Error('Acceptance executable cannot be fingerprinted');
    files.add(realpathSync(executable));
    for (const arg of test.args) {
      const file = path.resolve(state.workspace, arg);
      if (existsSync(file) && statSync(file).isFile()) files.add(realpathSync(file));
    }
  }
  for (const file of [...files].sort()) {
    if (externalOnly && file.toLowerCase().startsWith(`${state.workspace.toLowerCase()}${path.sep}`)) throw new Error('Delivery acceptance rules must be outside Agent workspace');
  }
  return [...files].sort();
}
// Preflight only resolves paths; it does not run tests or hash executables.
export function assertDeliveryAcceptanceRules(state: Pick<State, 'config' | 'workspace'>): void {
  acceptanceFiles(state, true);
}
export async function acceptanceRulesHash(state: State, externalOnly = false): Promise<string> {
  const digests = [];
  for (const file of acceptanceFiles(state, externalOnly)) {
    const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk);
    digests.push({ file, hash: hash.digest('hex') });
  }
  return createHash('sha256').update(JSON.stringify({ tests: state.config.tests, acceptanceStages: state.config.acceptanceStages, taskStages: state.config.taskStages, files: digests })).digest('hex');
}
