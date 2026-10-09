/** Implemented adapter contracts, not a promise of future Controller combinations. */
export type AgentId = 'claude-code' | 'opencode' | 'codex';
export type AgentPoolRole = 'decision' | 'execution';
export interface AgentCapabilities {
  id: AgentId;
  name: string;
  plan: boolean;
  review: boolean;
  execute: boolean;
  nativeTools: boolean;
  structuredOutput: boolean;
  discussion: boolean;
  experimental: boolean;
}
export const agentCapabilities: readonly AgentCapabilities[] = [
  { id: 'claude-code', name: 'Claude Code', plan: true, review: true, execute: false, nativeTools: true, structuredOutput: true, discussion: true, experimental: false },
  { id: 'opencode', name: 'OpenCode', plan: true, review: true, execute: false, nativeTools: true, structuredOutput: true, discussion: true, experimental: true },
  { id: 'codex', name: 'Codex', plan: false, review: false, execute: true, nativeTools: true, structuredOutput: true, discussion: false, experimental: false },
];
/** OpenCode additionally requires live model discovery and the startup compatibility check. */
export function supportsPool(agent: AgentCapabilities, role: AgentPoolRole): boolean {
  return agent.nativeTools && agent.structuredOutput && (role === 'decision' ? agent.plan && agent.review : agent.execute);
}
