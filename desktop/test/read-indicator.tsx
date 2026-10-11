const time='2026-10-11T00:00:00.000Z';
const run:any={id:'run-a',profileId:'profile',goal:'提醒测试',source:'D:/Fixture',workspace:'D:/Fixture',phase:'paused',reason:'等待决策',updatedAt:time,mode:'real',tasks:[],taskIndex:0,completedTaskIds:[],loops:0,claudeCalls:0,totalReworks:0,config:{maxClaudeCalls:5,maxLoops:8,maxReworks:1},evidence:null,failure:null,active:false};
const sessions=['paused','failed','stopped','executing'].map((status,index)=>({id:'session-'+index,title:'会话 '+index,projectPath:'D:/Fixture',projectName:'Fixture',createdAt:time,updatedAt:time,settings:{mode:'real',projectMode:'direct',maxClaudeCalls:5,maxLoops:8,maxReworks:1},runs:index===0?[{id:run.id,profileId:run.profileId}]:[],messages:[{id:'message',time,text:'测试消息',status:'executed'}],budget:{claudeUsed:0,loopsUsed:0,claudeRemaining:5,loopsRemaining:8},status}));
(window as any).fixture={sessions,run};
window.personalAgent={invoke:async(request:any)=>{
 if(request.operation==='overview')return {profiles:[],runs:[run],warnings:[],paths:{controller:'D:/Fixture',data:'D:/FixtureData',node:'node'},reducedMotion:true,recentProjects:[]} as any;
 if(request.operation==='sessions')return structuredClone(sessions) as any;
 if(request.operation==='detail')return {run:structuredClone(run),activity:[]} as any;
 if(request.operation==='pictures')return [] as any;
 if(request.operation==='thread')return {messages:[],total:0,hasMore:false,capabilities:{}} as any;
 if(request.operation==='decisionModels'||request.operation==='executionModels')return {available:false,providers:[]} as any;
 throw Error('Unexpected read-indicator request: '+request.operation);
}};
await import('../src/App.js');
