// Real installed CLI, isolated settings and deterministic local Anthropic fixture.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {terminateTree} from '../dist/src/process.js';
const executable=process.argv[2];if(!executable||!fs.existsSync(executable))throw Error('Pass absolute installed claude.exe');
const root=fs.mkdtempSync('D:/pa-cc-policy-'),workspace=path.join(root,'workspace'),home=path.join(root,'home');fs.mkdirSync(workspace);fs.mkdirSync(home);
const policy=path.join(root,'work.json'),audit=path.join(root,'audit.jsonl');fs.writeFileSync(policy,JSON.stringify({version:1,mode:'work'}));
const script=path.resolve('dist/scripts/codex-interaction-hook.js');
const settings={disableAllHooks:false,hooks:{PreToolUse:[{matcher:'',hooks:[{type:'command',command:`"${process.execPath}" "${script}" "${policy}" "${audit}"`,timeout:5}]}]}};
let requests=0;const captured=[],events=[];
const server=http.createServer(async(req,res)=>{
  let body='';for await(const b of req)body+=b;if(!req.url?.includes('/messages')){res.setHeader('content-type','application/json');res.end('{}');return;}
  const input=JSON.parse(body);requests++;captured.push(input.messages?.filter(m=>m.role==='user').flatMap(m=>Array.isArray(m.content)?m.content.filter(c=>c.type==='tool_result'):[]));
  const content=requests<=2?{type:'tool_use',id:'tool_'+requests,name:'Bash',input:{command:requests===1?'echo POLICY_BACKGROUND_SAFE':'echo ClipCursor MOCK_ONLY',description:'Harmless echo fixture'}}:{type:'text',text:'Local probe complete'};
  res.writeHead(200,{'content-type':'text/event-stream'});const send=(event,data)=>res.write(`event: ${event}\ndata: ${JSON.stringify({type:event,...data})}\n\n`);
  send('message_start',{message:{id:'msg_'+requests,type:'message',role:'assistant',model:'claude-sonnet-4-5-20250929',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:1,output_tokens:1}}});
  if(content.type==='tool_use'){send('content_block_start',{index:0,content_block:{type:'tool_use',id:content.id,name:content.name,input:{}}});send('content_block_delta',{index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(content.input)}});}else{send('content_block_start',{index:0,content_block:{type:'text',text:''}});send('content_block_delta',{index:0,delta:{type:'text_delta',text:content.text}});}
  send('content_block_stop',{index:0});send('message_delta',{delta:{stop_reason:requests<=2?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:1}});send('message_stop',{});res.end();
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const env={...process.env,CLAUDE_CONFIG_DIR:home,ANTHROPIC_BASE_URL:`http://127.0.0.1:${server.address().port}`,ANTHROPIC_API_KEY:'dummy-local',ANTHROPIC_AUTH_TOKEN:'dummy-local',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};delete env.NODE_OPTIONS;
let stderr='',exitCode;
try{
  const child=spawn(executable,['-p','--output-format','stream-json','--verbose','--permission-mode','bypassPermissions','--model','claude-sonnet-4-5-20250929','--settings',JSON.stringify(settings),'Run local fixture.'],{cwd:workspace,env,windowsHide:true,stdio:['ignore','pipe','pipe'],shell:false});
  createInterface({input:child.stdout}).on('line',line=>{try{events.push(JSON.parse(line));}catch{}});child.stderr.on('data',chunk=>stderr+=String(chunk));
  const timer=setTimeout(()=>{if(child.pid)void terminateTree(child.pid);},20000);exitCode=await new Promise(resolve=>child.once('close',resolve));clearTimeout(timer);
}finally{
  server.closeAllConnections();server.close();const hookAudit=fs.existsSync(audit)?fs.readFileSync(audit,'utf8'):'';
  const safeShell=JSON.stringify(captured).includes('POLICY_BACKGROUND_SAFE'),desktopDeferred=JSON.stringify(captured).includes('deferred_by_work_mode');
  const evidence={root,paidModelCalls:0,requests,exitCode,safeShell,desktopDeferred,hookAudit,events,stderr,passed:safeShell&&desktopDeferred&&exitCode===0};fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({evidence:path.join(root,'evidence.json'),requests,exitCode,safeShell,desktopDeferred,hookAudit,stderr},null,2));if(!evidence.passed)process.exitCode=1;
}
