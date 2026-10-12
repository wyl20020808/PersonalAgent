import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {assertD} from '../../dist/src/store.js';

/** Display grouping never changes Controller authorization or execution locks. */
export function validateParallelProject(projectPath:string,projectGroupPath:string):string {
 const task=fs.realpathSync(assertD(projectPath)),group=fs.realpathSync(assertD(projectGroupPath));
 if(task.toLowerCase()===group.toLowerCase())throw Error('并行会话必须使用不同的独立 Git 工作树');
 const git=(cwd:string,args:string[])=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
 try {
  for(const root of [task,group])if(fs.realpathSync(git(root,['rev-parse','--show-toplevel'])).toLowerCase()!==root.toLowerCase())throw Error('必须选择 Git 工作树根目录');
  const common=(root:string)=>fs.realpathSync(git(root,['rev-parse','--path-format=absolute','--git-common-dir'])).toLowerCase();
  if(common(task)!==common(group))throw Error('所选工作树不属于此项目');
  if(!fs.lstatSync(path.join(task,'.git')).isFile())throw Error('并行会话必须绑定独立的 Git 工作树');
  const worktrees=git(group,['worktree','list','--porcelain']).split('\n').filter(line=>line.startsWith('worktree ')).map(line=>path.resolve(line.slice(9).trim()).toLowerCase());
  if(!worktrees.includes(task.toLowerCase()))throw Error('工作树尚未注册');
 }catch(error){throw Error('无法绑定并行工作树：'+(error as Error).message);}
 return group;
}
