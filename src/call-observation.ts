import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJson, type State, type Store } from './store.js';
import { contextHash, contextPath } from './project-context.js';
import { auditRecords } from './context-trust.js';
import { redact } from './telemetry.js';

export type CallPhase = 'plan' | 'execute' | 'review';
export type Tokens = { inputTokens: number | null; outputTokens: number | null; cacheReadTokens: number | null; cacheCreationTokens: number | null };
const empty = (): Tokens => ({ inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null });
const count = (n: unknown): number | null => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
export function redactCommand(command: string): string {
  return redact(command).replace(/(--(?:api[-_]key|access[-_]token|refresh[-_]token|token|password|secret|authorization)(?:\s+|=))(?:"[^"]*"|'[^']*'|[^\s]+)/gi, '$1[已隐藏凭据]');
}
function tokens(u: any, codex = false): Tokens {
  return { inputTokens: count(u?.input_tokens), outputTokens: count(u?.output_tokens), cacheReadTokens: count(codex ? u?.cached_input_tokens : u?.cache_read_input_tokens), cacheCreationTokens: count(codex ? u?.cache_write_input_tokens : u?.cache_creation_input_tokens) };
}
export function sumTokens(rows: Tokens[]): Tokens {
  const result = empty();
  for (const key of Object.keys(result) as (keyof Tokens)[]) result[key] = rows.length && rows.every(row => row[key] !== null) ? rows.reduce((sum, row) => sum + row[key]!, 0) : null;
  return result;
}
export interface CallUsage extends Tokens {
  callId: string; runId: string; taskId: string | null; phase: CallPhase; agent: 'claude' | 'codex' | 'opencode'; workspace: string;
  manifestPath: string; mode: string; controllerCall: number; rework: boolean; resumed: boolean;
  model: string | null; models: string[]; modelRequests: number | null; source: string;
  perModel: ({ model: string } & Tokens)[];
  completeness: 'complete' | 'partial' | 'unknown'; status: 'running' | 'success' | 'failed' | 'interrupted';
  startedAt: string; finishedAt: string | null; durationMs: number | null; promptBytes: number; notes: string[];
}

// The installed SDK 0.161.0 exposes commands and turn usage, but no Read item or model identifier.
// Send only the fields needed for observation across the worker boundary, never tool output/content.
export function codexObservation(event: any): object | null {
  if (event.type === 'turn.completed') return { type: event.type, usage: event.usage };
  if (['item.started', 'item.updated', 'item.completed'].includes(event.type) && event.item?.type === 'command_execution') {
    const { id, type, command, status, exit_code } = event.item;
    return { type: event.type, item: { id, type, command: redactCommand(command), status, exit_code } };
  }
  if (event.type === 'item.completed' && event.item?.type === 'mcp_tool_call') return { type: event.type, item: { id: event.item.id, type: event.item.type } };
  return null;
}

export class CallObservation {
  readonly usage: CallUsage;
  private readonly readsFile: string;
  private readonly usageFile: string;
  private readonly seen = new Set<string>();
  private readonly tools = new Map<string, { name: string; input: any }>();
  private readonly requests = new Map<string, { model: string | null; tokens: Tokens }>();
  private readonly activeRequests = new Map<string, string>();
  private finalUsage: Tokens | null = null;
  private resultSeen = false;
  private closed = false;
  private lastProgress = '';
  private initModel: string | null = null;
  private freshModelUsage = false;

  constructor(private readonly state: State, private readonly store: Store, phase: CallPhase, prompt: string, navigation?: Record<string, any>, resumed = false, decisionBackend?: 'opencode') {
    const callId = navigation?.callId ?? randomUUID(), agent = phase === 'execute' ? 'codex' : decisionBackend ?? 'claude';
    mkdirSync(store.file('context'), { recursive: true });
    const manifestPath = store.file(`context/${callId}.manifest.json`);
    if (!navigation) writeFileSync(manifestPath, JSON.stringify({ callId, runId: state.id, phase, targetWorkspace: state.workspace, enabled: false, prompt: { hash: contextHash(prompt), bytes: Buffer.byteLength(prompt) }, note: 'Project Context 未启用；仅记录调用归属与提示词字节，不复制提示词正文。' }), { flag: 'wx' });
    this.readsFile = store.file(`context/${callId}.reads.jsonl`); this.usageFile = store.file(`context/${callId}.usage.json`);
    // A fresh call ID is mandatory. Never truncate a historical receipt.
    writeFileSync(this.readsFile, '', { flag: 'wx' }); writeFileSync(this.usageFile, '', { flag: 'wx' });
    this.usage = { ...empty(), callId, runId: state.id, taskId: phase === 'plan' ? null : state.tasks[state.taskIndex]?.id ?? null, phase, agent, workspace: state.workspace, manifestPath, mode: state.config.mode, controllerCall: agent !== 'codex' ? state.claudeCalls ?? 0 : state.loops, rework: phase !== 'plan' && state.reworks > 0, resumed, model: null, models: [], perModel: [], modelRequests: null, source: agent === 'opencode' ? 'opencode-sdk-native-messages' : agent === 'claude' ? 'claude-cli-stream-json' : 'codex-sdk-0.161.0-turn.completed', completeness: 'unknown', status: 'running', startedAt: new Date().toISOString(), finishedAt: null, durationMs: null, promptBytes: Buffer.byteLength(prompt), notes: [] };
    store.audit('observation-call-start', this.usage);
    this.record('coverage', { note: agent === 'claude' ? '仅配对本次 CLI Read 调用和可确认的文本结果；未识别的格式、子工具及 Shell 文件 I/O 不可观测。' : 'SDK 不暴露原生 Read、实际模型和内部请求数；仅观察命令与回合用量。Shell/MCP 不推断文件读取。' });
    const assembly = JSON.parse(prompt);
    const selectionReasons = navigation ? JSON.parse(readFileSync(manifestPath, 'utf8')).selectionReasons ?? [] : [];
    const supplied = (contentKind: string, value: unknown, file: string, pointer: string) => this.record('supplied', { contentKind, path: file, jsonPointer: pointer, sha256: contextHash(typeof value === 'string' ? value : JSON.stringify(value)), bytes: Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value)), selectionReasons, version: navigation?.version ?? null, omitted: navigation?.omitted ?? [] });
    if (navigation?.overview) supplied('overview-excerpt', navigation.overview.content, navigation.overview.path, '/assembled/context/overview/content');
    if (navigation?.moduleCatalog) supplied('module-catalog', navigation.moduleCatalog, manifestPath, '/assembled/context/moduleCatalog');
    if (navigation?.fileTree?.length) supplied('file-tree', navigation.fileTree, manifestPath, '/assembled/context/fileTree');
    // Paths alone are navigation, not supplied file contents. Review evidence carries full contracts.
    for (const kind of ['contracts', 'decisions']) for (const [index, doc] of (assembly.evidence?.contextReport?.[kind] ?? []).entries()) if (typeof doc.content === 'string') supplied(kind, doc.content, doc.path, `/assembled/evidence/contextReport/${kind}/${index}/content`);
    this.persist();
  }

  private record(kind: string, data: object): void {
    const receipt = { callId: this.usage.callId, runId: this.usage.runId, taskId: this.usage.taskId, phase: this.usage.phase, agent: this.usage.agent, workspace: this.usage.workspace, manifestPath: this.usage.manifestPath, time: new Date().toISOString(), kind, ...data };
    const key = contextHash(JSON.stringify({ ...receipt, time: null })); if (this.seen.has(key)) return; this.seen.add(key);
    const clean = JSON.parse(redact(JSON.stringify(receipt)));
    appendFileSync(this.readsFile, JSON.stringify(clean) + '\n', { flush: true });
    this.store.audit('context-read-event', { callId: this.usage.callId, kind, path: this.readsFile, receiptHash: contextHash(JSON.stringify(clean)) });
  }
  private filePath(value: unknown): string | null {
    if (typeof value !== 'string' || !value) return null;
    const root = realpathSync(this.state.workspace), resolved = path.resolve(root, value), relative = path.relative(root, resolved).replaceAll('\\', '/');
    if (!contextPath(relative) || relative.startsWith('../') || path.isAbsolute(relative)) return null;
    if (existsSync(resolved)) { const stat = lstatSync(resolved); if (stat.isSymbolicLink() || stat.nlink > 1) return null; const real = path.relative(root, realpathSync(resolved)); if (real.startsWith('..') || path.isAbsolute(real)) return null; }
    return relative;
  }
  private persist(): void { atomicJson(this.usageFile, JSON.parse(redact(JSON.stringify(this.usage)))); }
  observeOpencodePart(part: any): void {
    if (this.closed || this.usage.agent !== 'opencode' || part.type !== 'tool') return;
    if (part.tool === 'bash' && typeof part.state?.input?.command === 'string') this.record('shell-command', {toolCallId:part.callID,command:redactCommand(part.state.input.command),status:part.state.status,exitCode:Number.isInteger(part.state.metadata?.exit)?part.state.metadata.exit:null});
    else this.record('unobservable',{toolCallId:part.callID,tool:part.tool,reason:'原生事件没有可核验的读取结果范围；不从工具输入推断读取'});
  }
  observeOpencodeMessage(info: any): void {
    if (this.closed || this.usage.agent !== 'opencode' || info.role !== 'assistant' || typeof info.id !== 'string') return;
    const u = info.tokens;
    this.requests.set(info.id,{model:typeof info.modelID === 'string' ? `${info.providerID}/${info.modelID}` : null,tokens:{inputTokens:count(u?.input),outputTokens:count(u?.output),cacheReadTokens:count(u?.cache?.read),cacheCreationTokens:count(u?.cache?.write)}});
    this.resultSeen = true; this.refresh(); this.persist();
  }
  observe(event: any): void {
    if (this.closed || !event || event.isReplay === true) return;
    if (this.usage.agent === 'codex') {
      if (event.type === 'turn.completed') { this.finalUsage = tokens(event.usage, true); this.resultSeen = true; }
      const item = event.item;
      if (item?.type === 'command_execution' && typeof item.id === 'string' && typeof item.command === 'string') this.record('shell-command', { toolCallId: item.id, command: redactCommand(item.command), status: item.status, exitCode: count(item.exit_code) ?? (Number.isInteger(item.exit_code) ? item.exit_code : null) });
      else if (item?.type === 'mcp_tool_call') this.record('unobservable', { toolCallId: item.id, reason: 'MCP 工具没有注册可核验的文件读取协议' });
    } else {
      if (event.type === 'system' && event.subtype === 'init' && typeof event.model === 'string') this.initModel = event.model;
      const parent = event.parent_tool_use_id ?? 'main';
      const remember = (message: any, output = false) => {
        if (typeof message?.id !== 'string' || !message.usage) return;
        const id = `${parent}:${message.id}`, row = tokens(message.usage);
        if (!output) row.outputTokens = this.requests.get(id)?.tokens.outputTokens ?? null; // assistant output is a placeholder.
        this.requests.set(id, { model: typeof message.model === 'string' ? message.model : this.requests.get(id)?.model ?? null, tokens: row });
        this.activeRequests.set(parent, id);
        this.record('usage-source', { source: 'assistant-request', requestId: message.id, parentToolUseId: parent === 'main' ? null : parent, model: this.requests.get(id)!.model, tokens: row, note: '输出仅采用可识别 stream message_delta，不使用 assistant 占位输出' });
      };
      if (event.type === 'assistant') remember(event.message);
      if (event.type === 'stream_event') {
        const stream = event.event;
        if (stream?.type === 'message_start') remember(stream.message);
        if (stream?.type === 'message_delta') {
          const row = this.requests.get(this.activeRequests.get(parent) ?? '');
          if (row && count(stream.usage?.output_tokens) !== null) { row.tokens.outputTokens = count(stream.usage.output_tokens); this.record('usage-source', { source: 'message_delta', requestId: this.activeRequests.get(parent), tokens: row.tokens }); }
        }
      }
      if (event.type === 'result') {
        this.resultSeen = true;
        // CLI >=2.1.277 can restore session totals. Do not sum or subtract ambiguous resumed totals.
        if (!this.usage.resumed && !event.is_error && count(event.usage?.input_tokens) !== null && count(event.usage?.output_tokens) !== null) this.finalUsage = tokens(event.usage);
        if (event.modelUsage && typeof event.modelUsage === 'object' && !Array.isArray(event.modelUsage)) {
          const perModel = Object.entries(event.modelUsage).map(([model, raw]) => { const u = raw as any; return { model, inputTokens: count(u?.inputTokens), outputTokens: count(u?.outputTokens), cacheReadTokens: count(u?.cacheReadInputTokens), cacheCreationTokens: count(u?.cacheCreationInputTokens) }; });
          this.record('usage-source', { source: 'result.modelUsage', scope: this.usage.resumed ? 'excluded-session-cumulative' : 'fresh-call-whole-tree', perModel });
          if (!this.usage.resumed && !event.is_error && perModel.length && perModel.every(row => row.inputTokens !== null && row.outputTokens !== null)) { this.usage.perModel = perModel; this.finalUsage = sumTokens(perModel); this.freshModelUsage = true; this.usage.source = 'claude-cli-fresh-result.modelUsage'; }
        }
        this.record('usage-source', { source: 'result.usage', scope: this.usage.resumed ? 'excluded-resumed-aggregate' : 'fresh-main-loop', tokens: tokens(event.usage), modelUsageScope: 'session-cumulative-not-added' });
      }
      for (const block of Array.isArray(event.message?.content) ? event.message.content : []) {
        if (block.type === 'tool_use' && typeof block.id === 'string') {
          this.tools.set(block.id, { name: block.name, input: block.input });
          if (block.name === 'Bash' && typeof block.input?.command === 'string') this.record('shell-command', { toolCallId: block.id, command: redactCommand(block.input.command), status: 'running', exitCode: null });
        }
        if (block.type !== 'tool_result') continue;
        const tool = this.tools.get(block.tool_use_id); if (!tool) { this.record('unobservable', { toolCallId: block.tool_use_id ?? null, reason: '没有本次调用内的工具请求配对' }); continue; }
        if (tool.name === 'Bash') { this.record('shell-command', { toolCallId: block.tool_use_id, command: redactCommand(tool.input.command ?? ''), status: block.is_error ? 'failed' : 'completed', exitCode: Number.isInteger(event.tool_use_result?.exitCode) ? event.tool_use_result.exitCode : null }); continue; }
        if (tool.name !== 'Read') { this.record('unobservable', { toolCallId: block.tool_use_id, tool: tool.name, reason: '未注册原生文本读取协议' }); continue; }
        const relative = this.filePath(tool.input?.file_path);
        if (block.is_error) { this.record('read-failed', { toolCallId: block.tool_use_id, path: relative, status: 'failed' }); continue; }
        const file = event.tool_use_result?.type === 'text' ? event.tool_use_result.file : null;
        const matched = file && relative && this.filePath(file.filePath) === relative && typeof file.content === 'string' && count(file.startLine) !== null && file.startLine >= 1 && count(file.numLines) !== null;
        if (matched) this.record('confirmed-read', { toolCallId: block.tool_use_id, path: relative, status: 'completed', range: { startLine: file.startLine, lineCount: file.numLines }, source: 'claude.Read.text-result' });
        else this.record('unobservable', { toolCallId: block.tool_use_id, reason: 'Read 结果未携带可核验的文本范围，或路径不安全；不从请求范围推断成功读取' });
      }
    }
    this.refresh(); this.persist();
    const progress = contextHash(JSON.stringify({ tokens: [this.usage.inputTokens, this.usage.outputTokens, this.usage.cacheReadTokens, this.usage.cacheCreationTokens], models: this.usage.models, requests: this.usage.modelRequests }));
    if (progress !== this.lastProgress) { this.lastProgress = progress; this.store.audit('usage-progress', this.usage); }
  }
  private refresh(): void {
    const rows = [...this.requests.values()];
    Object.assign(this.usage, this.finalUsage ?? sumTokens(rows.map(row => row.tokens)));
    this.usage.models = this.freshModelUsage ? this.usage.perModel.map(row => row.model) : [...new Set(rows.flatMap(row => row.model ? [row.model] : []))];
    if (!this.usage.models.length && this.initModel) this.usage.models = [this.initModel];
    this.usage.model = this.usage.models.length === 1 ? this.usage.models[0]! : null;
    this.usage.modelRequests = this.usage.agent === 'opencode' ? null : rows.length || null;
    this.usage.completeness = [this.usage.inputTokens, this.usage.outputTokens].some(v => v !== null) ? 'partial' : 'unknown';
  }
  finish(status: 'success' | 'failed' | 'interrupted'): CallUsage {
    if (this.closed) return this.usage; this.closed = true; this.refresh();
    this.usage.status = status; this.usage.finishedAt = new Date().toISOString(); this.usage.durationMs = Date.parse(this.usage.finishedAt) - Date.parse(this.usage.startedAt);
    if (status === 'success' && this.resultSeen && (this.usage.agent === 'codex' || this.freshModelUsage) && this.usage.inputTokens !== null && this.usage.outputTokens !== null) this.usage.completeness = 'complete';
    this.usage.notes = this.usage.agent === 'opencode' ? ['仅统计当前调用的原生 assistant 消息；缓存未知保持 null，内部请求数和完整读取覆盖未知；不估算费用。'] : this.usage.agent === 'codex' ? ['complete 仅表示 SDK 报告的回合 input/output 完整；缓存缺失为 null，模型与内部请求数未知。', 'cached_input_tokens 为输入的缓存子集，不与 input_tokens 相加。'] : [this.freshModelUsage ? '新会话 modelUsage 提供各模型的本次整体报告；complete 仅表示协议报告 input/output 完整，内部请求数仍只含可识别请求。' : '仅确认本次可识别的主循环/子请求；后台或内部辅助请求覆盖无法证明，整体标记 partial。', 'assistant.output_tokens 为占位值，使用 message_delta 输出；恢复调用排除可能累计的 result.usage/modelUsage。', 'Claude 普通输入、缓存读取与缓存写入分别报告，不合并为金额或跨协议输入总数。'];
    this.persist(); this.store.audit('agent-usage', this.usage);
    this.store.audit('observation-call-finish', { callId: this.usage.callId, status, readsFile: this.readsFile, readsHash: contextHash(readFileSync(this.readsFile, 'utf8')), usageFile: this.usageFile, usageHash: contextHash(readFileSync(this.usageFile, 'utf8')) });
    return this.usage;
  }
}

