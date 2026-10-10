// Isolated regression harness only. Never imported by production code.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { interactionPolicyContext } from '../dist/src/interaction-policy.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../validation/global-interaction-regression');
fs.mkdirSync(root,{recursive:true});
const fixture=path.join(root,'work-fixture.json');
try { fs.writeFileSync(fixture,JSON.stringify({version:1,mode:'work'}),{flag:'wx',flush:true}); }
catch(error) { if(error.code!=='EEXIST') throw error; }
interactionPolicyContext.enterWith(fixture);
// Explicitly propagate this test fixture into test-owned Node descendants.
// Production Desktop intentionally removes NODE_OPTIONS before launching a Run.
const loader=import.meta.url;
if(!process.env.NODE_OPTIONS?.includes(loader))process.env.NODE_OPTIONS=`${process.env.NODE_OPTIONS??''} --import="${loader}"`.trim();
