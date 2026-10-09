import { nativeAgentEnv, repositoryContext } from './workspace.js';
import { agentRules } from './native-agent.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from './process.js';
import { editSchema, nativeResultSchema, planSchema, reviewSchema, validate, type Config, type ExecutionResult, type Plan, type Review } from './schema.js';
import type { State, Store } from './store.js';
import type { Agents } from './adapters.js';
import { reserveClaudeCall } from './budget.js';
import { FlowError, classifyFailure } from './failure.js';
import { activityRecorder, claudePublicEvents } from './telemetry.js';
import { reviewEvidence } from './incremental.js';
import { callContext, recordContextPrompt } from './context-navigation.js';

export class RealAgents implements Agents {
  get executionMode(): 'native' | 'proposal' { return this.config.executionMode ?? 'native'; }
  constructor(readonly config: Config, private readonly run: typeof runProcess = runProcess) {}
  private async claude<T>(state: State, store: Store, signal: AbortSignal, schema: object, prompt: string, role: 'plan' | 'review'): Promise<T> {
    const env = nativeAgentEnv();
    const streaming = this.config.claudeStreaming !== false;
    const args = ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--permission-mode', 'bypassPermissions', '--system-prompt-snapshot', 'off', '--append-system-prompt', agentRules];
    if (state.claudeSessionId) args.push('--resume', state.claudeSessionId);
    else { state.claudeSessionId = crypto.randomUUID(); store.save(state); args.push('--session-id', state.claudeSessionId); }
    const call = reserveClaudeCall(state, store, role);
    const record = activityRecorder(state, store, 'claude', `claude:${call}`);
    let streamedResult: any; let characters = 0, lastProgress = 0;
    if (streaming) { args[args.indexOf('--output-format') + 1] = 'stream-json'; args.push('--verbose', '--include-partial-messages'); }
    const onLine = streaming ? (line: string) => {
      if (!line.trim()) return; const event = JSON.parse(line);
      if (event.type === 'result') { if (streamedResult) throw Error('Duplicate Claude final result'); streamedResult = event; }
      for (const activity of claudePublicEvents(event)) record(activity);
      const delta = event.event?.delta;
      if (event.type === 'stream_event' && ['text_delta', 'input_json_delta'].includes(delta?.type)) {
        characters += String(delta.text ?? delta.partial_json ?? '').length;
        if (Date.now() - lastProgress > 1000) { lastProgress = Date.now(); record({key: `delta:${characters}`, kind: 'receiving', title: 'Claude 输出接收中', text: `已接收 ${characters} 个公开文本或结构化字符；尚未通过 Schema 校验`}); }
      }
    } : undefined;
    const result = await this.run(this.config.claudeExecutable, args, { cwd: state.workspace, env, signal, timeoutMs: this.config.timeoutMs, input: prompt, onLine, streamOutput: streaming });
    let envelope: { is_error?: boolean; session_id?: string; structured_output?: unknown; result?: string; errors?: string[] };
    try { const parsed=streamedResult ?? JSON.parse(streaming ? result.stdout.trim().split(/\r?\n/).at(-1)! : result.stdout);if(streaming&&parsed.type!=='result')throw Error('Missing Claude final result');envelope=parsed; }
    catch { throw new Error(`Claude exited ${result.exitCode} with invalid JSON: ${result.stderr.slice(0, 1000)}`); }
    store.audit('claude-exit', { call, role, exitCode: result.exitCode, sessionId: envelope.session_id ?? state.claudeSessionId });
    if (result.exitCode !== 0 || envelope.is_error) {
      const message = `Claude exited ${result.exitCode}: ${envelope.errors?.join('; ') || envelope.result || result.stderr.slice(0, 1000) || 'API error without message'}`;
      const classified = classifyFailure(new Error(message), role); throw new FlowError(classified.kind === 'unknown' ? 'supervisor' : classified.kind, message);
    }
    if (envelope.session_id) state.claudeSessionId = envelope.session_id;
    store.save(state);
    return validate<T>(schema, envelope.structured_output);
  }
  async plan(state: State, store: Store, signal: AbortSignal): Promise<Plan> {
    const context = await callContext(state, store, 'plan', signal);
    const repository = context ? undefined : await repositoryContext(state.workspace, signal);
    const onboarding = state.purpose === 'context-onboarding' ? '本轮只建档：仅修改 docs/project-context/ 下约定文档。按真实代码核查划分模块；不复制已有资料全文，不改源码/资源/依赖/运行配置；契约和决策只写有真实依据的 proposed，不伪造用户确认，不为凑数创建提议。由程序 context-stamp 计算哈希。' : '';
    const prompt = JSON.stringify({ action: 'Plan goal into small implementation tasks with concrete acceptance criteria. Use dependsOn for prerequisite task IDs and acceptanceStage only from configured stage names. Set humanDecision to null for a ready plan. If requirements are unclear or a forbidden action is necessary, set humanDecision to the specific question and return no tasks. Controller independent acceptance uses only configured tests. You may inspect the repository, run your own checks, and directly fix necessary small bugs or configuration issues with native tools. Keep instructions and criteria concise.' + (context ? ' Use moduleIds to declare relevant modules from the live catalog; inspect documents/code with native tools as needed. proposed contracts/decisions are suggestions, not accepted requirements. ' + onboarding : ''), goal: state.goal, repository, context, feedback: state.feedback, tests: this.config.tests, acceptanceStages: state.config.acceptanceStages, taskStages: state.config.taskStages });
    recordContextPrompt(store, context, prompt);
    return this.claude(state, store, signal, planSchema, prompt, 'plan');
  }
  async execute(state: State, store: Store, signal: AbortSignal): Promise<ExecutionResult> {
    const env = nativeAgentEnv();
    let edits: unknown;
    const record = activityRecorder(state, store, 'codex', `codex:${state.loops}`);
    const context = await callContext(state, store, 'execute', signal);
    const repository = context ? undefined : await repositoryContext(state.workspace, signal);
    const action = this.executionMode === 'native'
      ? 'Use native tools to explore the repository, directly implement the task, run tests and debug failures until resolved. Report actual changes and verification in Chinese. Do not return full file contents for Controller to apply.'
      : 'Compatibility proposal mode: inspect with native tools, but return full UTF-8 file contents in changes for Controller to apply. Do not directly edit the workspace in this mode. Return the requested JSON schema.';
    const prompt = JSON.stringify({ action: action + (state.purpose === 'context-onboarding' ? ' 本轮只建档，仅写 docs/project-context/ 的约定文档，按实际代码核查，不改业务源码及配置。契约/决策只生成有真实依据的 proposed，不伪造用户确认；运行给定 context-stamp 命令盖章。' : ''), rules: agentRules, goal: state.goal, repository, context, task: state.tasks[state.taskIndex], feedback: state.feedback, evidence: context ? reviewEvidence(state.evidence) : state.evidence });
    recordContextPrompt(store, context, prompt);
    const result = await this.run(process.execPath, [fileURLToPath(new URL('./codex-worker.js', import.meta.url))], {
      cwd: store.dir, env, signal, timeoutMs: this.config.timeoutMs, streamOutput: true, input: JSON.stringify({ workspace: state.workspace, threadId: state.codexThreadId, prompt, executionMode: this.executionMode }),
      onLine(line) {
        if (!line.trim()) return;
        const event = JSON.parse(line) as { type: string; id?: string; data?: unknown };
        if (event.type === 'thread') { state.codexThreadId = event.id!; store.save(state); store.audit('codex-thread', { id: event.id }); }
        else if (event.type === 'activity') record(event.data as import('./telemetry.js').PublicActivity);
        else if (event.type === 'result') { if (edits !== undefined) throw new Error('Duplicate SDK worker result'); edits = event.data; }
        else throw new Error('Unexpected SDK worker protocol');
      }
    });
    state.executorExitCode = result.exitCode; store.save(state); store.audit('codex-exit', { exitCode: result.exitCode, stderr: result.stderr.slice(0, 2000) });
    if (result.exitCode !== 0) {
      const message = `Codex SDK worker exited ${result.exitCode}: ${result.stderr.slice(0, 1500)}`;
      const classified = classifyFailure(new Error(message), 'execute'); throw new FlowError(classified.kind === 'unknown' ? 'executor' : classified.kind, message);
    }
    return validate<ExecutionResult>(this.executionMode === 'native' ? nativeResultSchema : editSchema, edits);
  }
  async review(state: State, store: Store, signal: AbortSignal): Promise<Review> {
    const context = await callContext(state, store, 'review', signal);
    const evidence = reviewEvidence(state.evidence);
    const task = state.tasks[state.taskIndex];
    const prerequisites = state.tasks.filter(previous => task?.dependsOn?.includes(previous.id)).map(previous => ({ id: previous.id, acceptance: previous.acceptance, completed: state.completedTaskIds?.includes(previous.id) ?? false }));
    const prompt = JSON.stringify({ action: 'Use native tools to inspect the repository and review every criterion, diff, task context, exit code and independent tests. You may directly repair necessary small problems and run your own tests. Controller will independently revalidate all your changes before accepting them. pass only if every criterion is satisfied; rework for fixes; human for decisions or omitted diff; fail to terminate. Keep reason concise. Screenshot metadata and paths are not image pixels. Request human visual confirmation if required screenshots have not been reviewed; do not claim to have seen them.' + (context ? ' proposed 契约和决策尚未确认，不得将提议当成用户已接受的要求。' : '') + (state.purpose === 'context-onboarding' ? ' 本轮只建档；只可修改约定文档，核查格式、真实依据、模块划分与程序盖章，不批准或应用交付。' : ''), task, prerequisites, evidence, feedback: state.feedback, ...(context ? { context, changedFiles: state.evidence?.status } : {}) });
    recordContextPrompt(store, context, prompt);
    store.audit('review-context', { bytes: Buffer.byteLength(prompt), fullEvidenceBytes: Buffer.byteLength(JSON.stringify(state.evidence)), evidence });
    return this.claude(state, store, signal, reviewSchema, prompt, 'review');
  }
}