export function runUsage(store: Store) {
  const events = auditRecords(store.file('audit.jsonl')), calls = new Map<string, CallUsage>();
  for (const event of events) if (['observation-call-start', 'usage-progress', 'agent-usage'].includes(event.event) && event.data.runId === store.id) calls.set(event.data.callId, event.data as CallUsage);
  const rows = [...calls.values()];
  const groups = [...new Set(rows.map(row => `${row.taskId ?? '(plan)'}:${row.phase}:${row.rework ? 'rework' : 'initial'}`))].map(key => { const selected = rows.filter(row => `${row.taskId ?? '(plan)'}:${row.phase}:${row.rework ? 'rework' : 'initial'}` === key); return { key, calls: selected.length, ...sumTokens(selected), complete: selected.every(row => row.completeness === 'complete' && row.status === 'success') }; });
  return { calls: rows, groups, controllerCalls: rows.length, reported: { opencode: sumTokens(rows.filter(row => row.agent === 'opencode')), claude: sumTokens(rows.filter(row => row.agent === 'claude')), codex: sumTokens(rows.filter(row => row.agent === 'codex')) }, complete: !!rows.length && rows.every(row => row.completeness === 'complete' && row.status === 'success'), note: '提示词 UTF-8 字节数 ≠ 模型输入 Token ≠ 最终计费金额；各协议输入/缓存分别汇总。旧 Run 没有观测记录时不补造用量。' };
}
