/** Zero means no elapsed-time limit. Caller cancellation remains authoritative. */
export function timeoutSignal(timeoutMs: number): AbortSignal {
  return timeoutMs === 0 ? new AbortController().signal : AbortSignal.timeout(timeoutMs);
}
