import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('.',import.meta.url)));
const {build:bundle}=await import('esbuild');
const {build}=await import('vite');
await bundle({entryPoints:['src/acceptance-fixture.ts','src/windowPlacement.ts','src/windowPlacement.test.ts','src/modelCatalog.ts','src/modelCatalog.test.ts','src/runTiming.ts','src/fileReferences.ts','src/fileReferences.test.ts','src/fileChanges.ts','src/fileChanges.test.ts','src/chatPresentation.ts','src/main.ts','src/chatRouting.ts','src/refreshLoop.ts','src/attachments.ts','src/attachmentStorage.ts','src/workbench.test.ts','src/test-service.ts','src/interaction-policy.test.ts','src/service.ts','src/sessions.ts','src/threadGrouping.ts','src/threadGrouping.test.ts','src/sessions.test.ts','src/service.test.ts','src/thread.ts','src/thread.test.ts','src/unified.test.ts'],outdir:'out',platform:'node',format:'esm',bundle:false});
await bundle({entryPoints:['src/preload.ts'],outfile:'out/preload.cjs',platform:'node',format:'cjs',bundle:true,external:['electron']});
await build({root:'renderer',base:'./',build:{outDir:'../out/renderer',emptyOutDir:true},cacheDir:'../.cache/vite-desktop'});
