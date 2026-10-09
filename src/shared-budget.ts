import { readFileSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import { checkGlobalBudget, reserveGlobalBudget } from './global-budget.js';
import { assertD, type State, type Store } from './store.js';
import { FlowError } from './failure.js';
import { instanceId, sharedRuntime } from './instance-runtime.js';

export const sharedBudgetPolicy = path.join(sharedRuntime, 'global-budget-policy.json');
type Policy = { version: 1; claude: { file: string; limit: number }; codex: { file: string; limit: number } };
export function readSharedBudget(file = sharedBudgetPolicy): Policy {
  let value: Policy;
  try { value = JSON.parse(readFileSync(file, 'utf8')); } catch { throw new FlowError('budget', 'Shared budget authorization missing or invalid; paid calls refused'); }
  if (value.version !== 1 || !value.claude || !value.codex) throw new FlowError('budget', 'Shared CC/Codex budget authorization required');
  for (const policy of [value.claude, value.codex]) {
    if (typeof policy.file !== 'string' || !Number.isInteger(policy.limit) || policy.limit < 1 || policy.limit > 100000) throw new FlowError('budget', 'Invalid shared budget policy');
    policy.file = assertD(policy.file);
  }
  if (value.claude.file.toLowerCase() === value.codex.file.toLowerCase()) throw new FlowError('budget', 'Shared CC and Codex ledgers must be distinct');
  return value;
}
export function reserveSharedCall(state: State, store: Store, agent: 'claude' | 'codex', role: string, policyFile = sharedBudgetPolicy): void {
  if (state.config.mode !== 'real') return;
  const id = instanceId(), policy = readSharedBudget(policyFile)[agent];
  // Never initialize, reset, refund, or recover a busy ledger automatically.
  checkGlobalBudget(policy.file, policy.limit);
  const local=state.config.globalBudget;
  if(agent==='claude'&&local&&existsSync(local.file)&&realpathSync(local.file).toLowerCase()===realpathSync(policy.file).toLowerCase()){
    if(local.limit!==policy.limit)throw new FlowError('budget','Shared and local ledger authorization mismatch');
    // RealAgents reserves this exact ledger in reserveClaudeCall before spawn.
    store.audit('shared-agent-budget-linked',{instanceId:id,agent,role,file:policy.file,limit:policy.limit});return;
  }
  const call = agent === 'claude' ? (state.claudeCalls ?? 0) + 1 : state.loops;
  const used = reserveGlobalBudget(policy.file, policy.limit, state.id, call, role);
  store.audit('shared-agent-reserved', { instanceId: id, agent, role, file: policy.file, limit: policy.limit, used });
}
