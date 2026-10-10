import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DesktopService,validateRequest} from './service.js';
import {interactionPolicyContext,readInteractionPolicy} from '../../dist/src/interaction-policy.js';

const root=process.cwd().endsWith('desktop')?path.resolve('..'):process.cwd();
const data=fs.mkdtempSync(path.join('D:/','pa-mode-ui-'));
const file=path.join(data,'global-policy.json');
test.after(()=>fs.rmSync(data,{recursive:true,force:true}));
test('user mode IPC validates exact enum, shares policy across isolated instances, logs inline without dialogs',async()=>interactionPolicyContext.run(file,async()=>{
  for(const request of [{operation:'interactionMode',interactionMode:'invalid'},{operation:'interactionMode',interactionMode:'idle',runId:'extra'}])assert.throws(()=>validateRequest(request));
  const main=new DesktopService(root,path.join(data,'main'),process.execPath);
  const dev=new DesktopService(root,path.join(data,'dev'),process.execPath);
  assert.equal(main.overview().interactionPolicy?.mode,'work');
  await main.dispatch({operation:'interactionMode',interactionMode:'idle'});
  assert.equal(dev.overview().interactionPolicy?.mode,'idle');
  await dev.dispatch({operation:'interactionMode',interactionMode:'work'});
  assert.equal(readInteractionPolicy().mode,'work');
  assert.match(fs.readFileSync(path.join(data,'dev/user-actions.jsonl'),'utf8'),/interactionMode/);
  assert.notEqual(main.registryFile,dev.registryFile);
  assert.throws(()=>main.launch({load:()=>({config:{mode:'real'}})} as any,'mock'),/工作模式/);
  assert.equal(main.children.size,0);
}));
