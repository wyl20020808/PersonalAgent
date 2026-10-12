import test from 'node:test';
import assert from 'node:assert/strict';
import {v1ProviderConfig} from '../src/opencode-runtime.js';
test('preserve compaction policy across both provider formats without inventing model limits',()=>{
 for(const providers of [undefined,{}]){const config={providers,compaction:{auto:true,keep:{tokens:15000},buffer:20000}},before=JSON.stringify(config);const result=v1ProviderConfig(config);assert.deepEqual(result.compaction,{auto:true,preserve_recent_tokens:15000,reserved:20000});assert.equal(JSON.stringify(config),before);}
});
test('native compaction fields win; invalid counts and unsupported fields are withheld',()=>{
 assert.deepEqual(v1ProviderConfig({compaction:{auto:false,prune:true,preserve_recent_tokens:8000,reserved:0,keep:{tokens:15000},buffer:20000,tail_turns:-1,secret:'withheld'}}).compaction,{auto:false,prune:true,preserve_recent_tokens:8000,reserved:0});
});
