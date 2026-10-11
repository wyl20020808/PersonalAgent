import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {FileCode2,GitCompareArrows,LoaderCircle,Maximize2,Minimize2,RefreshCw} from 'lucide-react';
import hljs from 'highlight.js/lib/common';
import {messageFiles,parseFileChanges,recordedDiff,findFileChange,type DiffLine,type FileChange} from './fileChanges.js';
import type {ChatFilePreview,ChatMessage} from './types.js';
import './file-preview.css';

export const FilePreviewContext=createContext<{openFile?:(message:ChatMessage,path:string)=>void;openChanges?:(message:ChatMessage)=>void;expandPreview?:(wide:boolean)=>void;messages:ChatMessage[];roots?:string[]}>({messages:[]});
function Stats({added,removed}:{added:number;removed:number}){return <span className="file-change-stats" aria-label={`新增 ${added} 行，删除 ${removed} 行`}><b className="added">+{added}</b><b className="removed">−{removed}</b></span>;}
function Totals({files,incomplete}:{files:FileChange[];incomplete?:boolean}){return files.length?<span className="file-change-total"><small>{incomplete?'展示范围内的文本行数':files.some(file=>file.notice)?'文本行数':''}</small><Stats added={files.reduce((n,file)=>n+file.added,0)} removed={files.reduce((n,file)=>n+file.removed,0)}/></span>:<small>未提供完整文本 diff</small>;}
export function FileCards({message}:{message:ChatMessage}){
 const [expanded,setExpanded]=useState(false);
 const {openFile,messages,roots}=useContext(FilePreviewContext),paths=useMemo(()=>messageFiles(message),[message]),record=useMemo(()=>recordedDiff(messages,message),[messages,message]),changes=parseFileChanges(record?.message.details?.diff??'');
 if(!paths.length)return null;
 return <details className="chat-file-list" onToggle={event=>setExpanded(event.currentTarget.open)}><summary><FileCode2 size={15}/><span>文件列表 · {paths.length} 个文件{message.details?.diffTruncated?'（部分）':''}</span><span className="chat-file-toggle">{expanded?'收起':'展开'}</span></summary>{expanded&&<div className="chat-file-cards">{paths.map(path=>{const change=findFileChange(changes,path,roots),name=path.replaceAll('\\','/').split('/').at(-1);return <button type="button" className="chat-file-card" key={path} disabled={!openFile} onClick={()=>openFile?.(message,path)} title={'查看文件或变更 · '+path+(record?' · '+record.scope:'')}><FileCode2 size={16}/><span className="chat-file-path"><strong>{name}</strong><small>{path}</small></span>{change&&!change.notice&&<Stats added={change.added} removed={change.removed}/>}</button>;})}</div>}</details>;
}
export function ChangesButton({message}:{message:ChatMessage}){
 const {openChanges}=useContext(FilePreviewContext),files=useMemo(()=>parseFileChanges(message.details?.diff??''),[message.details?.diff]);
 return <button type="button" className="chat-changes-button" disabled={!openChanges} onClick={()=>openChanges?.(message)}><GitCompareArrows size={15}/>查看本次变更<span>{files.length?`${message.details?.diffTruncated?'部分 · ':''}${files.length} 个文件`:'变更摘要'}</span><Totals files={files} incomplete={message.details?.diffTruncated}/></button>;
}
export function ChangesPreview({message}:{message:ChatMessage}){
 const {openFile}=useContext(FilePreviewContext),files=useMemo(()=>parseFileChanges(message.details?.diff??''),[message.details?.diff]);
 return <section className="file-review changes-overview" aria-label="本次文件变更"><div className="file-review-toolbar"><strong>{files.length?`本次变更 · ${message.details?.diffTruncated?'部分 · ':''}${files.length} 个文件`:'变更摘要'}</strong><Totals files={files} incomplete={message.details?.diffTruncated}/></div><div className="file-review-scope">{recordedDiff([message],message)?.scope??'该条事件的变更证据'} · 第 {message.loop} 轮{message.details?.diffTruncated?' · diff 已截断，文件数与行数不是完整统计':''}</div>{files.map((file,index)=><details className="change-file-section" key={file.path} open={index===0}><summary><FileCode2 size={16}/><strong>{file.path}</strong>{!file.notice&&<Stats added={file.added} removed={file.removed}/>}</summary><button className="change-open-file" onClick={()=>openFile?.(message,file.path)}>查看当前文件</button>{file.notice?<p className="file-review-empty">{file.notice}</p>:<CodeRows lines={file.lines} path={file.path}/>}</details>)}{!files.length&&<><p className="file-review-empty">该记录未提供可展开的完整文本 diff；保留原始摘要。</p><pre className="file-review-note">{message.details?.diff}</pre></>}</section>;
}
const languages:Record<string,string>={js:'javascript',mjs:'javascript',cjs:'javascript',jsx:'javascript',ts:'typescript',tsx:'typescript',cpp:'cpp',h:'cpp',hpp:'cpp',c:'c',py:'python',json:'json',css:'css',html:'xml',xml:'xml',md:'markdown',yml:'yaml',yaml:'yaml',sh:'bash',cs:'csharp',rs:'rust',ini:'ini'};
function CodeRows({lines,path}:{lines:DiffLine[];path:string}){
 const [page,setPage]=useState(0),size=400;
 useEffect(()=>setPage(0),[lines]);
 const language=languages[path.split('.').at(-1)?.toLowerCase()??''];
 const visibleLines=useMemo(()=>lines.filter(line=>line.kind!=='header'||line.text.startsWith('@@')),[lines]);
 const rendered=useMemo(()=>visibleLines.slice(page*size,(page+1)*size).map((line,index)=>{
  const code=line.kind==='header'?line.text:line.text.slice(1),html=language&&hljs.getLanguage(language)&&code.length<12000?hljs.highlight(code,{language,ignoreIllegals:true}).value:undefined;
  return <div className={`code-review-line line-${line.kind}`} key={index}><span className="code-line-number">{line.oldLine??''}</span><span className="code-line-number">{line.newLine??''}</span><span className="code-line-sign">{line.kind==='add'?'+':line.kind==='remove'?'−':''}</span>{html!==undefined?<code dangerouslySetInnerHTML={{__html:html||' '}}/>:<code>{code||' '}</code>}</div>;
 }),[visibleLines,page,language]);
 return <><div className="code-review-scroll" tabIndex={0} aria-label="代码与行号"><div className="code-review-lines">{rendered}</div></div>{visibleLines.length>size&&<div className="code-review-pagination"><button disabled={!page} onClick={()=>setPage(value=>value-1)}>上一页</button><span>{page+1} / {Math.ceil(visibleLines.length/size)} 页</span><button disabled={(page+1)*size>=visibleLines.length} onClick={()=>setPage(value=>value+1)}>下一页</button></div>}</>;
}
export default function FilePreview({message,path,profileId}:{message:ChatMessage;path:string;profileId?:string}){
 const {expandPreview}=useContext(FilePreviewContext);
 useEffect(()=>()=>expandPreview?.(false),[expandPreview]);
 const [data,setData]=useState<ChatFilePreview>(),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0),[mode,setMode]=useState<'file'|'diff'>('diff'),[wide,setWide]=useState(false);
 useEffect(()=>{
  let live=true;setLoading(true);setError('');setData(undefined);
  if(!profileId){setError('该文件事件缺少 Run 配置，无法读取。');setLoading(false);return;}
  void window.personalAgent.invoke<ChatFilePreview>({operation:'readChatFile',profileId,runId:message.runId,messageId:message.id,file:path}).then(value=>{if(live){setData(value);if(!value.change)setMode('file');}}).catch(reason=>{if(live)setError(reason.message);}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[profileId,message.id,message.runId,path,reload]);
 const contentLines=useMemo<DiffLine[]>(()=>{const rows=data?.file?.text?.split('\n')??[];if(rows.at(-1)==='')rows.pop();return rows.map((text,index)=>({kind:'context',text:' '+text,newLine:index+1}));},[data?.file?.text]);
 return <section className="file-review" aria-label="文件与变更预览" data-expanded={wide}>
  <div className="file-review-toolbar"><div className="file-review-modes" role="tablist" aria-label="文件查看方式"><button role="tab" aria-selected={mode==='file'} onClick={()=>setMode('file')}><FileCode2 size={15}/>文件</button><button role="tab" aria-selected={mode==='diff'} onClick={()=>setMode('diff')}><GitCompareArrows size={15}/>变更</button></div><div className="file-review-actions"><button aria-label="刷新文件预览" title="刷新预览" onClick={()=>setReload(value=>value+1)} disabled={loading}><RefreshCw size={15}/></button><button aria-label={wide?'缩窄文件预览':'展开文件预览'} title={wide?'缩窄':'展开'} onClick={()=>{expandPreview?.(!wide);setWide(!wide);}}>{wide?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button></div></div>
  {loading?<div className="file-review-empty" role="status"><LoaderCircle size={18} className="spin"/>读取文件与变更…</div>:error?<p role="alert" className="project-explorer-error">{error}</p>:data&&<>
   <div className="file-review-scope">{mode==='diff'?data.scope:'当前工作区文件内容'}{message.taskId?' · '+message.taskId:''}{message.loop?' · 第 '+message.loop+' 轮':''}</div>
   <div className="file-review-heading"><FileCode2 size={16}/><strong title={data.path}>{data.path}</strong>{data.change&&!data.change.notice&&<Stats added={data.change.added} removed={data.change.removed}/>}</div>
   {mode==='diff'?data.change?data.change.notice?<p className="file-review-empty">{data.change.notice}</p>:<CodeRows lines={data.change.lines} path={data.path}/>:<p className="file-review-empty">{data.notice??'没有可用的文本变更。'}</p>:data.file?.dataUrl?<img className="file-review-image" src={data.file.dataUrl} alt={data.path}/>:data.file?.text!==undefined?<><CodeRows lines={contentLines} path={data.path}/>{data.file.truncated&&<p className="file-review-note">内容已截断到 200,000 字符。</p>}</>:<p className="file-review-empty">{data.contentError??'文件内容不可用。'}</p>}
   {data.evidenceId&&mode==='diff'&&<small className="file-review-note">修改证据来自 {data.evidenceId}；文件页展示当前内容。</small>}
  </>}
 </section>;
}
