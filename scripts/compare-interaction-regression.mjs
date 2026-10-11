import fs from 'node:fs';
const folder='validation/global-interaction-regression';
function read(name){const text=fs.readFileSync(`${folder}/${name}`,'utf8');return {total:Number(text.match(/^# tests (\d+)/m)?.[1]),pass:Number(text.match(/^# pass (\d+)/m)?.[1]),fail:Number(text.match(/^# fail (\d+)/m)?.[1]),failed:[...text.matchAll(/^not ok \d+ - (.+)$/gm)].map(match=>match[1])};}
const feature=read('feature-test.log'),dev=read('dev-test.log'),desktop=read('desktop-test.log');
const result={feature,dev,desktop,featureOnlyFailures:feature.failed.filter(name=>!dev.failed.includes(name)),devOnlyFailures:dev.failed.filter(name=>!feature.failed.includes(name))};
fs.writeFileSync(`${folder}/comparison.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({feature:{total:feature.total,pass:feature.pass,fail:feature.fail},dev:{total:dev.total,pass:dev.pass,fail:dev.fail},desktop:{total:desktop.total,pass:desktop.pass,fail:desktop.fail},featureOnlyFailures:result.featureOnlyFailures},null,2));
