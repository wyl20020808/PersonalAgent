import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

process.chdir(fileURLToPath(new URL('.', import.meta.url)));
fs.mkdirSync('.validation/p3a-static', { recursive: true });
await build({ entryPoints: ['src/AgentRoleBoard.tsx', 'src/DecisionAgentSelect.tsx'], outdir: '.validation/p3a-static', platform: 'node', format: 'esm', bundle: true, packages: 'external', loader: { '.css': 'empty' } });
const Board = (await import(pathToFileURL(path.resolve('.validation/p3a-static/AgentRoleBoard.js')).href)).default;
const Select = (await import(pathToFileURL(path.resolve('.validation/p3a-static/DecisionAgentSelect.js')).href)).default;
const noop = () => {};
const value = { backend: 'codex', model: 'fixture-decision-model' };
const board = renderToStaticMarkup(React.createElement(Board, { value, onChange: noop, onValid: noop }));
assert.equal((board.match(/class="agent-pool /g) ?? []).length, 2);
assert.match(board, /aria-label="决策池 Codex" aria-pressed="true"(?! disabled)/);
assert.match(board, /aria-label="执行池 Codex" aria-pressed="true"(?! disabled)/);
assert.equal((board.match(/fixture-decision-model/g) ?? []).length, 1); // executor model remains SDK default
assert.match(board, /assets\/agents\/openai.svg/);
const select = renderToStaticMarkup(React.createElement(Select, { value, onChange: noop, onValid: noop }));
assert.match(select, /aria-label="Codex Decision Model"/); assert.match(select, /value="fixture-decision-model"/);
assert.match(select, /<option value="codex" selected="">Codex<\/option>/);
const dual = renderToStaticMarkup(React.createElement(Board, { value, discussion: { participants: [{ id: 'a', agent: value }, { id: 'b', agent: { backend: 'codex', model: 'fixture-second' } }], primary: 'b', rounds: 1 }, onDiscussion: noop, onChange: noop, onValid: noop }));
assert.match(dual, /value="fixture-second"/); assert.match(dual, /aria-label="主决策者"/);
assert.match(dual, /<option value="b" selected="">决策者 B<\/option>/);
fs.writeFileSync('.validation/p3a-static/result.json', JSON.stringify({ passed: true, rendering: 'React static server rendering; no browser/Electron/window', checks: ['two existing pools', 'Codex enabled in decision pool', 'one Codex executor', 'separate model display', 'official icon', 'dual Codex B model', 'primary B selection'] }, null, 2));
console.log('P3A React static UI checks passed; no browser or window launched.');
