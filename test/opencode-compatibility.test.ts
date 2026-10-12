import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {v1ProviderConfig,opencodeEnvironment} from '../src/opencode-runtime.js';
import {supportsStructuredOutput} from '../src/opencode-decision-agent.js';

test('real V1 OpenAPI reference shape resolves format; mixed API family and V2 absence remain explicit',()=>{
 const api={paths:{'/api/provider':{},'/session/{sessionID}/message':{post:{requestBody:{content:{'application/json':{schema:{$ref:'#/components/schemas/Prompt'}}}}}}},components:{schemas:{Prompt:{properties:{format:{$ref:'#/components/schemas/OutputFormat'}}},OutputFormat:{oneOf:[{$ref:'#/components/schemas/OutputFormatJsonSchema'}]},OutputFormatJsonSchema:{properties:{type:{enum:['json_schema']}}}}}};
 assert.equal(supportsStructuredOutput(api),true);
 assert.equal(supportsStructuredOutput({paths:{'/api/provider':{},'/api/session/{sessionID}/prompt':{}}}),false);
 assert.equal(supportsStructuredOutput({paths:api.paths,components:{schemas:{Prompt:{$ref:'#/components/schemas/Prompt'}}}}),false);
});
test('V2 providers map to supported V1 packages without guessing model limits, variants, subscriptions or tools',()=>{
 const result=v1ProviderConfig({plugins:['never-execute'],providers:{relay:{package:'@opencode/ai/providers/openai-compatible',settings:{baseURL:'https://example.invalid/v1',apiKey:'local-fixture-secret'},models:{model:{modelID:'wire-id',name:'Fixture',body:{temperature:0},variants:{custom:{}}}}},claude:{package:'@opencode/ai/providers/anthropic',settings:{},models:{}}}});
 assert.equal(result.provider.relay.npm,'@ai-sdk/openai-compatible');assert.equal(result.provider.claude.npm,'@ai-sdk/anthropic');
 assert.deepEqual(result.provider.relay.models.model,{id:'wire-id',name:'Fixture',attachment:true,modalities:{input:['text','image'],output:['text']},options:{temperature:0}});
 const declared=v1ProviderConfig({providers:{relay:{package:'@opencode/ai/providers/openai-compatible',models:{text:{attachment:false},custom:{modalities:{input:['text'],output:['text']}}}}}}).provider.relay.models;
 assert.deepEqual(declared.text,{id:'text',name:undefined,attachment:false});assert.deepEqual(declared.custom,{id:'custom',name:undefined,modalities:{input:['text'],output:['text']}});
 assert.equal(result.provider.relay.options.apiKey,'local-fixture-secret');assert.deepEqual(result.plugin,[]);
 assert.throws(()=>v1ProviderConfig({providers:{unsupported:{package:'unknown',models:{}}}}),/cannot be mapped/);
});
test('V1 child environment isolates persistence and never writes source credentials or global config',()=>{
 const root=path.resolve('runtime-env-'+randomUUID().slice(0,8));fs.mkdirSync(root,{recursive:true});
 const file=path.join(root,'source.json'),bytes=Buffer.from('\uFEFF'+JSON.stringify({provider:{fixture:{options:{apiKey:'local-fixture-secret'}}}}));fs.writeFileSync(file,bytes);
 const prior=process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE;process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE=file;
 try{
  const env=opencodeEnvironment(root,path.join(root,'owned'));
  assert.equal(env.OPENCODE_DISABLE_AUTOUPDATE,'true');assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG,'true');assert.equal(env.OPENCODE_CONFIG,undefined);
  for(const key of ['XDG_DATA_HOME','XDG_STATE_HOME','XDG_CONFIG_HOME','XDG_CACHE_HOME','OPENCODE_DB','TEMP','TMP'])assert.ok(env[key]?.startsWith(path.join(root,'owned')));
  assert.match(env.OPENCODE_CONFIG_CONTENT!,/local-fixture-secret/);assert.deepEqual(fs.readFileSync(file),bytes);
  assert.deepEqual(fs.readdirSync(path.join(root,'owned','config','opencode')),[]);
 }finally{if(prior===undefined)delete process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE;else process.env.PERSONAL_AGENT_OPENCODE_CONFIG_FILE=prior;}
});

test('declared V2 effort variants survive V1 conversion with effective SDK options',()=>{
 const source={providers:{relay:{package:'@opencode/ai/providers/openai-compatible',settings:{},models:{sol:{modelID:'gpt-6.1-sol',body:{store:false},variants:[{id:'low'},{id:'medium'},{id:'custom',settings:{temperature:0.2},body:{reasoning_effort:'high',max_tokens:1024}}]}}}}};
 const before=JSON.stringify(source),model=v1ProviderConfig(source).provider.relay.models.sol;
 assert.deepEqual(model.variants,{low:{reasoningEffort:'low'},medium:{reasoningEffort:'medium'},custom:{temperature:0.2,max_tokens:1024,reasoningEffort:'high'}});
 assert.deepEqual(model.options,{store:false});
 assert.equal('high' in model.variants,false);
 assert.equal(JSON.stringify(source),before);
 const anthropic=v1ProviderConfig({providers:{a:{package:'@opencode/ai/providers/anthropic',models:{m:{variants:[{id:'medium'}]}}}}}).provider.a.models.m;
 assert.deepEqual(anthropic.variants,{medium:{}});
});
