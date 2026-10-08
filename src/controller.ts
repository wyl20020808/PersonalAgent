import { existsSync, realpathSync, unlinkSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { configSchema, editSchema, nativeResultSchema, planSchema, reviewSchema, validate, type Config, type Edits, type Plan, type Review } from './schema.js';
import { Store, atomicJson, type Phase, type State } from './store.js';
import { collectEvidence, prepare, snapshot, git } from './workspace.js';
import type { Agents } from './adapters.js';
import { runProcess } from './process.js';
import { assertClaudeBudget } from './budget.js';
import { classifyFailure, FlowError } from './failure.js';
import { journalFile, prepareApplication, recoverApplication } from './application.js';
import { orderTasks, assertPrerequisites } from './dependencies.js';
import { captureBaseline, baselineDiff, reviewEvidence } from './incremental.js';

export async function createRun(config: Config, source: string, goal: string): Promise<Store> {
  validate(configSchema, config); if (!goal.trim()) throw new Error('Goal is required');
  const store = new Store(config.runtimeDir, randomUUID());
  const workspace = store.file('workspace');
  const base = await prepare(source, workspace, config);
  const state: State = { version: 1, id: store.id, goal, source: path.resolve(source), workspace, base, config, phase: 'planning', nextPhase: 'planning', tasks: [], taskIndex: 0, loops: 0, reworks: 0, claudeSessionId: null, codexThreadId: null, feedback: '', reason: '', evidence: null, executorExitCode: -1, updatedAt: '', beforeExecution: '' };
  state.claudeCalls = 0; state.totalReworks = 0; state.completedTaskIds = []; store.save(state); store.audit('created', { source: state.source, workspace, base, goal }); return store;
}
export async function drive(store: Store, agents: Agents, decision?: string, externalSignal?: AbortSignal, limits?: { maxLoops?: number; maxReworks?: number; maxClaudeCalls?: number }): Promise<State> {
  const unlock = store.lock(); let state: State;
  try {
    state = store.load();
    if (state.workspace !== store.file('workspace') || realpathSync(state.workspace).toLowerCase() !== path.resolve(state.workspace).toLowerCase()) throw new Error('Persisted workspace path mismatch or junction redirect');
  }
  catch (error) { unlock(); throw error; }
  const stop = new AbortController();
  const abort = () => stop.abort(); externalSignal?.addEventListener('abort', abort, { once: true });
  if (externalSignal?.aborted) stop.abort();
  const poll = setInterval(() => { if (existsSync(store.file('stop.request'))) stop.abort(); }, 100);
  const checkpoint = (phase: Phase, reason = '') => { state.phase = phase; state.reason = reason; store.save(state); store.audit('transition', { phase, reason, loops: state.loops, taskIndex: state.taskIndex, reworks: state.reworks, totalReworks: state.totalReworks ?? 0, claudeCalls: state.claudeCalls ?? 0 }); };
  async function agentOperation<T>(agent: 'claude' | 'codex', role: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const started = Date.now(), before = await snapshot(state.workspace, stop.signal);
    const baseline = `agent-${agent}-${role}-${state.loops}-${state.claudeCalls ?? 0}-${started}-baseline.json`;
    await captureBaseline(store, state, baseline, stop.signal);
    store.audit('agent-start', { agent, role, taskId: state.tasks[state.taskIndex]?.id ?? null, loop: state.loops });
    try { return await timed(operation); }
    finally {
      // Processes have exited (or been killed) before recording their real diff.
      const after = await snapshot(state.workspace);
      const diff = await baselineDiff(store, state, baseline, new AbortController().signal);
      store.audit('agent-finish', { agent, role, taskId: state.tasks[state.taskIndex]?.id ?? null, loop: state.loops, durationMs: Date.now() - started, before, after, changed: before !== after, diff, status: await git(state.workspace, ['status', '--porcelain=v1']) });
    }
  }
  async function timed<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const timeout = AbortSignal.timeout(state.config.timeoutMs);
    const signal = AbortSignal.any([stop.signal, timeout]);
    try { return await operation(signal); }
    catch (error) { if (timeout.aborted) throw new Error(`Timeout after ${state.config.timeoutMs} ms`); throw error; }
  }
  try {
    if (state.phase === 'completed') return state;
    if (limits && Object.values(limits).some(value => value !== undefined)) {
      if (!decision?.trim() || !['paused', 'failed', 'stopped'].includes(state.phase)) throw new Error('Changing limits requires paused run and explicit --decision');
      const nextConfig = { ...state.config, ...Object.fromEntries(Object.entries(limits).filter(([, value]) => value !== undefined)) };
      validate(configSchema, nextConfig); state.config = nextConfig; store.save(state); store.audit('limits-updated', limits);
    }
    if (state.phase === 'failed' && state.failure && !state.failure.recoverable) return state;
    if (state.phase === 'executing' && state.nativeExecution && existsSync(store.file(`native-result-${state.loops}.json`))) {
      const saved = JSON.parse(readFileSync(store.file(`native-result-${state.loops}.json`), 'utf8'));
      validate(nativeResultSchema, saved.result);
      if (saved.snapshot !== await snapshot(state.workspace, stop.signal) || saved.head !== await git(state.workspace, ['rev-parse', 'HEAD'], stop.signal)) throw new FlowError('safety', 'Native result workspace changed during recovery');
      state.executorExitCode = 0; state.nextPhase = 'verify'; checkpoint('verify');
      store.audit('native-result-recovered', { loop: state.loops });
    }
    if (state.phase === 'executing' && !state.nativeExecution && existsSync(journalFile(store, state))) checkpoint('applying');
    if (['paused', 'executing', 'stopped', 'failed'].includes(state.phase)) {
      if (!decision?.trim()) {
        if (state.phase !== 'paused') {
          if (state.phase === 'executing') { state.nextPhase = 'execute'; state.reworkPending = true; state.failure = classifyFailure(new FlowError('interrupted', 'Execution interrupted before durable result; existing file changes are preserved'), 'executing'); }
          checkpoint('paused', state.reason || 'Resume requires --decision with user instructions; interrupted execution is never silently replayed');
        }
        return state;
      }
      state.feedback = [state.feedback, `User decision: ${decision}`].filter(Boolean).join('\n');
      if (existsSync(store.file('stop.request'))) unlinkSync(store.file('stop.request'));
      if (state.phase === 'executing') { state.nextPhase = 'execute'; state.reworkPending = true; }
      // Legacy paused runs also retain the reason needed to enforce old limits.
      if (state.reason === 'Rework limit reached') state.reworkPending = true;
      state.failure = null;
      checkpoint(state.nextPhase === 'review' ? 'verify' : state.nextPhase);
      store.audit('human-decision', { decision });
    }
    while (!['completed', 'paused', 'failed', 'stopped'].includes(state.phase)) {
      if (stop.signal.aborted) throw new Error('Stopped');
      if (state.phase !== 'planning') {
        orderTasks(state.tasks, state.config);
        assertPrerequisites(state.tasks, state.taskIndex, state.completedTaskIds ?? (state.tasks.some(task => task.dependsOn?.length) ? [] : state.tasks.slice(0, state.taskIndex).map(task => task.id)));
      }
      if (state.config.mode === 'real' && ['planning', 'execute'].includes(state.phase)) assertClaudeBudget(state);
      if (state.phase === 'planning') {
        state.nextPhase = 'planning'; store.save(state);
        const plan = validate<Plan>(planSchema, await agentOperation('claude', 'plan', signal => agents.plan(state, store, signal)));
        if (plan.humanDecision) { store.audit('planning-human-decision', plan); state.nextPhase = 'planning'; checkpoint('paused', plan.humanDecision); continue; }
        if (!plan.tasks.length) throw new Error('Plan must include tasks or request human decision');
        if (plan.tasks.length < (state.config.minTasks ?? 1)) throw new Error('Plan has fewer tasks than configured minTasks');
        if (new Set(plan.tasks.map(task => task.id)).size !== plan.tasks.length) throw new Error('Duplicate task IDs');
        state.tasks = orderTasks(plan.tasks, state.config); state.completedTaskIds = []; store.audit('plan', { ...plan, tasks: state.tasks }); checkpoint('execute');
      } else if (state.phase === 'execute') {
        if (state.loops >= state.config.maxLoops) { state.nextPhase = 'execute'; checkpoint('paused', 'Loop limit reached'); break; }
        if (state.reworkPending) {
          if (state.reworks >= state.config.maxReworks) { state.nextPhase = 'execute'; checkpoint('paused', 'Rework limit reached'); break; }
          state.reworks++; state.totalReworks = (state.totalReworks ?? 0) + 1; state.reworkPending = false;
        }
        state.beforeExecution = await snapshot(state.workspace, stop.signal);
        await captureBaseline(store, state, `task-${state.taskIndex}-baseline.json`, stop.signal);
        await captureBaseline(store, state, `round-${state.loops + 1}-baseline.json`, stop.signal);
        state.nativeExecution = agents.executionMode === 'native';
        state.loops++; state.nextPhase = 'execute'; state.evidence = null; state.executorExitCode = -1; checkpoint('executing');
        const result = await agentOperation('codex', 'execute', signal => agents.execute(state, store, signal));
        if (stop.signal.aborted) throw new Error('Stopped');
        if ('mode' in result && result.mode === 'native') {
          validate(nativeResultSchema, result);
          if (!state.nativeExecution) throw new FlowError('safety', 'Unexpected native result in proposal mode');
          atomicJson(store.file(`native-result-${state.loops}.json`), { result, snapshot: await snapshot(state.workspace, stop.signal), head: await git(state.workspace, ['rev-parse', 'HEAD'], stop.signal) });
          state.executorExitCode = 0; state.nextPhase = 'verify';
          store.audit('native-result', { ...result, loop: state.loops }); checkpoint('verify'); continue;
        }
        if (state.nativeExecution) throw new FlowError('safety', 'Native execution returned a file proposal; refusing duplicate application');
        const edits = validate<Edits>(editSchema, result);
        for (const change of edits.changes) {
          const ignored = await runProcess('git', ['check-ignore', '--no-index', '--', change.path], { cwd: state.workspace, signal: stop.signal, timeoutMs: state.config.timeoutMs });
          if (ignored.exitCode === 0) throw new Error(`Ignored edit target cannot be reviewed: ${change.path}`);
          if (ignored.exitCode !== 1) throw new Error(`Git ignore policy check failed: ${ignored.stderr}`);
        }
        if (await snapshot(state.workspace, stop.signal) !== state.beforeExecution) throw new FlowError('safety', 'Workspace changed during read-only execution');
        prepareApplication(store, state, edits); state.executorExitCode = 0; state.nextPhase = 'applying'; checkpoint('applying');
      } else if (state.phase === 'applying') {
        const edits = recoverApplication(store, state);
        store.audit('edits-applied', { summary: edits.summary, paths: edits.changes.map(change => change.path) }); checkpoint('verify');
      } else if (state.phase === 'verify') {
        state.nextPhase = 'verify'; store.save(state);
        state.evidence = await collectEvidence(state, stop.signal);
        const taskDiff = await baselineDiff(store, state, `task-${state.taskIndex}-baseline.json`, stop.signal);
        const roundDiff = await baselineDiff(store, state, `round-${state.loops}-baseline.json`, stop.signal);
        if (taskDiff !== undefined) state.evidence.taskDiff = taskDiff;
        if (roundDiff !== undefined) state.evidence.roundDiff = roundDiff;
        const contextSummary = reviewEvidence(state.evidence) as { fullDiffHash: string; taskDiffHash: string | null; roundDiffHash: string; diffOmitted: boolean };
        store.audit('diff-context', { fullDiffHash: contextSummary.fullDiffHash, taskDiffHash: contextSummary.taskDiffHash, roundDiffHash: contextSummary.roundDiffHash, diffOmitted: contextSummary.diffOmitted });
        store.audit('independent-check', state.evidence); checkpoint('review');
      } else if (state.phase === 'review') {
        state.nextPhase = 'verify'; store.save(state);
        if (!state.evidence || await snapshot(state.workspace, stop.signal) !== state.evidence.snapshotDigest || await git(state.workspace, ['rev-parse', 'HEAD'], stop.signal) !== state.evidence.head) {
          if (state.nativeExecution) {
            state.failure = classifyFailure(new FlowError('interrupted', '审查快照已变化；保留原生修改，恢复后重新独立验收'), 'review');
            store.audit('review-snapshot-interrupted', { loop: state.loops }); checkpoint('paused', state.failure.message); continue;
          }
          throw new Error('Workspace changed after independent verification');
        }
        const context = { runId: state.id, task: state.tasks[state.taskIndex], taskIndex: state.taskIndex, loop: state.loops, head: state.evidence.head, snapshotDigest: state.evidence.snapshotDigest, feedback: state.feedback, evidenceDigest: createHash('sha256').update(JSON.stringify({ tests: state.evidence.tests, issues: state.evidence.issues, passed: state.evidence.passed, executorExitCode: state.evidence.executorExitCode, ...(state.evidence.acceptanceRulesHash === undefined ? {} : { acceptanceRulesHash: state.evidence.acceptanceRulesHash }), ...(state.evidence.roundDiff === undefined ? {} : { roundDiff: state.evidence.roundDiff, taskDiff: state.evidence.taskDiff }) })).digest('hex') };
        const key = createHash('sha256').update(JSON.stringify(context)).digest('hex');
        const receipt = store.file(`review-${state.loops}-${key}.json`);
        let review: Review;
        if (existsSync(receipt)) {
          const saved = JSON.parse(readFileSync(receipt, 'utf8')) as { context: typeof context; review: Review };
          if (JSON.stringify(saved.context) !== JSON.stringify(context)) throw new FlowError('safety', 'Review receipt context mismatch');
          review = validate<Review>(reviewSchema, saved.review); store.audit('review-recovered', { receipt });
        } else {
          review = validate<Review>(reviewSchema, await agentOperation('claude', 'review', signal => agents.review(state, store, signal)));
          atomicJson(receipt, { context, review });
        }
        store.audit('review', review);
        if (await snapshot(state.workspace, stop.signal) !== state.evidence.snapshotDigest) {
          store.audit('review-modified-workspace', { verdict: review.verdict, reason: review.reason, before: state.evidence.snapshotDigest, after: await snapshot(state.workspace, stop.signal) });
          if (review.verdict === 'human') { state.nextPhase = 'verify'; checkpoint('paused', review.reason); }
          else if (review.verdict === 'fail') { state.failure = classifyFailure(new FlowError('rejected', review.reason), 'review'); checkpoint('failed', review.reason); }
          else { state.nextPhase = 'verify'; checkpoint('verify', 'Claude 修改后重新独立验收和审查'); }
          continue;
        }
        if (review.verdict === 'human') { state.nextPhase = 'verify'; checkpoint('paused', review.reason); }
        else if (review.verdict === 'fail') { state.failure = classifyFailure(new FlowError('rejected', review.reason), 'review'); checkpoint('failed', review.reason); }
        else if (review.verdict === 'pass' && state.evidence?.passed) {
          if ((reviewEvidence(state.evidence) as { diffOmitted: boolean }).diffOmitted) { state.nextPhase = 'verify'; checkpoint('paused', 'Review context omitted diff; human inspection required'); continue; }
          state.completedTaskIds ??= state.tasks.slice(0, state.taskIndex).map(task => task.id);
          if (!state.completedTaskIds.includes(state.tasks[state.taskIndex]!.id)) state.completedTaskIds.push(state.tasks[state.taskIndex]!.id);
          state.taskIndex++; state.reworks = 0; state.reworkPending = false; state.failure = null; state.feedback = '';
          checkpoint(state.taskIndex >= state.tasks.length ? 'completed' : 'execute');
        } else {
          state.feedback = `${review.reason}\n${state.evidence?.issues.join('\n') ?? 'No evidence'}`;
          if (review.verdict === 'pass') store.audit('review-vetoed', { reason: 'Independent verification failed' });
          state.nextPhase = 'execute'; state.reworkPending = true;
          if (state.reworks >= state.config.maxReworks) checkpoint('paused', 'Rework limit reached');
          else checkpoint('execute');
        }
      } else { throw new Error(`Unexpected phase ${state.phase}`); }
    }
  } catch (error) {
    const stage = state.phase;
    state.failure = classifyFailure(error, stage);
    if (stage === 'executing') {
      if (!state.nativeExecution && existsSync(journalFile(store, state))) state.nextPhase = 'applying';
      else {
        state.nextPhase = 'execute'; state.reworkPending = true;
        store.audit('execution-interrupted', { native: state.nativeExecution ?? false, before: state.beforeExecution, after: await snapshot(state.workspace), note: '保留已有修改；续接同一 Thread，不重新应用文件提案' });
      }
    } else if (['planning', 'execute', 'applying', 'verify', 'review'].includes(stage)) state.nextPhase = stage === 'review' ? 'verify' : stage;
    if (stop.signal.aborted) state.failure = classifyFailure(new FlowError('interrupted', 'Stopped'), stage);
    checkpoint(stop.signal.aborted ? 'stopped' : state.failure.recoverable ? 'paused' : 'failed', state.failure.message);
    store.audit('error', state.failure);
  } finally { clearInterval(poll); externalSignal?.removeEventListener('abort', abort); unlock(); }
  return state;
}
