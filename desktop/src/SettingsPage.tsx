import React,{useId,useState} from 'react';
import {FolderGit2,Info,Palette,Plus,RefreshCw,Settings2,Zap} from 'lucide-react';
import type {Overview,Request} from './types.js';
import './settings.css';

type Props={overview:Overview;busy:boolean;onRequest:(request:Request)=>void;onRefresh:()=>void;onPrepareMock:()=>void};
const categories=[
 {id:'general',label:'常规',icon:Settings2},
 {id:'automation',label:'自动开发',icon:Zap},
 {id:'appearance',label:'外观',icon:Palette},
 {id:'profiles',label:'可信配置',icon:FolderGit2},
] as const;
const time=(date:string)=>new Date(date).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});

function SettingTip({label,children}:{label:string;children:React.ReactNode}){
 const id=useId(),[open,setOpen]=useState(false);
 return <span className="settings-tip" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onBlur={()=>setOpen(false)} onKeyDown={event=>{if(event.key==='Escape'){setOpen(false);event.stopPropagation();}}}>
  <button type="button" className="settings-info" aria-label={`${label}说明`} aria-describedby={open?id:undefined} aria-expanded={open} onFocus={()=>setOpen(true)} onClick={()=>setOpen(true)}><Info size={15}/></button>
  {open&&<span id={id} role="tooltip" className="settings-tooltip">{children}</span>}
 </span>;
}

function SettingRow({label,tip,children}:{label:string;tip:string;children:React.ReactNode}){
 return <div className="settings-row"><div className="settings-label"><span>{label}</span><SettingTip label={label}>{tip}</SettingTip></div><div className="settings-control">{children}</div></div>;
}

