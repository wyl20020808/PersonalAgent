import React,{useState} from 'react';
import {Check,ArrowRight,SlidersHorizontal} from 'lucide-react';
import {timeOptions,tokenOptions,type TaskPreferences,type ClarificationQuestion} from '../../src/task-agreement.js';
import './task-agreement.css';

type Props={questions:ClarificationQuestion[];preferences?:TaskPreferences;busy:boolean;ready:boolean;running?:boolean;onAnswer:(text:string)=>Promise<void>;onConfirm:(value:TaskPreferences)=>Promise<void>};
export default function TaskAgreementCard({questions,preferences,busy,ready,running,onAnswer,onConfirm}:Props){
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const [notes,setNotes]=useState('');
 const [time,setTime]=useState<TaskPreferences['time']>(preferences?.time??'medium');
 const [tokens,setTokens]=useState<TaskPreferences['tokens']>(preferences?.tokens??'medium');
 const [details,setDetails]=useState(preferences?.notes??'');
 const [expanded,setExpanded]=useState(!running);
 const [submitting,setSubmitting]=useState(false);
 const disabled=busy||submitting;
 const answered=questions.every(q=>Boolean(answers[q.id]?.trim()))||Boolean(notes.trim());
 const submit=async()=>{setSubmitting(true);try{
  if(questions.length)await onAnswer(questions.map(q=>q.title+'：'+(answers[q.id]??'请结合补充说明判断')).join('\n')+(notes.trim()?'\n补充说明：'+notes.trim():''));
  else{await onConfirm({time,tokens,notes:details.trim()});if(running)setExpanded(false);}
 }finally{setSubmitting(false);}};
 return <section className="task-agreement" aria-label={running?'调整本次任务投入':'确认本次任务'}>
  <button type="button" className="task-agreement-heading" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}><SlidersHorizontal size={17}/><strong>{running?'本次投入 · 随时调整':questions.length?'先确定你的需求':'确认方案与投入'}</strong><span>{expanded?'收起':'展开'}</span></button>
  {expanded&&<div className="task-agreement-body">
   {questions.length>0?<>
    <p className="task-agreement-hint">点选适合你的方向，也可以只填写补充说明。</p>
    {questions.map((q,index)=><fieldset key={q.id} disabled={disabled}><legend><span>{index+1}</span>{q.title}</legend><div className="task-agreement-options">{q.options.map((option,i)=><label key={i} className={answers[q.id]===option.label?'selected':''}><input type="radio" name={'question-'+q.id} checked={answers[q.id]===option.label} onChange={()=>setAnswers({...answers,[q.id]:option.label})}/><span><strong>{option.label}{i===q.recommended&&<em>推荐</em>}</strong><small>{option.description}</small></span>{answers[q.id]===option.label&&<Check size={15}/>}</label>)}</div></fieldset>)}
    <label className="task-agreement-note">补充说明（可选）<textarea disabled={disabled} value={notes} maxLength={2000} onChange={e=>setNotes(e.target.value)} placeholder="选项没有覆盖你的想法？在这里补充。"/></label>
   </>:<>
    <p className="task-agreement-hint">{running?'调整只影响剩余工作，已用时间与用量不会重置。':'请查看上方方案，再选择本次投入。目标完成即可提前收尾。'}</p>
    {[{title:'愿意投入多少时间？',options:timeOptions,value:time,set:setTime},{title:'希望怎样使用 Token？',options:tokenOptions,value:tokens,set:setTokens}].map(group=><fieldset key={group.title} disabled={disabled}><legend>{group.title}</legend><div className="task-agreement-options effort-options">{group.options.map(option=><label key={option.value} className={group.value===option.value?'selected':''}><input type="radio" name={group.title} checked={group.value===option.value} onChange={()=>group.set(option.value)}/><span><strong>{option.label}{option.value==='medium'&&<em>推荐</em>}</strong><small>{option.description}</small></span></label>)}</div></fieldset>)}
    <label className="task-agreement-note">补充要求（可选）<textarea disabled={disabled} value={details} maxLength={2000} onChange={e=>setDetails(e.target.value)} placeholder="例如：先完成核心流程，其余留到下一次。"/></label>
    <p className="task-agreement-hint">档位用于指导规划，不是精确耗时承诺或 Token 硬上限。</p>
   </>}
   <button type="button" className="task-agreement-submit" disabled={disabled||(questions.length?!answered:!ready)} onClick={()=>void submit()}>{submitting?'正在提交…':questions.length?'提交选择':running?'应用到当前任务':'确认并开始开发'}<ArrowRight size={16}/></button>
  </div>}
 </section>;
}
