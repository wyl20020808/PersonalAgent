import { realpathSync } from 'node:fs';
import { FlowError } from './failure.js';
import type { Config } from './schema.js';
import type { State, Store } from './store.js';
import type { CallUsage } from './call-observation.js';

export type DecisionIdentity = { backend: 'codex'; model?: string } | { backend: 'claude-code'; model?: string } | { backend: 'opencode'; providerID: string; modelID: string };
export interface DecisionSession { backend: DecisionIdentity['backend']; sessionId: string; runId: string; workspace: string; directory: string }
export interface DecisionRequest {
  state: State; store: Store; role: 'plan' | 'review'; prompt: string; schema: object;
  workspace: string; runId: string; taskId: string | null; phase: 'plan' | 'review';
  signal: AbortSignal; timeoutMs: number; context?: Record<string, any>;
}
export interface DecisionResult<T> { output: T; sessionId: string; usage: CallUsage }
export interface DecisionAgent { structured<T>(request: DecisionRequest): Promise<DecisionResult<T>> }
export function decisionIdentity(config: Config): DecisionIdentity {
  const choice = config.decisionAgent;
  if (!choice || choice.backend === 'claude-code') return { backend: 'claude-code', ...(choice?.model ? { model: choice.model } : {}) };
  if (choice.backend === 'codex') return { backend: 'codex', ...(choice.model ? { model: choice.model } : {}) };
  if (!choice.opencode?.providerID || !choice.opencode.modelID) throw new FlowError('supervisor', 'OpenCode providerID/modelID required');
  return { backend: 'opencode', providerID: choice.opencode.providerID, modelID: choice.opencode.modelID };
}
export function assertDecisionState(state: State, config = state.config): DecisionIdentity {
  const identity = state.decisionAgent ?? { backend: 'claude-code' };
  if (JSON.stringify(identity) !== JSON.stringify(decisionIdentity(config)) || JSON.stringify(identity) !== JSON.stringify(decisionIdentity(state.config))) throw new FlowError('safety', 'Immutable Decision Agent backend/model mismatch');
  const session = state.decisionSession;
  if (session?.backend === 'codex' && !session.sessionId.trim()) throw new FlowError('safety', 'Decision Session ownership mismatch: empty Codex Thread');
  if (session && (session.backend !== identity.backend || session.runId !== state.id || session.workspace !== realpathSync(state.workspace) || session.directory !== realpathSync(state.workspace) || (session.backend === 'claude-code' && session.sessionId !== state.claudeSessionId))) throw new FlowError('safety', 'Decision Session ownership mismatch');
  if (session?.backend === 'codex' && session.sessionId === state.codexThreadId) throw new FlowError('safety', 'Decision and Execution cannot share a Thread');
  return identity;
}
export function assertDecisionRequest(request: DecisionRequest): void {
  const { state } = request;
  assertDecisionState(state);
  if (request.runId !== state.id || request.workspace !== realpathSync(state.workspace) || request.phase !== request.role || request.taskId !== (request.role === 'plan' ? null : state.tasks[state.taskIndex]?.id ?? null)) throw new FlowError('safety', 'Decision Run/Task/workspace scope mismatch');
}
export function bindDecisionSession(state: State, store: Store, sessionId: string): void {
  const directory = realpathSync(state.workspace);
  state.decisionSession = { backend: (state.decisionAgent ?? decisionIdentity(state.config)).backend, sessionId, runId: state.id, workspace: directory, directory };
  store.save(state);
}