export default function SettingsPage({overview,busy,onRequest,onRefresh,onPrepareMock}:Props){
 const [category,setCategory]=useState<(typeof categories)[number]['id']>('general');
 const automatic=overview.automaticDevelopment;
 return <div className="settings-layout">
  <nav className="settings-nav" aria-label="设置分类">{categories.map(({id,label,icon:Icon})=><button type="button" key={id} className={category===id?'active':''} aria-current={category===id?'page':undefined} aria-controls="settings-content" onClick={()=>setCategory(id)}><Icon size={17}/>{label}</button>)}</nav>
  <section className="settings-content" id="settings-content" aria-labelledby="settings-title">
   <h2 id="settings-title">{categories.find(item=>item.id===category)!.label}</h2>
   {category==='general'&&<>
    <h3>工作方式</h3>
    <div className="settings-group">
     <SettingRow label="全局工作模式" tip={`工作 / 上课：AI 持续后台开发，桌面交互和 GUI 验收延后。空闲：允许经授权的桌面交互和 GUI 验收。各实例共用；独立 Codex 需另外安装并验证 Hook。${overview.interactionPolicy?.reason??''}`}>
      <select aria-label="全局工作模式" disabled={busy} value={overview.interactionPolicy?.mode??'work'} onChange={event=>onRequest({operation:'interactionMode',interactionMode:event.target.value as 'work'|'idle'})}><option value="work">工作 / 上课</option><option value="idle">空闲</option></select>
     </SettingRow>
     <SettingRow label="刷新状态" tip="重新读取本地 Controller、项目配置和开发会话状态。"><button type="button" className="button secondary" disabled={busy} onClick={onRefresh}><RefreshCw size={14} className={busy?'spin':''}/>刷新</button></SettingRow>
    </div>
   </>}
   {category==='automation'&&<>
    <h3>开发会话</h3>
    <div className="settings-group"><SettingRow label="全自动开发模式" tip="新任务先澄清目标和投入偏好，再由决策者自主处理普通问题；最后验收核对整体目标，未完成就追加任务。权限和明确保留的批准仍需用户。后台每 10 分钟检查异常恢复。关闭后不再启用新任务或后台接管；已启动任务保留本次模式，可用停止按钮终止。"><button type="button" className={`toggle ${automatic?.enabled?'on':''}`} role="switch" aria-label="全自动开发模式" aria-checked={automatic?.enabled??false} disabled={busy} onClick={()=>onRequest({operation:'automaticDevelopment',automaticDevelopment:!automatic?.enabled})}><span/></button></SettingRow></div>
    {(automatic?.lastScanAt||automatic?.error||automatic?.results.length)&&<details className="settings-details"><summary>最近巡检{automatic.lastScanAt&&<span>{time(automatic.lastScanAt)}</span>}</summary><div className="settings-details-body">
     <p>已委托 {automatic.results.filter(result=>result.status==='delegated').length} 个会话</p>
     {automatic.error&&<p className="settings-error" role="status">{automatic.error}</p>}
     {automatic.results.filter(result=>result.status!=='delegated').map(result=><p key={result.runId}>{result.runId.slice(0,8)}：{result.reason}</p>)}
    </div></details>}
   </>}
   {category==='appearance'&&<>
    <h3>动效</h3>
    <div className="settings-group"><SettingRow label="减少动态效果" tip="关闭页面和状态过渡，保留操作反馈。"><button type="button" className={`toggle ${overview.reducedMotion?'on':''}`} role="switch" aria-label="减少动态效果" aria-checked={overview.reducedMotion} disabled={busy} onClick={()=>onRequest({operation:'preferences',reducedMotion:!overview.reducedMotion})}><span/></button></SettingRow></div>
   </>}
   {category==='profiles'&&<>
    <div className="settings-section-heading"><h3>可信配置与授权项目</h3><SettingTip label="可信配置">已导入的项目配置，包含授权项目目录和 Agent 调用方式。安装状态仅表示本地工具存在，不代表认证或服务额度有效。导入后仍遵循项目权限与交付审批。</SettingTip><button type="button" className="button secondary" disabled={busy} onClick={()=>onRequest({operation:'importProfile'})}><Plus size={14}/>导入配置</button></div>
    {overview.profiles.length===0&&<p className="settings-empty">暂无可信配置，可导入已有项目配置。</p>}
    <div className="settings-group settings-profiles">{overview.profiles.map(profile=><div className="settings-profile" key={profile.id}>
     <div className="settings-profile-header"><FolderGit2 size={17}/><strong title={profile.name}>{profile.name}</strong><span className={`mode ${profile.mode==='mock'?'mock':''}`}>{profile.mode==='mock'?'MOCK · 演示':'REAL · 真实'}</span></div>
     <div className="settings-profile-meta">{profile.readOnly&&<span className="read-only">历史配置 · 只读</span>}<span>CC CLI {profile.availability.claude?'已安装':'未定位'} · SDK {profile.availability.codex?'已安装':'未定位'}</span><SettingTip label={`${profile.name}安装状态`}>{profile.availability.note}</SettingTip></div>
     <details className="settings-details"><summary>授权项目{profile.repositories.length>0&&<span>{profile.repositories.length} 个</span>}</summary><div className="settings-details-body">{profile.repositories.map(repository=><code key={repository}>{repository}</code>)}</div></details>
     {profile.globalBudget&&<details className="settings-details"><summary>历史调用记录（已停用）<span>{profile.globalBudget.used} / {profile.globalBudget.limit}</span></summary><div className="settings-details-body">{profile.globalBudget.reservations.length===0?<p>暂无调用预约记录</p>:profile.globalBudget.reservations.map((reservation,index)=><p key={index}>{reservation.role} · {reservation.runId.slice(0,8)} · #{reservation.call}<span> · {time(reservation.time)}</span></p>)}</div></details>}
    </div>)}</div>
    <button type="button" className="button secondary settings-mock" disabled={busy} onClick={onPrepareMock}><Plus size={15}/>准备独立 Mock 工作区</button>
   </>}
  </section>
 </div>;
}
