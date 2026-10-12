import {parentPort,workerData} from 'node:worker_threads';
import {DesktopService,validateRequest,redact} from './service.js';
import {historyOperations} from './historyReader.js';
const service=new DesktopService(workerData.root,workerData.data,workerData.node);
let queue=Promise.resolve();
parentPort!.on('message',({id,request})=>{
 queue=queue.then(async()=>{
  try{const validated=validateRequest(request);if(!historyOperations.has(validated.operation))throw Error('History reader accepts read operations only');const value=await service.dispatch(validated);parentPort!.postMessage({id,value});}
  catch(error){parentPort!.postMessage({id,error:redact((error as Error).message)});}
 });
});
