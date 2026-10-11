import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { atomicJson, type State, type Store } from './store.js';
import { classifyFailure, FlowError } from './failure.js';
import { activityRecorder, redact } from './telemetry.js';

interface Recovery { key: string; retries: number; status: 'running' | 'waiting' | 'success' | 'closed' | 'exhausted' | 'cancelled'; nextAt?: number; message?: string }
/** Retry only an ended, owned call. Never restart an unknown in-flight process.
 * Separate receipts retain attempts across crashes without charging business rework. */
export async function recoverTransport<T>(state: State, store: Store, signal: AbortSignal, role: string,
  session: () => string | null | undefined, operation: (retry: number) => Promise<T>,
  wait: (ms: number, signal: AbortSignal) => Promise<void> = async (ms, signal) => { await delay(ms, undefined, { signal }); }): Promise<T> {
  const key = createHash('sha256').update(JSON.stringify({ role, loop: state.loops, task: state.taskIndex,
    participant: store.decisionParticipant, feedback: state.feedback })).digest('hex');
  const file = store.file(`transport-recovery-${key}.json`);
  const saved: Recovery | undefined = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
  if (saved && !['success', 'closed'].includes(saved.status)) {
    store.audit('transport-recovery-blocked', { role, ...saved });
    throw new FlowError(saved.status === 'exhausted' ? 'transport' : 'interrupted',
      saved.status === 'exhausted' ? `自动连接恢复已耗尽：${saved.message}` : saved.status === 'cancelled' ? '连接恢复等待已中断；未派发下一次调用，需要明确恢复指令' : '连接恢复进程中断；调用状态未知，保留 Session 和已有修改，需要明确恢复指令');
  }
  const delays = state.config.transportRetryDelaysMs ?? [5000, 15000, 30000];
  const recovery: Recovery = { key, retries: 0, status: 'running' };
  const activity = activityRecorder(state, store, role === 'execute' || state.decisionAgent?.backend === 'codex' ? 'codex' : 'claude',
    `transport:${key}`, role === 'execute' ? 'execute' : role === 'review' ? 'review' : 'plan');
  const persist = () => atomicJson(file, recovery);
  const checkBeforeDispatch = () => {
    if (signal.aborted) {
      recovery.status = 'cancelled'; delete recovery.nextAt; persist();
      store.audit('transport-recovery-cancelled', { role, ...recovery }); signal.throwIfAborted();
    }
  };
  let owned = session();
  persist();
  for (;;) {
    checkBeforeDispatch();
    try {
      const result = await operation(recovery.retries);
      signal.throwIfAborted();
      recovery.status = 'success'; delete recovery.nextAt; persist();
      if (recovery.retries) store.audit('transport-recovery-success', { role, ...recovery, sessionId: session() });
      return result;
    } catch (error) {
      const failure = classifyFailure(error, role);
      const current = session();
      if (signal.aborted || failure.kind !== 'transport' || !current || (owned && current !== owned)) {
        // Do not leave a retry marker blocking ordinary explicitly approved recovery.
        recovery.status = 'closed'; recovery.message = redact(failure.message); delete recovery.nextAt; persist(); throw error;
      }
      owned = current;
      recovery.message = redact(failure.message);
      if (recovery.retries >= delays.length) {
        recovery.status = 'exhausted'; persist();
        store.audit('transport-recovery-exhausted', { role, ...recovery, sessionId: current });
        throw new FlowError('transport', `自动连接恢复已耗尽（${recovery.retries} 次）；保留原 Session 和已有修改：${recovery.message}`);
      }
      const base = delays[recovery.retries]!;
      const waitMs = base === 0 ? 0 : base + Math.floor(Math.random() * Math.min(1000, base / 5));
      recovery.retries++; recovery.status = 'waiting'; recovery.nextAt = Date.now() + waitMs; persist();
      store.audit('transport-recovery-wait', { role, ...recovery, waitMs, sessionId: current });
      activity({ key: `wait:${recovery.retries}`, kind: 'retry', title: '连接异常，正在自动恢复',
        text: `第 ${recovery.retries}/${delays.length} 次恢复，等待 ${Math.ceil(waitMs / 1000)} 秒；沿用原 Session，保留已有修改。` });
      try { await wait(waitMs, signal); }
      catch (stopped) { recovery.status = 'cancelled'; delete recovery.nextAt; persist(); store.audit('transport-recovery-cancelled', { role, ...recovery }); throw stopped; }
      checkBeforeDispatch();
      recovery.status = 'running'; persist();
      store.audit('transport-recovery-start', { role, ...recovery, sessionId: current });
    }
  }
}
