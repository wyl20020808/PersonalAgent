import React,{useEffect,useRef,useState} from 'react';
import {File,Folder,LoaderCircle,X} from 'lucide-react';
import type {ProjectFile} from './types.js';
type Listing={entries:{name:string;directory:boolean}[];truncated:boolean};
export default function ProjectExplorer({projectPath}:{projectPath?:string}) {
 const [directory,setDirectory]=useState(''),[query,setQuery]=useState('');
 const [listing,setListing]=useState<Listing>({entries:[],truncated:false});
 const [selected,setSelected]=useState<ProjectFile|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const request=useRef(0);
 useEffect(()=>{
  const id=++request.current;setSelected(null);setError('');setQuery('');setLoading(true);
  if(!projectPath){setListing({entries:[],truncated:false});setLoading(false);return;}
  void window.personalAgent.invoke<Listing>({operation:'listProjectFiles',projectPath,file:directory}).then(value=>{if(request.current===id)setListing(value);}).catch(e=>{if(request.current===id){setListing({entries:[],truncated:false});setError(e.message);}}).finally(()=>{if(request.current===id)setLoading(false);});
  return()=>{request.current++;};
 },[projectPath,directory]);
 const open=async(name:string)=>{
  const id=++request.current;setSelected(null);setError('');setLoading(true);
  try{const value=await window.personalAgent.invoke<ProjectFile>({operation:'readProjectFile',projectPath,file:directory?directory+'/'+name:name});if(request.current===id)setSelected(value);}
  catch(e){if(request.current===id)setError((e as Error).message);}
  finally{if(request.current===id)setLoading(false);}
 };
 const files=listing.entries.filter(item=>item.name.toLowerCase().includes(query.toLowerCase()));
 return <section className="project-explorer" aria-label="项目文件">
  <div className="project-explorer-heading"><strong>项目文件</strong><span>只读</span></div>
  {directory&&<button className="text-button" onClick={()=>setDirectory(directory.split('/').slice(0,-1).join('/'))}>← 上一级 · {directory}</button>}
  <input aria-label="搜索当前目录" value={query} onChange={event=>setQuery(event.target.value)} placeholder="筛选当前目录"/>
  {loading&&<div role="status" className="composer-progress"><LoaderCircle size={14} className="spin"/>读取中…</div>}
  <div className="project-explorer-list">{files.map(item=><button type="button" key={item.name} title={item.name} onClick={()=>item.directory?setDirectory(directory?directory+'/'+item.name:item.name):void open(item.name)}>{item.directory?<Folder size={13}/>:<File size={13}/>} {item.name}</button>)}{!loading&&!files.length&&<small>{projectPath?'当前目录没有匹配项':'选择项目后查看文件'}</small>}</div>
  {listing.truncated&&<small>仅显示当前目录前 1,000 项。</small>}
  {error&&<p className="project-explorer-error" role="alert">{error}</p>}
  {selected&&<div className="project-file-preview"><div><strong title={selected.path}>{selected.path}</strong><button type="button" onClick={()=>{request.current++;setSelected(null);setLoading(false);}} aria-label="关闭预览"><X size={14}/></button></div>{selected.dataUrl?<img src={selected.dataUrl} alt={selected.path}/>:<pre>{selected.text}</pre>}{selected.truncated&&<small>内容已截断到 200,000 字符</small>}</div>}
 </section>;
}
