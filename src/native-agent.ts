import { ownedCodexEvents } from './codex-stream.js';
import { routineWriteGuidance } from './decision-guidance.js';
import type { Codex, ThreadOptions } from '@openai/codex-sdk';
import {codexInput,type NativeAttachment} from './multimodal.js';
import { assertOperationPolicy, interactionAgentRules } from './interaction-policy.js';
import { codexPublicEvent } from './telemetry.js';
import { codexObservation } from './call-observation.js';
import { editSchema, nativeResultSchema, validate, type ExecutionResult } from './schema.js';

// Collaboration rules; native tools remain owned by the CLI/SDK.
export const agentRules = `围绕用户授权的项目目标工作，优先复用已有代码和工具。可自主读取、搜索、编辑文件，执行 Shell、构建、测试、调试及使用本机配置的网络、Skills、hooks、MCP 等能力。修改后主动测试；遇到失败优先自主分析并修复，可在同一次调用内反复修复。方案内的技术与架构选择由决策者判断；涉及用户目标、授权或重大未定取舍时再请求确认。不修改无关项目，不擅自删除重要数据或覆盖用户成果。未经明确批准不得推送远程仓库、公开发布或对外部署。提交、合并和交付遵循用户授权及项目约定；需要正式交付审批的范围保留该审批。不得伪造工具、测试、审查或模型输出；完成后报告实际改动和验证结果。执行者自测不等于决策者验收或用户确认。执行者完成后先交配置的决策者验收；Controller 只负责调度、收集证据、维护权限及交付授权记录，不执行验收测试、不判定成果成败。决策者自行选择必要验证并给出结论；pass 后自动完成当前任务并继续。已确定方案内的日常实施、排程、修复和验收由决策者自主决定，不要求用户逐项确认。角色按配置决定；决策者自主规划和验收，也可直接实施授权内的修改，或交执行者完成，不按模型名称或问题大小限制能力。任务粒度、方法和必要检查由决策者判断，Controller 不预设开发步骤。Controller 顺序调度二者，调用结束前不得留下后台写入进程。遵守仓库已有规则。所有报告使用中文。` + routineWriteGuidance;

export function nativeThreadOptions(workspace: string): ThreadOptions {
  return { workingDirectory: workspace, skipGitRepoCheck: true, sandboxMode: 'danger-full-access', approvalPolicy: 'never', networkAccessEnabled: true, webSearchMode: 'live' };
}
export interface WorkerRequest { workspace: string; threadId: string | null; prompt: string; model?: string; reasoningEffort?: ThreadOptions['modelReasoningEffort']; attachments?:NativeAttachment[]; executionMode?: 'native' | 'proposal' }
export async function runCodexTurn(codex: Pick<Codex, 'startThread' | 'resumeThread'>, request: WorkerRequest, emit: (event: object) => void): Promise<ExecutionResult> {
  assertOperationPolicy({ kind: 'model' });
  const native = request.executionMode !== 'proposal';
  const options = nativeThreadOptions(request.workspace);
  if (request.model) options.model = request.model;
  if (request.reasoningEffort) options.modelReasoningEffort = request.reasoningEffort;
  const thread = request.threadId ? codex.resumeThread(request.threadId, options) : codex.startThread(options);
  const stop = new AbortController();
  const { events } = await thread.runStreamed(codexInput(request.prompt + interactionAgentRules,request.attachments), native ? { signal: stop.signal } : { outputSchema: editSchema, signal: stop.signal });
  let final = '', completed = false, lastError = '';
  try { for await (const event of ownedCodexEvents(events)) {
    if (event.type !== 'error') lastError = '';
    stop.signal.throwIfAborted();
    const observation = codexObservation(event); if (observation) emit({ type: 'observation', data: observation });
    const activity = codexPublicEvent(event); if (activity) emit({ type: 'activity', data: activity });
    if (event.type === 'thread.started') emit({ type: 'thread', id: event.thread_id });
    // Error events include CLI reconnect progress. Keep consuming until a terminal
    // turn or process failure; closing this iterator kills the CLI before retry.
    if (event.type === 'error') lastError = event.message;
    if (event.type === 'turn.failed') throw new Error(event.error.message);
    if (event.type === 'turn.completed') completed = true;
    if (event.type === 'item.completed' && event.item.type === 'agent_message') final = event.item.text;
    // Failed commands and tools are feedback for the agent, not fatal turns.
  } } catch (error) { throw new Error(`${(error as Error).message}${lastError ? `\nLast CLI diagnostic: ${lastError}` : ''}`, { cause: error }); }
  if (!completed || !final.trim()) throw new Error(`Codex returned no completed result${lastError ? `: ${lastError}` : ''}`);
  return native ? validate(nativeResultSchema, { mode: 'native', summary: final }) : validate(editSchema, JSON.parse(final));
}
