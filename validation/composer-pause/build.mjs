import {build} from '../../desktop/node_modules/esbuild/lib/main.js';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
await build({entryPoints:['validation/composer-pause/fixture.tsx'],nodePaths:['desktop/node_modules'],bundle:true,format:'esm',outfile:'validation/composer-pause/fixture.js',loader:{'.svg':'dataurl','.png':'dataurl'},define:{'process.env.NODE_ENV':'"production"'}});
fs.writeFileSync('validation/composer-pause/index.html','<!doctype html><meta charset="UTF-8"><link rel="stylesheet" href="fixture.css"><style>.conversation-row,.conversation-column,.conversation-row>.project-context.preview-sidebar{height:calc(100dvh - 28px)}</style><div id="root"></div><script type="module" src="fixture.js"></script>');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn('D:/PersonalAgent-worktrees/dev/desktop/node_modules/electron/dist/electron.exe',['validation/composer-pause/run.cjs'],{env,windowsHide:true,stdio:'inherit'});
child.once('exit',code=>{process.exitCode=code??1;});child.once('error',error=>{console.error(error);process.exitCode=1;});
