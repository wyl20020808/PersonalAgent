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
 assert.deepEqual(result.provider.relay.models.model,{id:'wire-id',name:'Fixture',modalities:{input:['text'],output:['text']},options:{temperature:0},variants:{custom:{}}});
 const declared=v1ProviderConfig({providers:{relay:{package:'@opencode/ai/providers/openai-compatible',models:{text:{attachment:false},custom:{modalities:{input:['text'],output:['text']}}}}}}).provider.relay.models;
 assert.deepEqual(declared.text,{id:'text',name:undefined,attachment:false,modalities:{input:['text'],output:['text']}});assert.deepEqual(declared.custom,{id:'custom',name:undefined,modalities:{input:['text'],output:['text']}});
 assert.equal(result.provider.relay.options.apiKey,'local-fixture-secret');assert.deepEqual(result.plugin,['never-execute']);
 assert.throws(()=>v1ProviderConfig({providers:{unsupported:{package:'unknown',models:{}}}}),/cannot be mapped/);
});

test('per-model V2 capabilities and V1 overrides preserve tools, modalities and reasoning without name heuristics',()=>{
 const source={enabled_providers:['relay'],disabled_providers:['disabled'],providers:{relay:{package:'@opencode/ai/providers/openai-compatible',models:{
  vision:{modelID:'arbitrary-id',capabilities:{tools:true,input:['text','image'],output:['text']},reasoning:true,temperature:false,interleaved:{field:'reasoning_content'}},
  text:{modelID:'claude-or-codex-is-not-proof',capabilities:{tools:false,input:['text'],output:['text']}},
  override:{capabilities:{tools:true,input:['text','image'],output:['text']},tool_call:false,modalities:{input:['text']},reasoning:false,attachment:false},
  unknown:{attachment:true},
 }}}};
 const before=JSON.stringify(source),result=v1ProviderConfig(source),models=result.provider.relay.models;
 assert.equal(models.vision.tool_call,true);assert.equal(models.vision.reasoning,true);assert.equal(models.vision.temperature,false);assert.deepEqual(models.vision.interleaved,{field:'reasoning_content'});
 assert.deepEqual(models.vision.modalities,{input:['text','image'],output:['text']});
 assert.equal(models.text.tool_call,false);assert.deepEqual(models.text.modalities.input,['text']);
 assert.equal(models.override.tool_call,false);assert.equal(models.override.reasoning,false);assert.equal(models.override.attachment,false);assert.deepEqual(models.override.modalities.input,['text']);
 assert.equal(models.unknown.tool_call,undefined);assert.deepEqual(models.unknown.modalities.input,['text']);
 assert.deepEqual(result.enabled_providers,['relay']);assert.deepEqual(result.disabled_providers,['disabled']);assert.equal(JSON.stringify(source),before);
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
 const thinking=v1ProviderConfig({providers:{a:{package:'@opencode/ai/providers/anthropic',models:{m:{reasoning:true,tool_call:true,modalities:{input:['text','image']},variants:[{id:'budget',settings:{thinking:{type:'enabled',budgetTokens:1024}}}]}}}}}).provider.a.models.m;
 assert.equal(thinking.reasoning,true);assert.equal(thinking.tool_call,true);assert.deepEqual(thinking.modalities.input,['text','image']);
 assert.deepEqual(thinking.variants,{budget:{thinking:{type:'enabled',budgetTokens:1024}}});assert.equal(thinking.variants.budget.reasoningEffort,undefined);
});
