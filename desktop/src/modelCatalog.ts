import {useEffect,useSyncExternalStore} from 'react';
import type {Request} from './types.js';

type Snapshot<T>={data?:T;loading:boolean;error?:string};
export function createCatalogCache(invoke:(request:Request)=>Promise<unknown>){
 const entries=new Map<string,{snapshot:Snapshot<any>;listeners:Set<()=>void>;pending?:Promise<void>}>();
 const entry=(request:Request)=>{const key=JSON.stringify(request);let item=entries.get(key);if(!item){item={snapshot:{loading:false},listeners:new Set()};entries.set(key,item);}return item;};
 return {
  snapshot<T>(request:Request){return entry(request).snapshot as Snapshot<T>;},
  subscribe(request:Request,listener:()=>void){const item=entry(request);item.listeners.add(listener);return()=>{item.listeners.delete(listener);};},
  load(request:Request,refresh=false):Promise<void>{
   const item=entry(request);if(item.pending)return item.pending;if(item.snapshot.data&&!refresh)return Promise.resolve();
   const update=(snapshot:Snapshot<unknown>)=>{item.snapshot=snapshot;for(const listener of item.listeners)listener();};
   update({...item.snapshot,loading:true,error:undefined});
   item.pending=Promise.resolve().then(()=>invoke(request)).then(data=>{
    const failure=(data as {reason?:string})?.reason;
    if(failure&&item.snapshot.data)update({...item.snapshot,loading:false,error:failure});else update({data,loading:false,error:failure});
   }).catch(error=>update({...item.snapshot,loading:false,error:String(error.message??error)})).finally(()=>{item.pending=undefined;});
   return item.pending;
  }
 };
}
export const modelCatalogCache=createCatalogCache(request=>window.personalAgent.invoke(request));
export function useModelCatalog<T>(request:Request,enabled=true){
 const key=JSON.stringify(request);
 const snapshot=useSyncExternalStore(listener=>modelCatalogCache.subscribe(request,listener),()=>modelCatalogCache.snapshot<T>(request));
 useEffect(()=>{if(enabled)void modelCatalogCache.load(request);},[key,enabled]);
 return {...snapshot,refresh:()=>{void modelCatalogCache.load(request,true);}};
}
export function preloadModelCatalogs(projectPath?:string){
 for(const backend of ['claude-code','codex'] as const)void modelCatalogCache.load({operation:'nativeModels',backend});
 for(const operation of ['decisionModels','executionModels'] as const)void modelCatalogCache.load({operation,...(projectPath?{projectPath}:{})});
}
