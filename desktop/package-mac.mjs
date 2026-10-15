// Reproducible native macOS trial. No credentials, Run data, or source workspace included.
import fs from 'node:fs/promises';
import path from 'node:path';
import {npmCli} from '../dist/src/platform-runtime.js';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {packager} from '@electron/packager';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.platform!=='darwin')throw Error('Build on a native Mac; do not copy Windows dependencies');
const output=path.resolve(process.env.PERSONAL_AGENT_PACKAGE_OUTPUT??path.join(root,'../packages'));
const scratch=await fs.mkdtemp(path.join(root,'../personalagent-package-'));
const stage=path.join(scratch,'app');
const run=(file,args,cwd=root)=>execFileSync(file,args,{cwd,stdio:'inherit'});
try{
 await fs.mkdir(stage,{recursive:true});
 const metadata=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const desktop=JSON.parse(await fs.readFile(path.join(root,'desktop/package.json'),'utf8'));
 const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const dirty=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim();
 if(dirty)throw Error('Commit source before packaging so build provenance is exact');
 await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({...metadata,version:desktop.version,main:'desktop/out/main.js',personalAgentInstance:'test',personalAgentBuild:{commit,baseline:'cd178cb99250192b06996c2c39d33c31fda834bc',platform:process.platform,arch:process.arch},scripts:{}},null,2));
 await fs.copyFile(path.join(root,'package-lock.json'),path.join(stage,'package-lock.json'));
 for(const directory of ['dist/src','dist/scripts','desktop/out','docs'])await fs.cp(path.join(root,directory),path.join(stage,directory),{recursive:true});
 // Root native Agent dependencies only; no renderer build dependencies or tests.
 run(process.execPath,[npmCli(process.execPath),'ci','--omit=dev','--cache',path.join(root,'../npm-cache')],stage);
 const nodeRoot=path.join(scratch,'node');await fs.mkdir(path.join(nodeRoot,'bin'),{recursive:true});
 await fs.copyFile(process.execPath,path.join(nodeRoot,'bin/node'));await fs.chmod(path.join(nodeRoot,'bin/node'),0o755);
 // Project npm checks must also work when Finder has no Node/npm on PATH.
 const npmRoot=path.resolve(npmCli(process.execPath),'../..');
 await fs.cp(npmRoot,path.join(nodeRoot,'lib/node_modules/npm'),{recursive:true});
 // extraResource copying can absolutize symlinks. Relocatable wrappers keep all
 // resolution inside the bundle after moving it out of the build directory.
 for(const [name,entry] of [['npm','npm-cli.js'],['npx','npx-cli.js']]){
  await fs.writeFile(path.join(nodeRoot,'bin',name),`#!/bin/sh\nexec "$(dirname "$0")/node" "$(dirname "$0")/../lib/node_modules/npm/bin/${entry}" "$@"\n`,{mode:0o755});
 }
 await fs.mkdir(output,{recursive:true});
 const electronCache=path.join(root,'../electron-cache'),zipName=`electron-v${desktop.devDependencies.electron}-darwin-${process.arch}.zip`;
 const checksums=JSON.parse(await fs.readFile(path.join(root,'desktop/node_modules/electron/checksums.json'),'utf8'));
 let electronZipDir;
 for(const entry of await fs.readdir(electronCache).catch(()=>[])){
  const directory=path.join(electronCache,entry);
  try{const digest=createHash('sha256').update(await fs.readFile(path.join(directory,zipName))).digest('hex');if(digest===checksums[zipName]){electronZipDir=directory;break;}}catch{/* Use the normal verified download when no matching cache exists. */}
 }
 const apps=await packager({dir:stage,out:scratch,name:'PersonalAgent DEV Trial',platform:'darwin',arch:process.arch,electronVersion:desktop.devDependencies.electron,appBundleId:'io.personalagent.devtrial',appVersion:desktop.version,asar:false,prune:false,extraResource:[nodeRoot],electronZipDir,download:{cacheRoot:electronCache},osxSign:{identity:'-',identityValidation:false,hardenedRuntime:false},overwrite:false});
 const app=path.join(output,'PersonalAgent DEV Trial.app');
 try{await fs.access(app);throw Error('Output app already exists; choose a fresh output directory');}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.rename(path.join(apps[0],'PersonalAgent DEV Trial.app'),app);
 run('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',app]);
 const archive=path.join(output,`PersonalAgent-DEV-Trial-${process.arch}.zip`);
 run('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',app,archive]);
 const hash=createHash('sha256').update(await fs.readFile(archive)).digest('hex');
 await fs.writeFile(path.join(output,'build-manifest.json'),JSON.stringify({commit,baseline:'cd178cb99250192b06996c2c39d33c31fda834bc',platform:process.platform,arch:process.arch,node:process.version,electron:desktop.devDependencies.electron,app,archive,sha256:hash,signature:'ad-hoc',notarized:false,date:new Date().toISOString()},null,2)+'\n');
 console.log(JSON.stringify({app,archive,sha256:hash}));
}finally{await fs.rm(scratch,{recursive:true,force:true});}
