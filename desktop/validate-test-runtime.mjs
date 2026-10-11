import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DesktopService} from './out/service.js';
import {claimInstanceData,instanceId} from '../dist/src/instance-runtime.js';
const prior=process.env.PERSONALAGENT_INSTANCE;
const data=path.resolve('.validation/test-runtime-'+randomUUID());
try{
 process.env.PERSONALAGENT_INSTANCE='test';claimInstanceData(data);
 const service=new DesktopService(path.resolve('..'),data,process.execPath);
 assert.equal(instanceId(),'test');assert.equal(service.overview().paths.instanceId,'test');
 const config=(name,runtimeDir)=>{const file=path.join(data,name+'.json');fs.writeFileSync(file,JSON.stringify({allowedRepositories:[data],runtimeDir,mode:'mock',claudeExecutable:'unused',timeoutMs:30000,maxLoops:2,maxReworks:1,tests:[],mockScenario:'pass'}));return file;};
 service.register(config('own',path.join(data,'projects/a/runtimes')));
 const external=config('external',path.resolve('../.validation/external-runtime'));
 assert.throws(()=>service.register(external),/TEST writable Controller runtime/);
 assert.equal(service.register(external,true).profiles.some(profile=>profile.readOnly),true);
 const other=path.join(data,'other-instance');fs.mkdirSync(other);fs.writeFileSync(path.join(other,'instance.json'),JSON.stringify({version:1,instanceId:'dev'}));
 assert.throws(()=>service.register(config('other',path.join(other,'runs'))),/another instance/);
 console.log('PASS: TEST service identity, private writable runtime, cross-instance runtime rejected; no GUI or paid model calls.');
}finally{if(prior===undefined)delete process.env.PERSONALAGENT_INSTANCE;else process.env.PERSONALAGENT_INSTANCE=prior;}
