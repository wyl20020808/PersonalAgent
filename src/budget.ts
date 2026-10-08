import type { State, Store } from './store.js';
import { FlowError } from './failure.js';
import { checkGlobalBudget, reserveGlobalBudget } from './global-budget.js';

export class ClaudeBudgetExceeded extends FlowError {
  constructor(message: string) { super('budget', message); }
}
export function assertClaudeBudget(state: State): void {
  if ((state.claudeCalls ?? 0) >= (state.config.maxClaudeCalls ?? 100)) throw new ClaudeBudgetExceeded('Claude call limit reached; no further agent work is authorized');
  if (state.config.globalBudget) checkGlobalBudget(state.config.globalBudget.file, state.config.globalBudget.limit);
}
export function reserveClaudeCall(state: State, store: Store, role: 'plan' | 'review'): number {
  assertClaudeBudget(state);
  state.claudeCalls = (state.claudeCalls ?? 0) + 1;
  // Save locally first: a crash or competing global reservation can overcharge,
  // but can never refund the local attempt or authorize an unreserved spawn.
  store.save(state);
  if (state.config.globalBudget) {
    const policy = state.config.globalBudget;
    const used = reserveGlobalBudget(policy.file, policy.limit, state.id, state.claudeCalls, role);
    store.audit('global-claude-reserved', { file: policy.file, used, limit: policy.limit, role });
  }
  // Persist before spawning. Failed and interrupted calls consume their reservation.
  store.save(state);
  store.audit('claude-call-start', { call: state.claudeCalls, limit: state.config.maxClaudeCalls ?? 100, role, taskIndex: state.taskIndex, sessionId: state.claudeSessionId });
  return state.claudeCalls;
}
