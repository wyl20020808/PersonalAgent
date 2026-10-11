import fs from 'node:fs';
import {discoverOpencodeModels} from '../dist/src/opencode-decision-agent.js';
const result=await discoverOpencodeModels(undefined,process.cwd());
fs.writeFileSync('validation/model-settings/opencode-catalog.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({scope:'Real installed OpenCode read-only provider/model/variant discovery; no model turn',available:result.available,providers:result.providers.length,models:result.providers.reduce((n,p)=>n+p.models.length,0),modelsWithVariants:result.providers.reduce((n,p)=>n+p.models.filter(m=>m.reasoningEfforts?.length).length,0),reason:result.reason}));
if(!result.available)process.exitCode=1;
