// Preparation only: never writes to the user's live Codex home.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { interactionAgentRules, globalPolicyFile } from '../dist/src/interaction-policy.js';
const root=process.cwd(),live='C:/Users/WYL20/.codex';
const stage=path.resolve(process.argv[2]??'validation/codex-install-stage');
if(stage.toLowerCase().startsWith(live.toLowerCase()))throw Error('Staging must be outside live Codex home');
fs.mkdirSync(stage,{recursive:true});
const originals={};
for(const name of ['AGENTS.md','hooks.json','config.toml']) {
  const file=path.join(live,name),bytes=fs.existsSync(file)?fs.readFileSync(file):null;
  originals[name]={exists:bytes!==null,sha256:bytes?createHash('sha256').update(bytes).digest('hex'):null};
  if(bytes) fs.writeFileSync(path.join(stage,name+'.backup'),bytes,{flag:'wx'});
}
const require=createRequire(path.join(root,'desktop/package.json'));
await require('esbuild').build({entryPoints:[path.join(root,'scripts/codex-interaction-hook.ts')],outfile:path.join(stage,'interaction-hook.mjs'),platform:'node',format:'esm',bundle:true,banner:{js:"import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"}});
const old=fs.readFileSync(path.join(live,'AGENTS.md'),'utf8');
fs.writeFileSync(path.join(stage,'AGENTS.md'),old+'\n\n## Global Work / Idle Mode V1\n'+interactionAgentRules+'\n');
const previous=fs.existsSync(path.join(live,'hooks.json'))?JSON.parse(fs.readFileSync(path.join(live,'hooks.json'),'utf8')):{};
const installedScript=path.join(live,'interaction-policy','interaction-hook.mjs');
const hook={hooks:[{type:'command',command:`& "${process.execPath}" "${installedScript}"`,timeout:5}]};
const hooks={...previous,hooks:{...previous.hooks,PreToolUse:[...(previous.hooks?.PreToolUse??[]),hook]}};
fs.writeFileSync(path.join(stage,'hooks.json'),JSON.stringify(hooks,null,2)+'\n');
fs.writeFileSync(path.join(stage,'manifest.json'),JSON.stringify({version:1,preparedAt:new Date().toISOString(),live,globalPolicyFile,originals,installationAuthorized:false,installationCompleted:false,hookRuntimeProtectionVerified:false,isolatedCoverage:{safeShell:true,desktopShellDefer:true,cliSourcePatch:true,desktopSourcePatch:false,mcp:false,codeMode:false},steps:['核对 manifest 中的原文件哈希，变化时重新准备。','获得针对全局安装的明确授权，暂停当前 Codex 会话并保存历史。','将 backup 文件另存到用户认可的备份目录，记录缺失文件。','复制 interaction-hook.mjs 到 ~/.codex/interaction-policy/，保留全局 config.toml 原样。','将审查后的 AGENTS.md 和合并后的 hooks.json 原子替换到用户目录。','由用户信任精确 Hook 定义，重启 CLI/Desktop；使用 hooks/list 验证 enabled/trusted。','先运行无害探针；隔离 Shell 已验证，live 配置、专用工具及既有会话仍须逐项核查，不能把 trusted 状态当作全面通过。','需要更强保证时使用 Windows 进程隔离；模型和安全 Shell 持续运行；未覆盖桌面工具只延后具体操作，不能停止整个 Codex。'],rollback:['停止本次安装创建的受管理进程；不终止用户应用。','按哈希核对安装文件尚未被用户修改，变化时停止并人工处理。','从备份恢复 AGENTS.md/hooks.json/config.toml；原本缺失的文件只移除本次新建文件。','移除仅本次安装创建的 interaction-policy 目录；保留 Run、Session、全局模式状态及其他 Hooks。','重启用户选择的 Codex 会话并复核原配置和原 Hooks。']},null,2)+'\n');
console.log(JSON.stringify({stage,liveModified:false,originals},null,2));
