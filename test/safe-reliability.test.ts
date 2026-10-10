import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createRun} from '../src/controller.js';
import {Store,type State} from '../src/store.js';
import {lockProject} from '../src/project-files.js';
import {FlowError} from '../src/failure.js';
import type {Config} from '../src/schema.js';
import {hashBytes} from '../src/project-files.js';
import {assertDeliveryAcceptanceRules} from '../src/rules.js';

const root=path.resolve('.validation',`safe-reliability-${randomUUID()}`);
fs.mkdirSync(root,{recursive:true});
function config(source:string,name:string):Config {
  return {mode:'mock',executionMode:'native',projectMode:'direct',directAuthorization:{projectPath:source,acknowledgedAt:new Date().toISOString()},runtimeDir:path.join(root,name),allowedRepositories:[source],claudeExecutable:'NEVER-LAUNCH',timeoutMs:1000,maxLoops:1,maxReworks:0,tests:[],mockScenario:'pass'};
}
async function failedStart(c:Config,source:string,pattern:RegExp) {
  let failure:FlowError|undefined;
  await assert.rejects(createRun(c,source,'local initialization fixture'),error=>{
    assert.ok(error instanceof FlowError);assert.match(error.message,pattern);assert.ok(error.runId);failure=error;return true;
  });
  const store=new Store(c.runtimeDir,failure!.runId!);
  const state=store.load();
  assert.equal(state.phase,'failed');assert.equal(state.failure?.stage,'prepare');assert.equal(state.source,source);
  assert.equal(state.claudeCalls,0);assert.match(fs.readFileSync(store.file('audit.jsonl'),'utf8'),/"event":"error"/);
}
test('missing project initialization persists a readable failure with Run ID',async()=>{
  const source=path.join(root,'missing-project');
  await failedStart(config(source,'missing-runtime'),source,/ENOENT/);
});
test('project lock collision persists a failure and leaves active owner untouched',async()=>{
  const source=path.join(root,'locked-project');fs.mkdirSync(source);
  const c=config(source,'lock-runtime');
  const release=lockProject({source,config:c,id:randomUUID()} as State);
  try {
    await failedStart(c,fs.realpathSync(source),/already running/);
    assert.throws(()=>lockProject({source,config:c} as State),/already running/);
  } finally {release();}
});
test('audit tail preserves hash chain across long UTF-8 records and separate Store instances',()=>{
  const runtime=path.join(root,'audit-runtime'),id=randomUUID();
  const first=new Store(runtime,id),second=new Store(runtime,id);
  first.audit('first',{text:'中文'.repeat(40000)});
  second.audit('second');first.audit('third');
  const records=fs.readFileSync(first.file('audit.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
  let previous='';
  for(const {hash,...record} of records){assert.equal(record.previousHash,previous);assert.equal(hash,createHash('sha256').update(JSON.stringify(record)).digest('hex'));previous=hash;}
  assert.deepEqual(records.map(record=>record.event),['first','second','third']);
});
test('audit tail handles empty files and trailing CRLF whitespace without resetting the chain',()=>{
  const store=new Store(path.join(root,'audit-whitespace'),randomUUID());
  fs.writeFileSync(store.file('audit.jsonl'),'');store.audit('first');
  const first=JSON.parse(fs.readFileSync(store.file('audit.jsonl'),'utf8'));
  fs.appendFileSync(store.file('audit.jsonl'),'\r\n \t\r\n');store.audit('second');
  const records=fs.readFileSync(store.file('audit.jsonl'),'utf8').split('\n').filter(line=>line.trim()).map(line=>JSON.parse(line));
  assert.equal(records[1].previousHash,first.hash);
});
test('malformed audit tail rejects append without replacing existing evidence',()=>{
  const store=new Store(path.join(root,'audit-malformed'),randomUUID());
  fs.writeFileSync(store.file('audit.jsonl'),'broken record\n');
  assert.throws(()=>store.audit('next'),SyntaxError);
  assert.equal(fs.readFileSync(store.file('audit.jsonl'),'utf8'),'broken record\n');
});

function lockFixture(name:string) {
  const source=path.join(root,name);fs.mkdirSync(source);
  const state={source,config:config(source,`${name}-runtime`),id:randomUUID()} as State;
  const directory=process.platform==='win32'?'D:/PersonalAgent-data/project-locks':path.resolve('.project-locks');fs.mkdirSync(directory,{recursive:true});
  const file=path.join(directory,`${hashBytes(fs.realpathSync(source).toLowerCase())}.json`);
  return {state,file};
}
test('dead recovery guard is reclaimed; acquired project lock still excludes another Run',t=>{
  const {state,file}=lockFixture('dead-guard'),guard=`${file}.recovery`,dead=2147483647;
  const original=process.kill;
  t.mock.method(process,'kill',((pid:number,signal?:NodeJS.Signals|number)=>{
    assert.equal(signal,0);if(pid===dead)throw Object.assign(new Error('mock dead owner'),{code:'ESRCH'});return original(pid,signal);
  }) as typeof process.kill);
  fs.writeFileSync(guard,JSON.stringify({pid:dead}));
  const release=lockProject(state);
  try {assert.equal(fs.existsSync(guard),false);assert.throws(()=>lockProject(state),/already running/);}
  finally {release();}
});
test('live recovery guard, empty historical guard and malformed guard are never removed',()=>{
  const {state,file}=lockFixture('protected-guards'),guard=`${file}.recovery`;
  for(const content of [JSON.stringify({pid:process.pid}),'','not JSON',JSON.stringify(null)]) {
    fs.writeFileSync(guard,content);
    try {assert.throws(()=>lockProject(state),/recovery is already running|manual inspection required/);assert.equal(fs.readFileSync(guard,'utf8'),content);assert.equal(fs.existsSync(file),false);}
    finally {fs.unlinkSync(guard);}
  }
});
test('dead recovery claims do not block; live and unknown claims exclude recovery',t=>{
  const {state,file}=lockFixture('claim-owners'),claim=`${file}.claim-${randomUUID()}`,dead=2147483647;
  const original=process.kill;
  t.mock.method(process,'kill',((pid:number,signal?:NodeJS.Signals|number)=>{
    assert.equal(signal,0);if(pid===dead)throw Object.assign(new Error('mock dead owner'),{code:'ESRCH'});return original(pid,signal);
  }) as typeof process.kill);
  fs.writeFileSync(claim,JSON.stringify({pid:dead}));
  try {
    const release=lockProject(state);release();assert.equal(fs.existsSync(claim),false);
    for(const content of [JSON.stringify({pid:process.pid}),'']) {
      fs.writeFileSync(claim,content);assert.throws(()=>lockProject(state),/recovery is already running|manual inspection required/);assert.equal(fs.readFileSync(claim,'utf8'),content);
    }
  } finally {if(fs.existsSync(claim))fs.unlinkSync(claim);}
});
test('workspace-owned acceptance script fails at creation with readable failure before model work',async()=>{
  const source=path.join(root,'internal-acceptance');fs.mkdirSync(source);
  const script=path.join(source,'verify.cjs');fs.writeFileSync(script,"throw Error('must never run');");
  const c=config(source,'internal-acceptance-runtime');c.tests=[{executable:process.execPath,args:[script]}];
  await failedStart(c,fs.realpathSync(source),/Delivery acceptance rules must be outside Agent workspace/);
});
test('external acceptance and explicit manual acceptance remain available',async()=>{
  const source=path.join(root,'external-acceptance');fs.mkdirSync(source);
  const script=path.join(root,'external-verify.cjs');fs.writeFileSync(script,"throw Error('preflight must not execute tests');");
  const c=config(source,'external-acceptance-runtime');c.tests=[{executable:process.execPath,args:[script]}];
  assert.equal((await createRun(c,source,'external fixture')).load().phase,'planning');
  assert.equal((await createRun(config(source,'manual-runtime'),source,'manual fixture')).load().config.tests.length,0);
});
test('acceptance preflight rejects missing executable without executing anything',()=>{
  const c=config(root,'missing-executable');c.tests=[{executable:path.join(root,'missing.exe'),args:[]}];
  assert.throws(()=>assertDeliveryAcceptanceRules({config:c,workspace:root}),/cannot be fingerprinted/);
});
