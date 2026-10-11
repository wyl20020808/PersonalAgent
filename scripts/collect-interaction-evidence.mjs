import fs from 'node:fs';
import {createHash} from 'node:crypto';
const target='docs/evidence/global-work-idle';fs.mkdirSync(target,{recursive:true});
const records=[];
for(const [name,source,version] of [
  ['codex-cli-hook.json','D:/pa-gwi/bin-1791607626701/evidence.json','0.147.0'],
  ['codex-desktop-runtime-hook.json','D:/pa-gwi/9691020b546a15b2-1791607612172/evidence.json','0.162.0-alpha.2'],
  ['claude-hook.json','D:/pa-cc-policy-zImiZY/evidence.json',null],
  ['opencode-plugin.json','D:/pa-oc-policy-3b1gec/evidence.json',null],
]) {
  const bytes=fs.readFileSync(source),value=JSON.parse(bytes);
  fs.writeFileSync(`${target}/${name}`,JSON.stringify({...value,installedRuntimeVersion:version,sourceEvidence:source,sourceSha256:createHash('sha256').update(bytes).digest('hex')},null,2)+'\n');
  records.push({name,version,safeShell:value.safeShellExecuted??value.safeShell,desktopDeferred:value.probeBlocked??value.desktopDeferred,sourceEditVerified:value.sourceEditVerified,passed:value.passed,liveConfigModified:false});
}
function stats(file){const bytes=fs.readFileSync('validation/'+file),text=bytes.toString(bytes[0]===255&&bytes[1]===254?'utf16le':'utf8');return {file,tests:Number(text.match(/^# tests (\d+)/m)?.[1]??0),pass:Number(text.match(/^# pass (\d+)/m)?.[1]??0),fail:Number(text.match(/^# fail (\d+)/m)?.[1]??0),failed:[...text.matchAll(/^not ok \d+ - (.+)$/gm)].map(match=>match[1].trim())};}
const checks=['semantic-policy.log','semantic-desktop-final.log','semantic-cli-contract.log','semantic-full-final.log'].map(stats);
const baselineBytes=fs.readFileSync('validation/global-interaction-regression/dev-test.log'),baselineText=baselineBytes.toString(baselineBytes[0]===255&&baselineBytes[1]===254?'utf16le':'utf8');
const baselineFailures=new Set([...baselineText.matchAll(/^not ok \d+ - (.+)$/gm)].map(match=>match[1].trim()));
const stageFailures=checks.at(-1).failed;
const comparison={stageFailures:stageFailures.length,alsoFailedInDev:stageFailures.filter(name=>baselineFailures.has(name)).length,notInDev:stageFailures.filter(name=>!baselineFailures.has(name)),note:'整库为阶段性检查；最终操作策略及审批边界以独立专项为准。DEV 归档长路径增加基线失败，不据此宣称回归等价。'};
fs.writeFileSync(`${target}/verification-summary.json`,JSON.stringify({developmentBaseline:'dev@ddb098aedff7a40dc4a161f2e8eda8722bf32598',semanticCorrectionBaseline:'591388d',paidModelCalls:0,visibleGuiStarted:false,dangerousInteractionPerformed:false,records,checks,comparison},null,2)+'\n');
console.log(JSON.stringify({target,records},null,2));
