import React,{useEffect,useRef,useState} from 'react';
import Markdown from 'react-markdown';
import {ArrowDown,ArrowUpRight,Check,CheckCircle2,ChevronDown,Clock3,Code2,FileCode2,GitBranch,Image as ImageIcon,Layers3,MessageSquare,Pause,Play,Send,ShieldCheck,TriangleAlert,X} from 'lucide-react';
import type {ChatMessage,Picture,Profile,Run,ThreadPage} from './types.js';
import './group.css';

const roles={user:{name:'你',description:'项目负责人',letter:'你'},claude:{name:'Claude Code',description:'规划 · 审查',letter:'C'},codex:{name:'Codex',description:'开发执行',letter:'X'},controller:{name:'Controller',description:'独立系统事件',letter:'P'}};
const labels:Record<string,string>={planning:'CC 正在规划',execute:'准备派单',executing:'Codex 正在执行',applying:'Controller 应用提案',verify:'Controller 独立验证',review:'CC 正在审查',paused:'等待你的决策',failed:'执行失败',stopped:'已停止',completed:'本轮开发已完成'};
const clock=(time:string)=>new Date(time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
export function SafeMarkdown({text}:{text:string}){return <Markdown skipHtml components={{a:({children})=><span className="markdown-link">{children}</span>,img:()=>null}}>{text}</Markdown>;}
function Text({text}:{text:string}){return text.length>650?<details className="message-fold"><summary><SafeMarkdown text={text.split('\n')[0].slice(0,240)}/><span>展开完整内容<ChevronDown size={13}/></span></summary><div className="markdown"><SafeMarkdown text={text}/></div></details>:<div className="markdown"><SafeMarkdown text={text}/></div>;}
function Message({message}:{message:ChatMessage}){
 const role=roles[message.role]??roles.controller;
 if(message.role==='controller'&&['phase','dispatch','session','exit'].includes(message.kind))return <article className={`group-message role-controller kind-${message.kind} system-message`} data-message-id={message.id}><details><summary><ShieldCheck size={12}/><span>Controller · {message.title}</span><time dateTime={message.time}>{clock(message.time)}</time><ChevronDown size={12}/></summary><div className="system-evidence"><SafeMarkdown text={message.text||'阶段状态来自 Controller 检查点'}/><code>{message.source}{message.taskId?' · '+message.taskId:''}{message.loop?' · 第 '+message.loop+' 轮':''}</code></div></details></article>;
 return <article className={`group-message role-${message.role} kind-${message.kind}`} data-message-id={message.id}>
  <div className={`person-icon ${message.role}`}>{message.role==='controller'?<ShieldCheck size={14}/>:role.letter}</div>
  <div className="message-main"><div className="message-meta"><strong>{role.name}</strong><span>{role.description}</span><time dateTime={message.time}>{clock(message.time)}</time></div>
   <div className="message-content"><div className="message-title">{message.title}{message.status==='pending'&&<span className="pending-label">未生效</span>}{message.status==='pass'&&<CheckCircle2 size={14}/>}</div><Text text={message.text}/>
    {message.details?.tasks&&<div className="chat-plan">{message.details.tasks.map((t,i)=><details key={t.id}><summary><span className="step-number">{i+1}</span><strong>{t.id}</strong><span>{t.dependsOn?.length?'依赖 '+t.dependsOn.join('、'):'起始任务'}</span><ChevronDown size={13}/></summary><SafeMarkdown text={t.instruction}/><ul>{t.acceptance.map((a,n)=><li key={n}>{a}</li>)}</ul></details>)}</div>}
    {message.details?.paths&&<div className="file-chips">{message.details.paths.map(p=><span key={p}><FileCode2 size={12}/>{p}</span>)}</div>}
    {message.details?.tests&&<div className="chat-test-card">{message.details.tests.map((t,i)=><details key={i}><summary><span className={t.exitCode===0?'positive':'negative'}>{t.exitCode===0?<CheckCircle2 size={14}/>:<TriangleAlert size={14}/>}验收命令 {i+1}</span><span>退出码 {t.exitCode}</span><ChevronDown size={13}/></summary><pre>{t.stdout||'无标准输出'}{t.stderr?'\n'+t.stderr:''}</pre></details>)}</div>}
    {message.details?.diff&&<details className="chat-diff"><summary><GitBranch size={13}/>查看本次完整变更证据<ChevronDown size={13}/></summary><pre>{message.details.diff.split('\n').map((line,i)=><div key={i} className={line.startsWith('+')?'diff-add':line.startsWith('-')?'diff-remove':''}>{line||' '}</div>)}</pre></details>}
   </div><details className="source-reference"><summary>证据来源{message.taskId?' · '+message.taskId:''}{message.loop?' · 第 '+message.loop+' 轮':''}</summary><code>{message.source}</code></details>
  </div>
 </article>;
}
function ReviewSections({text}:{text:string}){
 const parts=text.split(/\n(?=(?:\*\*[^\n]+\*\*|#{1,3} [^\n]+)\s*\n)/);
 return <div className="review-sections">{parts.map((part,i)=>{
  const heading=part.match(/^(?:\*\*(.+?)\*\*|#{1,3} (.+))\s*\n/);
  const title=heading?.[1]??heading?.[2]??'审查结论与当前决定';
  return <details key={i} open={i===0}><summary>{title}<ChevronDown size={13}/></summary><div className="markdown"><SafeMarkdown text={heading?part.slice(heading[0].length):part}/></div></details>;
 })}{['满足的验收条件','尚待检查的事项','非阻断风险'].filter(title=>!text.includes(title)&&!(title==='满足的验收条件'&&text.includes('已从 Diff 和测试确认'))&&!(title==='非阻断风险'&&text.includes('不阻塞的遗留问题'))).map(title=><details key={title}><summary>{title}<ChevronDown size={13}/></summary><p>CC 本次未单列此项；请结合审查原文和独立证据判断，不自动视为通过或无风险。</p></details>)}</div>;
}
export default function GroupWorkspace({run,profile,onDetails,onDelivery,onGoal,onRunChange}:{run:Run|null;profile?:Profile;onDetails:()=>void;onDelivery:()=>void;onGoal:(goal:string)=>void;onRunChange?:()=>void}){
 const [messages,setMessages]=useState<ChatMessage[]>([]),[text,setText]=useState(''),[mode,setMode]=useState<'note'|'resume'|'visual'|'rework'>('note');
 const [pictures,setPictures]=useState<Picture[]>([]),[selectedImage,setSelectedImage]=useState<string>(''),[zoom,setZoom]=useState(false),[compare,setCompare]=useState(false),[attest,setAttest]=useState(false),[viewed,setViewed]=useState<string[]>([]);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[connected,setConnected]=useState(true),[lastActivity,setLastActivity]=useState<string|null>(null),[follow,setFollow]=useState(true),[filter,setFilter]=useState('all'),[visible,setVisible]=useState(60),[now,setNow]=useState(Date.now()),[capabilities,setCapabilities]=useState<ThreadPage['capabilities']>();
 const feed=useRef<HTMLDivElement>(null),messageId=useRef(crypto.randomUUID());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{let live=true,timer:ReturnType<typeof setTimeout>;let cursor:string|undefined;const map=new Map<string,ChatMessage>();
  setMessages([]);setLastActivity(null);setPictures([]);setViewed([]);setAttest(false);setMode('note');setText('');setFollow(true);setVisible(60);setError('');
  if(!run)return;
  const poll=async()=>{try{cursor=undefined;for(;;){
    const result:ThreadPage=await window.personalAgent.invoke<ThreadPage>({operation:'thread',profileId:run.profileId,runId:run.id,...(cursor?{after:cursor}: {})});
    if(!live)return;if(result.reset){map.clear();cursor=undefined;}
    for(const m of result.messages)map.set(m.id,m);cursor=result.cursor??undefined;
    setMessages([...map.values()].sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id)));setLastActivity(result.lastActivity);setCapabilities(result.capabilities);setConnected(true);
    if(!result.hasMore)break;
   }}catch(e){if(live){setConnected(false);setError((e as Error).message);}}finally{if(live)timer=setTimeout(poll,connected?1200:2400);}};
  void poll();return()=>{live=false;clearTimeout(timer);};
 },[run?.id]);
 useEffect(()=>{let live=true;if(!run)return;window.personalAgent.invoke<Picture[]>({operation:'pictures',profileId:run.profileId,runId:run.id}).then(images=>{if(!live)return;setPictures(images);setSelectedImage(current=>images.some(i=>i.id===current)?current:images.at(-1)?.id??'');}).catch(e=>{if(live)setError((e as Error).message);});return()=>{live=false;};},[run?.id,run?.updatedAt]);
 useEffect(()=>{if(follow&&feed.current)feed.current.scrollTop=feed.current.scrollHeight;},[messages,follow,filter]);
 useEffect(()=>{if(!zoom)return;const previous=document.activeElement as HTMLElement|null;const viewer=document.querySelector<HTMLElement>('.image-viewer');viewer?.querySelector<HTMLElement>('button')?.focus();const listener=(e:KeyboardEvent)=>{if(e.key==='Escape')setZoom(false);if(e.key==='Tab'&&viewer){const buttons=Array.from(viewer.querySelectorAll<HTMLElement>('button:not(:disabled)')),first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',listener);return()=>{document.removeEventListener('keydown',listener);previous?.focus();};},[zoom]);
 const paused=Boolean(run&&['paused','failed','stopped'].includes(run.phase));
 const current=run?.tasks[run.taskIndex]??run?.tasks.at(-1);
 const canResume=paused&&!profile?.readOnly&&run?.failure?.recoverable!==false;
 const reworkRemaining=Math.max(0,(run?.config.maxReworks??0)-(run?.reworks??0));
 const reworkEligible=Boolean(canResume&&reworkRemaining&&run&&run.loops<run.config.maxLoops&&run.claudeCalls<run.config.maxClaudeCalls&&(!profile?.globalBudget||profile.globalBudget.remaining>0));
 const recentReview=[...messages].reverse().find(m=>m.kind==='review'&&m.taskId===current?.id);
 const picture=pictures.find(p=>p.id===selectedImage),earlier=pictures.filter(p=>p.taskId!==picture?.taskId&&Boolean(picture&&p.time<picture.time)),previous=[...earlier].reverse().find(p=>p.name===picture?.name)??earlier.at(-1);
 const relevant=pictures.filter(p=>p.taskId===current?.id),checked=viewed.filter(id=>relevant.some(p=>p.id===id));
 const filtered=messages.filter(m=>filter==='all'||m.role===filter);
 const age=lastActivity?Math.max(0,Math.floor((now-new Date(lastActivity).getTime())/1000)):null;
 const send=async()=>{
  if(!text.trim()||busy)return;setBusy(true);setError('');setNotice('');
  try{
   if(!run){onGoal(text.trim());return;}
   if(mode==='note'){await window.personalAgent.invoke({operation:'note',profileId:run.profileId,runId:run.id,messageId:messageId.current,text:text.trim()});messageId.current=crypto.randomUUID();setNotice('已记录补充需求，尚未发送给 Agent；运行中的计划不变。');}
   else{
    if(!canResume)throw Error('当前 Run 不允许恢复');
    if(mode==='visual'&&(!attest||!checked.length))throw Error('请查看本阶段截图并明确确认');
    const prefix=mode==='visual'?'我已查看所选真实截图，确认本阶段视觉验收达标。本确认不包含成果交付批准。\n':mode==='rework'?'本阶段需要修改，请 CC 按独立验收和剩余返工上限决定；不扩大预算。\n':'';
    await window.personalAgent.invoke({operation:'resume',profileId:run.profileId,runId:run.id,decision:prefix+text.trim(),intent:mode,...(mode==='visual'?{pictureIds:checked.slice(-12)}: {})});
    setNotice('恢复请求已提交；是否生效以 Controller 人工决策审计事件为准。');onRunChange?.();
   }
   setText('');setMode('note');setAttest(false);setFollow(true);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 const openImage=(p:Picture)=>{setSelectedImage(p.id);setZoom(true);};
 const image=(p:Picture,view=false)=> <img onLoad={()=>{if(view)setViewed(v=>[...new Set([...v,p.id])]);}} src={p.url} alt={`${p.taskId} ${p.name}`} onError={()=>{setAttest(false);setViewed(v=>v.filter(id=>id!==p.id));setError('截图无法读取或哈希已改变，不能确认视觉验收。');}}/>;
 return <div className="group-workspace">
  <section className="conversation-column">
   <header className="conversation-header"><div className="group-avatar"><Layers3 size={22}/></div><div className="group-heading"><h2>{run?run.source.replaceAll('\\','/').split('/').at(-1):'新的项目群'}</h2><div className="group-members"><span>你</span><i/>Claude Code<i/>Codex<span className="member-count">3 位成员</span>{run&&<span className={`group-mode ${run.mode}`}>{run.mode==='mock'?'MOCK 演示':'REAL'}</span>}</div></div><div className="conversation-actions">{paused&&<button className="text-button" onClick={()=>document.querySelector('.decision-workbench')?.scrollIntoView({behavior:'smooth',block:'center'})}><TriangleAlert size={13}/>待决策</button>}{pictures.length>0&&<button className="text-button" onClick={()=>document.querySelector('.gallery-panel')?.scrollIntoView({behavior:'smooth',block:'center'})}><ImageIcon size={13}/>截图 {pictures.length}</button>}{run&&<><span className={`live-label ${paused?'is-paused':''}`}><span className="status-dot"/>{labels[run.phase]}</span><button className="icon-button" aria-label="项目详细进度" onClick={onDetails}><ArrowUpRight size={17}/></button></>}<details className="context-drawer group-details"><summary>项目详情<ChevronDown size={13}/></summary><div className="project-context">
   <div className="context-title">项目上下文<span>LIVE RECORD</span></div>
   <section className="context-section"><h3>当前任务</h3>{run?<><span className={`context-state ${paused?'warning':''}`}>{labels[run.phase]}</span><details className="context-goal"><summary>{run.goal.slice(0,68)}{run.goal.length>68?'…':''}</summary><SafeMarkdown text={run.goal}/></details><div className="context-progress"><span>{run.completedTaskIds.length} / {run.tasks.length||'待规划'} 个任务完成</span><div><i style={{width:run.tasks.length?`${run.completedTaskIds.length/run.tasks.length*100}%`:'0%'}}/></div></div>{run.tasks.map((t,i)=><div className="context-task" key={t.id}><span className={run.completedTaskIds.includes(t.id)?'done':i===run.taskIndex?'current':''}>{run.completedTaskIds.includes(t.id)?<Check size={12}/>:i+1}</span><strong>{t.id}</strong><small>{run.completedTaskIds.includes(t.id)?'完成':i===run.taskIndex?'当前':'待前置'}</small></div>)}<button className="text-button" onClick={onDetails}>查看任务、Diff 与测试<ArrowUpRight size={13}/></button></>:<p>创建项目后显示真实任务及依赖。</p>}</section>
   <section className="context-section"><h3>Agent 状态</h3>{[['Claude Code',run&&['planning','review'].includes(run.phase)],['Codex',run?.phase==='executing'],['Controller',run&&['verify','applying'].includes(run.phase)]].map(([name,working])=><div className="context-agent" key={String(name)}><span>{name}</span><small className={working?'working':''}>{working?'处理中':'等待'}</small></div>)}<div className="activity-age"><Clock3 size={12}/>{age===null?'尚无活动':`最近活动距今 ${age<60?age+' 秒':Math.floor(age/60)+' 分钟'}`}</div><p className="capability-note">{capabilities?.claudeStreaming?'CC 流式公开事件已启用':'CC 当前仅展示阶段与最终结构化输出'}。Codex 仅显示 SDK 公开事件；隐藏思维链不可获取。</p></section>
   {run&&<section className="context-section"><h3>调用预算</h3><div className="context-budget"><div><span>Claude Code</span><strong>{run.claudeCalls}<small> / {run.config.maxClaudeCalls}</small></strong></div><div><span>Codex</span><strong>{run.loops}<small> / {run.config.maxLoops}</small></strong></div></div><div className="context-detail"><span>当前任务返工剩余</span><strong>{reworkRemaining}</strong></div>{profile?.globalBudget&&<div className="context-detail"><span>全局 CC 剩余</span><strong>{profile.globalBudget.remaining}</strong></div>}<p>预算调整与聊天分开；本页不扩大已授权额度。</p></section>}
   <section className="context-section"><h3>证据与交付</h3><div className="context-detail"><span>可信截图</span><strong>{pictures.length}</strong></div>{run&&<button className="button secondary full-width" onClick={onDelivery}><ShieldCheck size={14}/>进入正式成果交付</button>}<p>阶段验收、恢复和交付审批是不同决定。</p></section>
  </div>
</details></div></header>
   <div className="conversation-toolbar"><span><span className={`connection-dot ${connected?'':'offline'}`}/>{connected?'本地记录已连接':'本地记录连接中断，保留已加载消息'}</span><select aria-label="筛选群聊角色" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部成员与系统事件</option><option value="user">你</option><option value="claude">Claude Code</option><option value="codex">Codex</option><option value="controller">Controller</option></select><button className="text-button" onClick={()=>setFollow(!follow)}>{follow?<Pause size={12}/>:<Play size={12}/>} {follow?'暂停滚动':'继续跟随'}</button></div>
   <div className="chat-feed" ref={feed} onScroll={()=>{const el=feed.current;if(el&&el.scrollHeight-el.scrollTop-el.clientHeight>90)setFollow(false);}}>
    {!run?<div className="conversation-empty"><div className="empty-people"><span className="person-icon user">你</span><span className="person-icon claude">C</span><span className="person-icon codex">X</span></div><h3>目标在这里，协作从这里开始</h3><p>你提出目标，Claude Code 规划与审查，Codex 负责执行。<br/>Controller 独立验证，重要决定由你作出。</p><div className="empty-suggestions"><span>明确目标</span><span>查看真实过程</span><span>批准具体成果</span></div></div>:<>
     <div className="thread-origin"><ShieldCheck size={13}/>项目记录来自持久化审计；角色输出不代表隐藏思维链。</div>
     {filtered.length>visible&&<button className="older-messages" onClick={()=>setVisible(v=>v+60)}>查看更早的 {Math.min(60,filtered.length-visible)} 条消息</button>}
     {filtered.slice(-visible).map(m=><Message key={m.id} message={m}/>)}
     {!messages.length&&<div className="conversation-empty"><MessageSquare size={28}/><p>{connected?'等待实际事件；不会补造 Agent 发言。':'正在重新读取持久化消息…'}</p></div>}
    </>}
   </div>
   {!follow&&<button className="jump-latest" onClick={()=>setFollow(true)}><ArrowDown size={13}/>回到最新消息</button>}
   {error&&<div className="conversation-feedback error" role="alert"><TriangleAlert size={14}/><span>{error}</span><button className="icon-button" aria-label="关闭群聊错误" onClick={()=>setError('')}><X size={13}/></button></div>}
   {notice&&<div className="conversation-feedback" role="status"><CheckCircle2 size={14}/>{notice}</div>}
   <footer className="conversation-composer"><div className="composer-heading"><span>{run?mode==='note'?'补充需求':mode==='visual'?'本阶段视觉决策':mode==='rework'?'修改与返工决策':'恢复决策':'新项目目标'}</span>{run&&<select aria-label="消息用途" value={mode} onChange={e=>{setMode(e.target.value as typeof mode);setAttest(false);}}><option value="note">仅记录补充需求</option><option value="resume" disabled={!canResume}>恢复 / 决策</option><option value="visual" disabled={!canResume||!relevant.length}>视觉验收确认</option><option value="rework" disabled={!reworkEligible}>修改与返工</option></select>}</div>
    {mode==='visual'&&<label className="visual-attestation"><input type="checkbox" checked={attest} disabled={!checked.length} onChange={e=>setAttest(e.target.checked)}/>我已查看本阶段所选截图，确认视觉达标；不包含交付授权</label>}
    <textarea id="group-input" value={text} maxLength={5000} onChange={e=>setText(e.target.value)} placeholder={!run?'描述新项目目标，下一步核对仓库和预算…':mode==='note'?'补充想法或需求；先记录，不会改变正在执行的任务…':'请给出明确决定及理由，随后通过正式恢复确认…'}/>
    <div className="composer-bottom"><span><ShieldCheck size={12}/>{mode==='note'&&run?'已记录 ≠ 已生效；普通消息不能批准交付':!run?'发送后进入仓库和预算确认，不直接调用 Agent':'使用原 Controller 恢复接口；预算和会话不重置'}</span><button className="button primary" disabled={busy||!text.trim()||(mode!=='note'&&!canResume)||(mode==='visual'&&(!attest||!checked.length))||(mode==='rework'&&!reworkEligible)} onClick={()=>void send()}><Send size={14}/>{busy?'处理中…':!run?'配置并创建项目':mode==='note'?'记录消息':'提交正式决策'}</button></div>
   </footer>
  </section>
  {paused&&<section className="decision-workbench"><div className="decision-heading"><div><span className="eyebrow">YOUR DECISION</span><h3>需要你参与的节点</h3></div><span className="pending-label">运行保持暂停</span></div><div className="decision-columns"><div><h4>暂停原因与当前决定</h4><Text text={run?.reason??''}/><div className="decision-options"><button className="button secondary" disabled={!canResume||!relevant.length} onClick={()=>setMode('visual')}><ImageIcon size={14}/>确认本阶段视觉验收</button><button className="button secondary" disabled={!reworkEligible} onClick={()=>setMode('rework')}><Code2 size={14}/>提出修改并返工</button><button className="text-button" onClick={()=>{setMode('note');setNotice('保持暂停；未发起恢复或交付授权。');}}>保持暂停</button></div><p className="decision-limits">CC 剩余 {Math.max(0,(run?.config.maxClaudeCalls??0)-(run?.claudeCalls??0))}，Codex 剩余 {Math.max(0,(run?.config.maxLoops??0)-(run?.loops??0))}；当前任务返工剩余 {reworkRemaining}。</p></div><div><h4>测试结果与 CC 审查</h4><div className="decision-test-status">独立验证：{run?.evidence?run.evidence.passed?'通过':'未通过':'待执行'} · 执行退出码 {run?.executorExitCode}</div>{recentReview?<ReviewSections text={recentReview.text}/>:<p>当前节点没有新的 CC 审查结论；不会沿用前一任务的结论。</p>}</div></div></section>}
  {pictures.length>0&&<section className="gallery-panel"><div className="gallery-heading"><div><span className="eyebrow">TRUSTED SCREENSHOTS</span><h3>截图与视觉证据</h3></div><span>仅通过路径与哈希核验的 PNG · 未自动传入 CC</span></div><div className="gallery-strip">{pictures.slice(-18).map(p=><button key={p.id} className={`gallery-thumb ${viewed.includes(p.id)?'viewed':''}`} onClick={()=>openImage(p)}>{image(p)}<span>{p.taskId??'验证'} · {p.width}×{p.height}</span><small>{p.name}</small></button>)}</div></section>}
  {zoom&&picture&&<div className="image-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setZoom(false);}}><section className="image-viewer" role="dialog" aria-modal="true" aria-label="可信截图查看"><header><div><strong>{picture.taskId} · {picture.name}</strong><span>{picture.width}×{picture.height} · {picture.source}</span></div><button className="text-button" disabled={!previous} onClick={()=>setCompare(!compare)}>{compare?'单图查看':'与前阶段对比'}</button><button className="icon-button" aria-label="关闭截图" onClick={()=>setZoom(false)}><X size={18}/></button></header><div className={`image-comparison ${compare&&previous?'two':''}`}>{compare&&previous&&<figure><figcaption>{previous.taskId} · 前阶段</figcaption>{image(previous)}</figure>}<figure><figcaption>{picture.taskId} · 当前证据</figcaption>{image(picture,true)}</figure></div><footer><time>{new Date(picture.time).toLocaleString('zh-CN')}</time><code>SHA-256 {picture.hash}</code><span>查看图片不等于确认验收；在决策输入区明确确认。</span></footer></section></div>}
 </div>;
}
