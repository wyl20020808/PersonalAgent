import type { Codex, ThreadOptions } from '@openai/codex-sdk';
import { requireIdle, interactionAgentRules, watchInteractionPolicy, InteractionPolicyError } from './interaction-policy.js';
import { codexPublicEvent } from './telemetry.js';
import { codexObservation } from './call-observation.js';
import { editSchema, nativeResultSchema, validate, type ExecutionResult } from './schema.js';

// Collaboration rules; native tools remain owned by the CLI/SDK.
export const agentRules = `围绕用户授权的项目目标工作，优先复用已有代码和工具。可自主读取、搜索、编辑文件，执行 Shell、构建、测试、调试及使用本机配置的网络、Skills、hooks、MCP 等能力。修改后主动测试；遇到失败优先自主分析并修复，可在同一次调用内反复修复。重大架构变化先请求用户确认。不修改无关项目，不擅自删除重要数据或覆盖用户成果。未经明确批准不得推送远程仓库、发布或部署。保留 Controller 正式交付审批，不自行提交、合并或交付。不得伪造工具、测试、审查或模型输出；完成后报告实际改动和验证结果。Agent 自测不等于 Controller 独立验收。Claude 以规划、审查和指导为主，必要时可直接修复小问题；Codex 以开发为主。Controller 顺序调度二者，调用结束前不得留下后台写入进程。遵守仓库已有规则。所有报告使用中文。`;

export function nativeThreadOptions(workspace: string): ThreadOptions {
  return { workingDirectory: workspace, skipGitRepoCheck: true, sandboxMode: 'danger-full-access', approvalPolicy: 'never', networkAccessEnabled: true, webSearchMode: 'live' };
}
export interface WorkerRequest { workspace: string; threadId: string | null; prompt: string; executionMode?: 'native' | 'proposal' }
export async function runCodexTurn(codex: Pick<Codex, 'startThread' | 'resumeThread'>, request: WorkerRequest, emit: (event: object) => void): Promise<ExecutionResult> {
  requireIdle('Codex SDK 原生工具');
  const native = request.executionMode !== 'proposal';
  const options = nativeThreadOptions(request.workspace);
  const thread = request.threadId ? codex.resumeThread(request.threadId, options) : codex.startThread(options);
  const stop = new AbortController();
  const unwatch = watchInteractionPolicy(() => stop.abort(new InteractionPolicyError('Codex SDK 原生工具')));
  try {
  const { events } = await thread.runStreamed(request.prompt + interactionAgentRules, native ? { signal: stop.signal } : { outputSchema: editSchema, signal: stop.signal });
  let final = '', completed = false;
  for await (const event of events) {
    stop.signal.throwIfAborted();
    const observation = codexObservation(event); if (observation) emit({ type: 'observation', data: observation });
    const activity = codexPublicEvent(event); if (activity) emit({ type: 'activity', data: activity });
    if (event.type === 'thread.started') emit({ type: 'thread', id: event.thread_id });
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'turn.failed') throw new Error(event.error.message);
    if (event.type === 'turn.completed') completed = true;
    if (event.type === 'item.completed' && event.item.type === 'agent_message') final = event.item.text;
    // Failed commands and tools are feedback for the agent, not fatal turns.
  }
  if (!completed || !final.trim()) throw new Error('Codex returned no completed result');
  return native ? validate(nativeResultSchema, { mode: 'native', summary: final }) : validate(editSchema, JSON.parse(final));
  } finally { unwatch(); }
}
