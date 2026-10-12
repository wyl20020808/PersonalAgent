// Isolated native smoke check. Does not launch Electron or change shared CLI settings.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import { streamingCodex } from '../dist/src/codex-live.js';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const root=path.resolve('.validation','model-context-live');fs.mkdirSync(root,{recursive:true});
const evidence=[];let thread;
for(let index=0;index<2;index++){
  const client=streamingCodex({compactBeforeTurn:index===1});
  const options={workingDirectory:root,sandboxMode:'read-only',approvalPolicy:'never',networkAccessEnabled:false,webSearchMode:'disabled'};
  const session=thread?client.resumeThread(thread,options):client.startThread(options);
  const {events}=await session.runStreamed('Return exactly OK. Do not use any tools, read or write files.',{signal:AbortSignal.timeout(90000)});
  for await(const e of events){
    if(e.type==='thread.started')thread=e.thread_id;
    if(e.type.startsWith('context.')){evidence.push({index,...e});console.log(JSON.stringify(e));}
    if(e.type==='turn.failed')throw Error(e.error.message);
  }
}
fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify({thread,evidence},null,2));
if(!evidence.some(e=>e.type==='context.usage'&&e.windowTokens>0&&e.usedTokens>=0)||!evidence.some(e=>e.type==='context.compaction'&&e.status==='compacted'))throw Error('Native context/compaction receipts missing');
console.log('Native context and same-Thread compaction verified.');
