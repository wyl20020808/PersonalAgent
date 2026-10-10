import fs from 'node:fs';
import {createHash} from 'node:crypto';
const target='docs/evidence/global-work-idle';
fs.mkdirSync(target,{recursive:true});
const records=[];
for(const [name,source,version] of [
  ['codex-cli-hook.json','D:/pa-gwi/bin-1791605278829/evidence.json','0.147.0'],
  ['codex-desktop-runtime-hook.json','D:/pa-gwi/9691020b546a15b2-1791605274619/evidence.json','0.162.0-alpha.2']
]){
  const bytes=fs.readFileSync(source),value=JSON.parse(bytes);
  const probeExecuted=value.events.some(event=>event.item?.type==='command_execution'&&event.item.aggregated_output?.includes('POLICY_HARMLESS_PROBE'));
  fs.writeFileSync(`${target}/${name}`,JSON.stringify({...value,installedRuntimeVersion:version,observedCoverage:value.probeBlocked?'verified-shell-block':probeExecuted?'not-enforced':'unverified',sourceEvidence:source,sourceSha256:createHash('sha256').update(bytes).digest('hex')},null,2)+'\n');
  records.push({name,version,probeExecuted,shellBlocked:value.probeBlocked,sourceEditVerified:value.sourceEditVerified,mockMcpBlocked:value.mockMcpBlocked,hookAudit:value.hookAudit??'',liveConfigModified:false});
}
function stats(file){const text=fs.readFileSync('validation/global-interaction-regression/'+file,'utf8');return {file,tests:Number(text.match(/^# tests (\d+)/m)?.[1]),pass:Number(text.match(/^# pass (\d+)/m)?.[1]),fail:Number(text.match(/^# fail (\d+)/m)?.[1]),failed:[...text.matchAll(/^not ok \d+ - (.+)$/gm)].map(match=>match[1])};}
fs.writeFileSync(`${target}/verification-summary.json`,JSON.stringify({baseline:'ddb098aedff7a40dc4a161f2e8eda8722bf32598',paidModelCalls:0,visibleGuiStarted:false,dangerousInteractionPerformed:false,records,checks:['policy-final.log','desktop-final.log','dev-desktop-test.log','feature-test.log','dev-test.log','dual-instance-final.log','agents-final.log'].map(stats)},null,2)+'\n');
console.log(JSON.stringify({target,records},null,2));
