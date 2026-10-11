import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogCache} from './modelCatalog.js';

test('preload deduplicates concurrent consumers; reopen uses cache; explicit refresh preserves data',async()=>{
 let calls=0,complete!:(value:unknown)=>void;
 const cache=createCatalogCache(async()=>{calls++;return new Promise(resolve=>{complete=resolve;});});
 const request={operation:'decisionModels' as const,projectPath:'D:/one'};
 const first=cache.load(request),second=cache.load(request);await Promise.resolve();assert.equal(calls,1);assert.equal(first,second);
 complete({available:true,providers:[{id:'first'}]});await first;const data=cache.snapshot(request).data;
 await cache.load(request);assert.equal(calls,1);assert.equal(cache.snapshot(request).data,data);
 const refresh=cache.load(request,true);await Promise.resolve();assert.equal(calls,2);assert.equal(cache.snapshot(request).data,data);
 complete({available:false,reason:'offline',providers:[]});await refresh;assert.equal(cache.snapshot(request).data,data);assert.equal(cache.snapshot(request).error,'offline');
 const scoped=cache.load({...request,projectPath:'D:/two'});await Promise.resolve();assert.equal(calls,3);complete({available:true,providers:[]});await scoped;
});

test('refresh thrown error keeps catalog and permits later retry',async()=>{
 let calls=0;const cache=createCatalogCache(async()=>{if(++calls===2)throw Error('network');return{models:[{id:'actual'}]};});
 const request={operation:'nativeModels' as const,backend:'codex' as const};await cache.load(request);await cache.load(request,true);
 assert.equal(cache.snapshot<any>(request).data.models[0].id,'actual');assert.equal(cache.snapshot(request).error,'network');
 await cache.load(request,true);assert.equal(calls,3);assert.equal(cache.snapshot(request).error,undefined);
});
