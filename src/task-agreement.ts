/** User choices are preferences, never permission grants or enforced usage limits. */
export type Effort = 'low' | 'medium' | 'high';
export type TaskPreferences = {time:Effort;tokens:Effort;notes:string};
export type ClarificationQuestion = {id:string;title:string;options:{label:string;description:string}[];recommended:number};
export const taskPreferencesSchema={type:'object',additionalProperties:false,required:['time','tokens','notes'],properties:{time:{enum:['low','medium','high']},tokens:{enum:['low','medium','high']},notes:{type:'string',maxLength:2000}}};
export const clarificationQuestionsSchema={type:'array',maxItems:3,items:{type:'object',additionalProperties:false,required:['id','title','options','recommended'],properties:{id:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,60}$'},title:{type:'string',minLength:1,maxLength:240},options:{type:'array',minItems:2,maxItems:4,items:{type:'object',additionalProperties:false,required:['label','description'],properties:{label:{type:'string',minLength:1,maxLength:80},description:{type:'string',minLength:1,maxLength:240}}}},recommended:{type:'integer',minimum:0,maximum:3}}}};
export const timeOptions = [
 {value:'low' as const,label:'快速完成',description:'优先核心结果，减少扩展探索'},
 {value:'medium' as const,label:'标准投入',description:'完成主要功能与必要验证'},
 {value:'high' as const,label:'深入开发',description:'允许较长开发与多轮完善'}
];
export const tokenOptions = [
 {value:'low' as const,label:'节省',description:'减少方案比较与重复调用'},
 {value:'medium' as const,label:'均衡',description:'兼顾成果质量与调用消耗'},
 {value:'high' as const,label:'充分投入',description:'允许更多探索和迭代，仍避免空转'}
];
export function preferenceText(value:TaskPreferences):string {
 return `时间投入：${timeOptions.find(x=>x.value===value.time)!.label}；Token 投入：${tokenOptions.find(x=>x.value===value.tokens)!.label}。\n补充要求：${value.notes.trim()||'无'}\n以上是规划偏好，不是精确耗时承诺或已实现的 Token 硬上限。投入增减不重置已用时间与用量，不扩大权限。保留已验收成果，只调整剩余工作；达到目标即收尾，不为用满投入制造任务。必要验证不能省略。`;
}
export const clarificationGuidance='用户只是讨论问题时直接回答，不强制问卷。对于开发需求，先澄清用户真正需要的成果、使用场景、范围和完成标准，再形成候选方案。已明确的信息不要重复问，只问影响方向或投入的重要问题，技术细节自主决定。优先给可点击选项：questions 每次最多三个具体问题，每题二至四个互斥选项，description 说明取舍，recommended 是推荐选项下标；用户可自由补充。不要在 reply 中用长问卷替代 questions。没有必要问题时 questions 返回空数组。时间与 Token 档位由界面供用户选择；根据任务给出带不确定性的估计范围，不承诺精确消耗。plan 包含目标、范围、完成标准、估计投入与授权边界；仍缺关键方向时 plan 为空。用户确认方案与投入后才开始执行。';
