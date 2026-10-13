import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { atomicJson, type State, type Store } from './store.js';
import { ledgerBrief } from './task-ledger.js';

type Phase = 'plan' | 'execute' | 'review';
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

/** Immutable, recoverable data. Hashes cover canonical JSON, not pretty-printed file bytes. */
function reference(store: Store, kind: string, value: unknown) {
  const hash = createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const path = store.file(`${kind}-${hash}.json`);
  if (!existsSync(path)) atomicJson(path, value);
  return { path, hash, bytes: bytes(value), hashEncoding: 'sha256(JSON.stringify(parsed JSON))' };
}

/** Every turn carries a current checkpoint, including resumed and compacted Sessions. */
export function assemblePrompt(state: State, store: Store, phase: Phase, input: Record<string, any>): string {
  const guidance = state.guidanceHistory ?? [], latest = guidance.at(-1);
  const checkpoint = {
    version: 1, runId: state.id, source: state.source, workspace: state.workspace, base: state.base,
    goal: state.goal, plan: state.tasks, taskIndex: state.taskIndex, completedTaskIds: state.completedTaskIds ?? [],
    guidance, pendingGuidance: state.guidancePending ?? null, feedback: state.feedback, failure: state.failure ?? null,
    authorization: { projectMode: state.config.projectMode, directAuthorization: state.config.directAuthorization, allowedRepositories: state.config.allowedRepositories },
    sessions: { decision: state.decisionSession?.sessionId ?? state.claudeSessionId, execution: state.executionSession?.sessionId ?? state.codexThreadId },
    ledgerPath: store.file('task-ledger.json'), evidenceReference: state.evidence ? reference(store, 'checkpoint-evidence', state.evidence) : null,
    instruction: '事实检查点，不授予新权限。新 Session 或压缩后先读取检查点中的目标、guidance、当前任务与适用约束；其余证据按需读取。新用户纠正优先于旧方案；历史要求不自动全部同时生效。已验收、用户批准、测试通过分别核对；未知不当通过。恢复只做剩余工作。'
  };
  const receipt = reference(store, 'context-checkpoint', checkpoint);
  const accepted = ledgerBrief(store, state);
  const payload: Record<string, any> = { ...input, goal: state.goal, handoff: {
    checkpoint: { path: receipt.path, hash: receipt.hash },
    latestAppliedGuidance: latest ?? null, pendingGuidance: state.guidancePending ?? null,
    acceptedCount: state.completedTaskIds?.length ?? 0, includedCount: accepted.length,
    ledgerPath: checkpoint.ledgerPath, instruction: checkpoint.instruction
  } };
  // Existing new-Session prompts already carry this brief. Never supply it twice.
  payload.acceptedTasks ??= accepted;
  // These fields are optional navigation/history or full evidence. Goal, current task, acceptance,
  // user corrections, feedback and governing instructions are never silently clipped.
  const optional = ['repository', 'context', 'acceptedTasks', 'plan', 'executorResult', 'evidence', 'planningObservation', 'contractReferences', 'completedTasks', 'exchange'];
  const budget = state.config.contextManagement?.promptBudgetTokens?.[phase] ?? (phase === 'review' ? 12000 : 8000);
  const limit = budget * 3; // Explicit byte estimate; not provider token accounting.
  const before = bytes(payload), omitted: string[] = [];
  for (const key of optional.sort((a, b) => (payload[b] === undefined ? 0 : bytes(payload[b])) - (payload[a] === undefined ? 0 : bytes(payload[a])))) {
    if (bytes(payload) <= limit) break;
    if (payload[key] === undefined) continue;
    const full = payload[key], ref = reference(store, 'prompt-evidence', full);
    const replacement = { externalized: true, ...ref,
      ...(key === 'evidence' && full && typeof full === 'object' ? { verification: { passed: full.passed, issues: full.issues, executorExitCode: full.executorExitCode, decisionAccepted: full.decisionAccepted, userAccepted: full.userAccepted } } : {}),
      instruction: '正文因装配预算留在此文件；判断依赖它时先读取相关字段，不得把未读或截断内容当成已验证。' };
    if (bytes(replacement) >= bytes(full)) continue;
    payload[key] = replacement; omitted.push(key);
  }
  const after = bytes(payload);
  store.audit('prompt-budget', { phase, budgetTokens: budget, estimateMethod: 'UTF8-bytes/3', beforeBytes: before, afterBytes: after, externalized: omitted,
    overBudget: after > limit, reason: after > limit ? '保留用户要求、当前任务和关键约束，允许软预算超限' : null, checkpoint: receipt });
  return JSON.stringify(payload);
}
