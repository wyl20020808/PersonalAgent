/** Route by verified runtime state; the existing Agent interprets the user's actual request. */
export function chatRoute(text:string,run?:{phase:string;active?:boolean;nextPhase?:string;manualAcceptanceDigest?:string|null;failure?:{recoverable:boolean}|null},hasAttachments=false):'start'|'queue'|'stop'|'hold'|'resume'|'rework'|'accept'|'acknowledge'{
 const value=text.trim().replace(/[。！!]+$/,'').trim();
 if(!hasAttachments&&/^(停止|暂停|先停一下|停止任务|暂停任务|不要继续|stop|pause)$/i.test(value))return run?'stop':'acknowledge';
 if(!hasAttachments&&/^(保持暂停|先别执行|暂时不要执行)$/i.test(value))return 'hold';
 if(run&&(run.active||['planning','execute','executing','applying','verify','review'].includes(run.phase)))return 'queue';
 if(run&&['paused','failed','stopped'].includes(run.phase)){
  if(run.manualAcceptanceDigest&&!hasAttachments&&/^(验收通过|确认验收通过|确认当前成果|接受当前成果|当前任务验收通过|我确认当前成果符合要求)$/i.test(value))return 'accept';
  // Short continuation answers resume the saved checkpoint. Substantive instructions go back
  // through Execute when that checkpoint supports rework; no UI intent selector is required.
  if(!hasAttachments&&/^(好[的]?|可以|请?(继续|继续执行|恢复|恢复执行|重试|重新验收|重新测试)|ok|yes)$/i.test(value))return 'resume';
  return ['execute','verify','review'].includes(run.nextPhase??'')?'rework':'resume';
 }
 if(!hasAttachments&&/^(好[的]?|继续|可以|谢谢|收到|批准|同意|ok|yes)$/i.test(value))return 'acknowledge';
 return 'start';
}
