import {build} from '../desktop/node_modules/esbuild/lib/main.js';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const root=path.resolve('.validation','context-meters');fs.mkdirSync(root,{recursive:true});
const bundle=path.join(root,'render.mjs');
await build({stdin:{contents:`import React from 'react';import {renderToString} from 'react-dom/server';import {ContextMeters} from './src/ContextMeters.tsx';export const render=contexts=>renderToString(React.createElement(ContextMeters,{contexts}));`,resolveDir:path.resolve('desktop'),loader:'tsx'},outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'bundle',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
const {render}=await import(pathToFileURL(bundle).href);
const {chromium}=await import(pathToFileURL('C:/Users/WYL20/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser=await chromium.launch({headless:true,...(fs.existsSync(edge)?{executablePath:edge}:{})});
try{
 const page=await browser.newPage({viewport:{width:850,height:300}});
 const contexts=[{role:'decision',model:'Claude',usedTokens:50000,windowTokens:200000,compactAtTokens:170000,measurement:'estimated',status:'normal',compactions:1},{role:'execution',model:'Codex',usedTokens:400000,windowTokens:475000,compactAtTokens:403750,measurement:'native',status:'near-limit',compactions:2}];
 const css=fs.readFileSync('desktop/src/group.css','utf8');
 await page.setContent(`<style>${css}body{background:#1e1e1e;color:#ddd;font-family:Segoe UI;padding:20px}.header{display:flex;justify-content:flex-end;gap:12px}.run-clocks{display:flex;gap:8px}</style><div class="header">${render(contexts)}<div class="run-clocks">思考 1:20 · 执行 2:30</div></div>`);
 await page.getByRole('button',{name:'决策者上下文 约 25%'}).count();
 const meters=page.locator('.context-meter summary');if(await meters.count()!==2)throw Error('Two role meters missing');
 await meters.first().click();if(!await page.getByText('50,000 / 200,000 tokens',{exact:true}).isVisible())throw Error('Decision details missing');
 const meterBox=await page.locator('.context-meters').boundingBox(),clockBox=await page.locator('.run-clocks').boundingBox();if(meterBox.x+meterBox.width>clockBox.x)throw Error('Meters must be left of clocks');
 await page.screenshot({path:path.join(root,'meters.png')});
 await page.setContent(`<style>${css}</style>${render([])}`);if(!await page.locator('summary[aria-label="执行者上下文 未知"]').count())throw Error('Unknown falsely displayed as zero');
 console.log('Two role meters, details, unknown state and placement verified in isolated headless Chromium.');
}finally{await browser.close();}
