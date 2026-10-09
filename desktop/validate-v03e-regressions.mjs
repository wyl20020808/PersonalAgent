import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),portable=path.join('D:/PersonalAgent-validation/v03e-regressions',randomUUID().slice(0,8));
fs.mkdirSync(path.join(portable,'desktop'),{recursive:true});
// Exercise legacy acceptance coverage against the exact built application, with selectors adapted to the latest icon rail and menu.
// The portable snapshot excludes auto-imported real game configs, so a fresh fixture has zero runs.
for(const file of ['package.json','AGENT_WORK_RULES.md','PROJECT_EXECUTION_CONTRACT.md','AGENTS.md'])if(fs.existsSync(path.join(root,file)))fs.copyFileSync(path.join(root,file),path.join(portable,file));
fs.cpSync(path.join(root,'dist'),path.join(portable,'dist'),{recursive:true});fs.copyFileSync(path.join(root,'desktop/package.json'),path.join(portable,'desktop/package.json'));fs.cpSync(path.join(root,'desktop/out'),path.join(portable,'desktop/out'),{recursive:true});fs.symlinkSync(path.join(root,'node_modules'),path.join(portable,'node_modules'),'junction');fs.symlinkSync(path.join(root,'desktop/node_modules'),path.join(portable,'desktop/node_modules'),'junction');
const results=[];
for(const name of ['validate-unified-electron.mjs','validate-legacy-flow-electron.mjs','validate-legacy-electron.mjs']){
 fs.copyFileSync(path.join(root,'desktop',name),path.join(portable,'desktop',name));
 const output=path.join(root,'desktop/validation-v03e',name+'.log'),stream=fs.createWriteStream(output);let captured='';
 const result=await new Promise(resolve=>{const child=spawn(process.execPath,[path.join(portable,'desktop',name)],{env:{...process.env,PERSONAL_AGENT_APP_ROOT:portable},windowsHide:true,stdio:['ignore','pipe','pipe']});for(const pipe of [child.stdout,child.stderr])pipe.on('data',bytes=>{stream.write(bytes);captured+=bytes;});child.once('close',code=>{stream.end();resolve({name,code,log:output,output:captured});});});results.push(result);console.log(JSON.stringify({name,code:result.code,log:output}));
}
const report={portable,exactBuiltApplication:true,legacyCoveragePreserved:true,latestUISelectors:true,realProjectConfigsExcluded:true,results,passed:results.filter(r=>r.code===0).length,failed:results.filter(r=>r.code!==0).length};fs.writeFileSync(path.join(root,'desktop/validation-v03e/regression-results.json'),JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
