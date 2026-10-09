import type { State, Store } from './store.js';

// Historical budget fields remain readable; calls are usage, not reservations.
export function recordClaudeCall(state: State, store: Store, role: 'plan' | 'review'): number {
  state.claudeCalls = (state.claudeCalls ?? 0) + 1;
  store.save(state);
  store.audit('claude-call-start', { call: state.claudeCalls, role, taskIndex: state.taskIndex, sessionId: state.claudeSessionId });
  return state.claudeCalls;
}
