import React,{useState} from 'react';
import {Check,ArrowRight,SlidersHorizontal} from 'lucide-react';
import {timeOptions,tokenOptions,type TaskPreferences,type ClarificationQuestion} from '../../src/task-agreement.js';
import './task-agreement.css';

type Props={resources?:import('../../src/resource-control.js').ResourceState;questions:ClarificationQuestion[];preferences?:TaskPreferences;busy:boolean;ready:boolean;running?:boolean;onAnswer:(text:string)=>Promise<void>;onConfirm:(value:TaskPreferences)=>Promise<void>};
export default function TaskAgreementCard({resources,questions,preferences,busy,ready,running,onAnswer,onConfirm}:Props){
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const [notes,setNotes]=useState('');
 const [time,setTime]=useState<TaskPreferences['time']>(preferences?.time??'medium');
 const [tokens,setTokens]=useState<TaskPreferences['tokens']>(preferences?.tokens??'medium');
 const [details,setDetails]=useState(preferences?.notes??'');
 const [activeMs,setActiveMs]=useState<number|null>(preferences?.limits?.activeMs??null);
 const [tokenLimit,setTokenLimit]=useState<number|null>(preferences?.limits?.tokens??null);
 const [expanded,setExpanded]=useState(!running);
 const [submitting,setSubmitting]=useState(false);
 const disabled=busy||submitting;
 const answered=questions.every(q=>Boolean(answers[q.id]?.trim()))||Boolean(notes.trim());
 const submit=async()=>{setSubmitting(true);try{
  if(questions.length)await onAnswer(questions.map(q=>q.title+'：'+(answers[q.id]??'请结合补充说明判断')).join('\n')+(notes.trim()?'\n补充说明：'+notes.trim():''));
  else{await onConfirm({time,tokens,notes:details.trim(),limits:{activeMs,tokens:tokenLimit}});if(running)setExpanded(false);}
 }finally{setSubmitting(false);}};
 return <section className="task-agreement" aria-label={running?'调整本次任务投入':'确认本次任务'}>
  <button type="button" className="task-agreement-heading" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}><SlidersHorizontal size={17}/><strong>{running?'本次投入 · 随时调整':questions.length?'先确定你的需求':'确认方案与投入'}</strong><span>{expanded?'收起':'展开'}</span></button>
  {expanded&&<div className="task-agreement-body">
   {resources&&<p className="task-agreement-hint">已累计运行 {Math.ceil(resources.activeMs/60000)} 分钟；已知 Token 至少 {resources.knownTokens.toLocaleString()}。{resources.unknownCalls>0?'存在 '+resources.unknownCalls+' 次不完整用量记录。':''}运行中用量将在调用结束后更新。</p>}
   {questions.length>0?<>
    <p className="task-agreement-hint">点选适合你的方向，也可以只填写补充说明。</p>
    {questions.map((q,index)=><fieldset key={q.id} disabled={disabled}><legend><span>{index+1}</span>{q.title}</legend><div className="task-agreement-options">{q.options.map((option,i)=><label key={i} className={answers[q.id]===option.label?'selected':''}><input type="radio" name={'question-'+q.id} checked={answers[q.id]===option.label} onChange={()=>setAnswers({...answers,[q.id]:option.label})}/><span><strong>{option.label}{i===q.recommended&&<em>推荐</em>}</strong><small>{option.description}</small></span>{answers[q.id]===option.label&&<Check size={15}/>}</label>)}</div></fieldset>)}
    <label className="task-agreement-note">补充说明（可选）<textarea disabled={disabled} value={notes} maxLength={2000} onChange={e=>setNotes(e.target.value)} placeholder="选项没有覆盖你的想法？在这里补充。"/></label>
   </>:<>
    <p className="task-agreement-hint">{running?'调整只影响剩余工作，已用时间与用量不会重置。':'请查看上方方案，再选择本次投入。目标完成即可提前收尾。'}</p>
    {[{title:'愿意投入多少时间？',options:timeOptions,value:time,set:setTime},{title:'希望怎样使用 Token？',options:tokenOptions,value:tokens,set:setTokens}].map(group=><fieldset key={group.title} disabled={disabled}><legend>{group.title}</legend><div className="task-agreement-options effort-options">{group.options.map(option=><label key={option.value} className={group.value===option.value?'selected':''}><input type="radio" name={group.title} checked={group.value===option.value} onChange={()=>group.set(option.value)}/><span><strong>{option.label}{option.value==='medium'&&<em>推荐</em>}</strong><small>{option.description}</small></span></label>)}</div></fieldset>)}
    <label className="task-agreement-note">补充要求（可选）<textarea disabled={disabled} value={details} maxLength={2000} onChange={e=>setDetails(e.target.value)} placeholder="例如：先完成核心流程，其余留到下一次。"/></label>
    <fieldset disabled={disabled}><legend>最长累计运行时间</legend><div className="task-agreement-options effort-options">{[{value:null,label:'不限'},{value:1800000,label:'30 分钟'},{value:7200000,label:'2 小时'},{value:86400000,label:'24 小时'}].map(option=><label key={String(option.value)} className={activeMs===option.value?'selected':''}><input type="radio" name="active-time-limit" checked={activeMs===option.value} onChange={()=>setActiveMs(option.value)}/><span><strong>{option.label}</strong></span></label>)}</div></fieldset>
    <fieldset disabled={disabled}><legend>Token 调用边界阈值</legend><div className="task-agreement-options effort-options">{[{value:null,label:'不限'},{value:100000,label:'10 万'},{value:1000000,label:'100 万'},{value:5000000,label:'500 万'}].map(option=><label key={String(option.value)} className={tokenLimit===option.value?'selected':''}><input type="radio" name="token-limit" checked={tokenLimit===option.value} onChange={()=>setTokenLimit(option.value)}/><span><strong>{option.label}</strong></span></label>)}</div></fieldset>
    <p className="task-agreement-hint">时间累计模型及其工具运行，正常暂停不计时。Token 含输入、输出与缓存输入；在调用边界检查，单次调用可能超出阈值，计量不完整时暂停。上限调整不清零历史消耗；暂停后需点继续。档位仍只指导规划。</p>
   </>}
   <button type="button" className="task-agreement-submit" disabled={disabled||(questions.length?!answered:!ready)} onClick={()=>void submit()}>{submitting?'正在提交…':questions.length?'提交选择':running?'应用到当前任务':'确认并开始开发'}<ArrowRight size={16}/></button>
  </div>}
 </section>;
}
