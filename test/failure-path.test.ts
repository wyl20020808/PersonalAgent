import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyFailure} from '../src/failure.js';
test('UUID path fragments cannot disguise safety failures as HTTP authentication or budget errors',()=>{
 for(const token of ['0e429b59339a','a401a123','ab403def']){
  const result=classifyFailure(new Error(`Git ignore policy check failed: ../escape.txt outside D:/runtime/${token}/workspace`),'executing');
  assert.equal(result.kind,'safety');assert.equal(result.recoverable,false);
 }
 assert.equal(classifyFailure(new Error('HTTP 429 Too Many Requests'),'review').kind,'budget');
 assert.equal(classifyFailure(new Error('HTTP 403 Forbidden'),'execute').kind,'authentication');
});
