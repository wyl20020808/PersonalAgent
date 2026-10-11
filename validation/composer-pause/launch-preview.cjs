const {spawn}=require('node:child_process');
const path=require('node:path');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn('D:/PersonalAgent-worktrees/dev/desktop/node_modules/electron/dist/electron.exe',[path.join(__dirname,'preview.cjs')],{cwd:__dirname,env,windowsHide:true,detached:true,stdio:'ignore'});
child.unref();console.log('Independent preview PID: '+child.pid);
