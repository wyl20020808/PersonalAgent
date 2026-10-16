/** Advisory allocations leave room for review; they never change user limits or acceptance. */
export function resourceAllocation(remaining:number|null,role:'plan'|'execute'|'review',remainingTasks:number){
 if(remaining===null)return undefined;
 const reviewReserveTokens=role==='execute'?Math.ceil(remaining*0.2):0;
 const suggestedCallTokens=role==='execute'?Math.floor((remaining-reviewReserveTokens)/Math.max(1,remainingTasks)):
  Math.floor(remaining*(role==='plan'?0.1:1));
 return {role,suggestedCallTokens,reviewReserveTokens,advisory:true,
  efficiency:'Batch independent reads and checks; use focused output. Reuse unchanged verification receipts. Avoid extra review agents or repeated tests unless concrete uncertainty warrants them. Do not skip required checks. If work exceeds this allocation, leave a recoverable checkpoint with completed work, evidence and remaining work; never report incomplete work as passed.'};
}

/** Workers receive the same Controller-authored budget as the prompt, before native suffixes. */
export function codexBudgetNotice(prompt:string):{afterTokens:number;text:string}|undefined{
 let budget:any;try{budget=JSON.parse(prompt).resourceBudget;}catch{return;}
 const allocation=budget?.allocation,target=allocation?.suggestedCallTokens;
 if(!Number.isSafeInteger(target)||target<=0||!Number.isSafeInteger(budget.remainingKnownTokens)||budget.remainingKnownTokens<=0)return;
 return {afterTokens:Math.max(1,Math.floor(Math.min(target,budget.remainingKnownTokens)*0.8)),
  text:`Controller resource reminder (not new user authorization): this call is nearing its suggested ${target} Token allocation; ${allocation.reviewReserveTokens??0} Tokens were suggested for subsequent review at dispatch. Finish the current safe step, run only necessary outstanding checks, then return a concise evidence-backed result or an honest partial checkpoint. Preserve files and Session. Do not invent completion, repeat unchanged checks, expand scope or increase user limits. This reminder is advisory, not a provider hard cap.`};
}
