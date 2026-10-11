import { ownedCodexEvents } from './codex-stream.js';
import type { Codex, ThreadOptions } from '@openai/codex-sdk';
import {codexInput,type NativeAttachment} from './multimodal.js';
import { codexObservation } from './call-observation.js';
import { codexPublicEvent } from './telemetry.js';
import { validate } from './schema.js';
import { nativeThreadOptions } from './native-agent.js';

export interface CodexDecisionTurn {
  readOnly?: boolean;
  attachments?:NativeAttachment[];
  workspace: string; threadId: string | null; model?: string; reasoningEffort?: ThreadOptions['modelReasoningEffort']; prompt: string; schema: object;
  runId: string; role: 'plan' | 'review'; participantId?: 'a' | 'b' | 'c'; discussionStage?: string;
}
// The service accepts a stricter subset than Ajv. Keep the original schema for
// local validation; only adapt transport constraints and optional fields.
export function codexOutputSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(codexOutputSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key !== 'uniqueItems') result[key] = codexOutputSchema(value);
  }
  if (schema.properties) {
    const required = new Set(schema.required ?? []);
    for (const key of Object.keys(schema.properties)) {
      if (!required.has(key)) result.properties[key] = { anyOf: [result.properties[key], { type: 'null' }] };
    }
    result.required = Object.keys(schema.properties);
  }
  return result;
}
export function restoreOptionalFields(schema: any, value: any): any {
  if (Array.isArray(value) && schema.items) return value.map(item => restoreOptionalFields(schema.items, item));
  if (!value || typeof value !== 'object' || !schema.properties) return value;
  const result = { ...value }, required = new Set(schema.required ?? []);
  for (const [key, child] of Object.entries(schema.properties)) {
    if (!Object.hasOwn(result, key)) continue;
    if (!required.has(key) && result[key] === null) delete result[key];
    else result[key] = restoreOptionalFields(child, result[key]);
  }
  return result;
}
/** SDK calls run in an owned child; the parent process enforces timeout/tree cancellation. */
export async function runCodexDecisionTurn(codex: Pick<Codex, 'startThread' | 'resumeThread'>, request: CodexDecisionTurn, emit: (event: object) => void, signal?: AbortSignal): Promise<unknown> {
  const readOnly = request.readOnly || ['draft', 'discussion', 'synthesis'].includes(request.discussionStage ?? '');
  const options: ThreadOptions = { ...nativeThreadOptions(request.workspace),
    ...(readOnly ? { sandboxMode: 'read-only' as const, networkAccessEnabled: false, webSearchMode: 'disabled' as const } : {}),
    ...(request.model ? { model: request.model } : {}), ...(request.reasoningEffort ? { modelReasoningEffort: request.reasoningEffort } : {}) };
  const thread = request.threadId ? codex.resumeThread(request.threadId, options) : codex.startThread(options);
  const { events } = await thread.runStreamed(codexInput(request.prompt,request.attachments), { outputSchema: codexOutputSchema(request.schema), ...(signal ? { signal } : {}) });
  let final = '', completed = false, started = false, lastError = '';
  try { for await (const event of ownedCodexEvents(events)) {
    if (event.type !== 'error') lastError = '';
    if (event.type === 'thread.started') {
      if (started || !event.thread_id || (request.threadId && request.threadId !== event.thread_id)) throw Error('Codex Decision Thread ownership mismatch');
      started = true; emit({ type: 'thread', id: event.thread_id });
    } else if (!started) throw Error('Codex Decision event without owned Thread');
    if (completed) throw Error('Codex Decision event after completed turn');
    const observation = codexObservation(event); if (observation) emit({ type: 'observation', data: observation });
    const activity = 'item' in event && event.item.type === 'reasoning' ? null : codexPublicEvent(event); if (activity) emit({ type: 'activity', data: event.type === 'turn.started' ? { ...activity, title: 'Codex 开始决策' } : event.type === 'turn.completed' ? { ...activity, text: '决策回合完成；结构化结果仍须 Controller 校验。' } : activity });
    // Reconnecting is emitted as an error event, not a failed turn.
    if (event.type === 'error') lastError = event.message;
    if (event.type === 'turn.failed') throw Error(event.error.message);
    if (event.type === 'turn.completed') completed = true;
    if (event.type === 'item.completed' && event.item.type === 'agent_message') final = event.item.text;
  } } catch (error) { throw new Error(`${(error as Error).message}${lastError ? `\nLast CLI diagnostic: ${lastError}` : ''}`, { cause: error }); }
  if (!started || !completed || !final.trim()) throw Error(`Codex Decision returned no owned completed structured result${lastError ? `: ${lastError}` : ''}`);
  return validate(request.schema, restoreOptionalFields(request.schema, JSON.parse(final)));
}
