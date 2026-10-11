import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const binary=fileURLToPath(new URL('../node_modules/electron/dist/electron.exe',import.meta.url)),env={...process.env};
if(!fs.existsSync(binary))throw Error('Installed Electron binary is missing');
delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(binary,[fileURLToPath(new URL('electron.cjs',import.meta.url))],{env,windowsHide:true,stdio:'inherit'});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
