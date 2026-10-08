import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { git } from '../src/workspace.js';
import { createRun } from '../src/controller.js';
import { RealAgents } from '../src/real-agents.js';
import type { Config } from '../src/schema.js';

const dir = path.resolve('.validation', `codex-${randomUUID()}`); mkdirSync(dir, { recursive: true });
const repo = path.join(dir, 'repo'); mkdirSync(repo); await git(repo, ['init']);
writeFileSync(path.join(repo, 'seed.txt'), 'seed\n'); await git(repo, ['add', '.']);
await git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'seed']);
const config: Config = { allowedRepositories: [repo], runtimeDir: path.resolve('.runtime'), mode: 'real', claudeExecutable: 'claude', timeoutMs: 120000, maxLoops: 1, maxReworks: 0, tests: [{ executable: process.execPath, args: ['-e', 'process.exit(0)'] }], mockScenario: 'pass' };
const store = await createRun(config, repo, 'Create hello.txt'); const state = store.load();
state.tasks = [{ id: 'hello', instruction: 'Create hello.txt containing hello followed by newline', acceptance: ['Content exactly hello followed by newline'] }];
try { const edits = await new RealAgents(config).execute(state, store, new AbortController().signal); console.log(JSON.stringify({ id: store.id, success: true, edits, threadId: state.codexThreadId })); }
catch (error) { console.error(JSON.stringify({ id: store.id, success: false, reason: (error as Error).message })); process.exitCode = 1; }
