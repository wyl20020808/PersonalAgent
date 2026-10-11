import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DesktopService} from './out/service.js';
const root=path.resolve('..'),data=path.join(root,'.v3c3','discussion-native-'+randomUUID()),project=path.join(data,'project');
fs.mkdirSync(project,{recursive:true});fs.writeFileSync(path.join(project,'user.txt'),'native-stream-validation-42\n');
const service=new DesktopService(root,data,'C:/Program Files/nodejs/node.exe');
let launches=0;service.launch=()=>{launches++;};
const session=await service.dispatch({operation:'createSession',projectPath:project,chatMode:'discuss',mode:'real',decisionAgent:{backend:'claude-code',model:'sonnet'},executionAgent:{backend:'codex'}});
const start=Date.now();const ack=await service.dispatch({operation:'sendSession',sessionId:session.id,messageId:randomUUID(),text:'请用 Read 工具查看 user.txt，报告文件中的标识。回复包含一个两列表格和行内公式 $x^2$。只讨论，不修改文件，不执行方案。'});
const acknowledgedMs=Date.now()-start;assert.equal(ack.messages[0].status,'starting');
const samples=[];let detail;
for(let n=0;n<1200;n++){
 detail=service.sessions.detail(session.id);const message=detail.session.messages[0];
 const sample={ms:Date.now()-start,status:message.status,draftLength:message.discussionDraft?.length??0,tools:detail.discussionMessages.filter(m=>m.kind==='tool').length};
 if(!samples.length||JSON.stringify({...sample,ms:0})!==JSON.stringify({...samples.at(-1),ms:0})){samples.push(sample);console.log(JSON.stringify(sample));}
 if(['recorded','failed'].includes(message.status))break;
 await new Promise(resolve=>setTimeout(resolve,250));
}
if(detail.session.messages[0].status==='starting')await service.stopOwned();
const result={data,acknowledgedMs,completedMs:Date.now()-start,samples,reply:detail.session.messages[0].discussionReply,error:detail.session.messages[0].error,tools:detail.discussionMessages,launches};
fs.writeFileSync(path.join(data,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({data,acknowledgedMs,completedMs:result.completedMs,launches}));
assert.equal(detail.session.messages[0].status,'recorded',result.error);assert.ok(samples.some(s=>s.status==='starting'&&s.draftLength>0));assert.ok(samples.some(s=>s.status==='starting'&&s.tools>0));assert.ok(acknowledgedMs<2000);assert.equal(launches,0);assert.equal(fs.readFileSync(path.join(project,'user.txt'),'utf8'),'native-stream-validation-42\n');
await service.stopOwned();
