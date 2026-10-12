import { createHash } from 'node:crypto';
import type { State } from './store.js';

export const SUPERVISION_INTERVAL_MS = 10 * 60 * 1000;
export const AUTOMATIC_DECISION = '全自动开发模式：用户等待超过十分钟，现将当前问题交回配置的决策者自主判断。先核查暂停原因、已有成果和原 Session，再决定如何继续原目标。可以自行处理目标内的实施取舍与可恢复异常；不得重复已完成操作、虚报验收、伪造用户批准、扩大目标或绕过工作模式、写入锁、权限、明确调用限制、正式交付及对外发布审批。无法安全解决时说明具体阻碍并保留现场。';

export type AutomaticResume = { expectedUpdatedAt: string };
export type SupervisionReceipt = { signature: string; attempts: number; lastAttemptAt: number };

// Both the desktop scan and the Controller use this guard. Unknown native work
// cannot become retryable simply because its Controller process disappeared.
export function supervisionBlock(state: State, durableResult = false): string | undefined {
  if (state.purpose === 'conversation-discussion') return '讨论会话需要用户明确开始开发';
  if (state.phase === 'completed') return '任务已完成';
  if (state.phase === 'stopped') return '用户已停止';
  if (state.phase === 'applying' || state.nextPhase === 'applying') return '提案应用中断需要人工核查';
  if (state.deferredTaskIds?.length) return '工作模式延后任务需要允许的验收环境';
  if ((state.nextPhase === 'execute' || state.nextPhase === 'planning') && !(state.phase === 'executing' && durableResult) && state.config.maxLoops !== undefined && state.loops >= state.config.maxLoops || state.reworkPending && state.config.maxReworks !== undefined && state.reworks >= state.config.maxReworks) return '保留明确的执行次数限制';
  if (state.failure && (!state.failure.recoverable || !['transport', 'timeout', 'executor', 'supervisor'].includes(state.failure.kind))) return '异常需要人工核查';
  if (!['paused', 'failed', 'planning', 'execute', 'verify', 'review'].includes(state.phase) && !(state.phase === 'executing' && state.nativeExecution && durableResult)) return '执行结果尚不确定';
  return undefined;
}

export function supervisionSignature(state: State, lastUserAt: number): string {
  return createHash('sha256').update(JSON.stringify({phase:state.phase,nextPhase:state.nextPhase,task:state.tasks[state.taskIndex]?.id,loops:state.loops,reason:state.reason,failure:state.failure,lastUserAt})).digest('hex');
}

export function supervisionDue(state: State, now: number, enabledAt: number, lastUserAt: number, receipt?: SupervisionReceipt): boolean {
  const updatedAt = Date.parse(state.updatedAt);
  if (!Number.isFinite(updatedAt) || !Number.isFinite(enabledAt) || !Number.isFinite(lastUserAt)) return false;
  const signature = supervisionSignature(state, lastUserAt);
  const same = receipt?.signature === signature;
  if (same && receipt.attempts >= 3) return false;
  return now - Math.max(updatedAt, enabledAt, lastUserAt, same ? receipt!.lastAttemptAt : 0) >= SUPERVISION_INTERVAL_MS;
}
