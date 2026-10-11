import type {Overview} from './src/types.js';
const overview:Overview={profiles:[],runs:[],warnings:[],paths:{controller:'D:/Preview',data:'D:/PreviewData',node:'node'},reducedMotion:true,recentProjects:[]};
localStorage.clear();
window.personalAgent={invoke:async(request:any)=>{
 if(request.operation==='overview')return overview as any;
 if(request.operation==='sessions')return [] as any;
 if(request.operation==='decisionModels'||request.operation==='executionModels')return {available:false,reason:'隔离 UI 验证',providers:[]} as any;
 throw Error('Unexpected app preview request: '+request.operation);
}};
await import('./src/App.js');
