import test from 'node:test';
import assert from 'node:assert/strict';
import {agentCapabilities,supportsPool} from '../src/agent-capabilities.js';
import {configSchema,validate} from '../src/schema.js';

test('role board exposes only implemented decision discussion and single execution adapters',()=>{
 assert.deepEqual(agentCapabilities.filter(agent=>supportsPool(agent,'decision')).map(agent=>agent.id),['claude-code','opencode']);
 assert.deepEqual(agentCapabilities.filter(agent=>supportsPool(agent,'execution')).map(agent=>agent.id),['opencode','codex']);
 assert.deepEqual(agentCapabilities.filter(agent=>agent.discussion).map(agent=>agent.id),['claude-code','opencode']);
 assert.equal(supportsPool({...agentCapabilities[1]!,nativeTools:false},'decision'),false);
 assert.equal(supportsPool({...agentCapabilities[1]!,structuredOutput:false},'decision'),false);
});

test('current config accepts legacy default but rejects future role and multi-decision fields',()=>{
 const legacy={allowedRepositories:['D:/fixture'],runtimeDir:'D:/fixture-runtime',mode:'mock',claudeExecutable:'never-paid',mockScenario:'pass',maxClaudeCalls:5,maxLoops:4,maxReworks:1,timeoutMs:1000,tests:[]};
 assert.doesNotThrow(()=>validate(configSchema,legacy));
 for(const extra of [{decisionAgents:[{backend:'claude-code'},{backend:'opencode'}]},{executionAgent:{backend:'claude-code'}},{decisionAgent:{backend:'codex'}}])assert.throws(()=>validate(configSchema,{...legacy,...extra}));
});
