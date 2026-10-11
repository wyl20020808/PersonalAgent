import { existsSync, realpathSync, unlinkSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { configSchema, editSchema, nativeResultSchema, planSchema, reviewSchema, validate, type Config, type Edits, type Plan, type Review } from './schema.js';
import { Store, atomicJson, type Evidence, type Phase, type State } from './store.js';
import { collectEvidence, prepare, observeWorkspace, git, workspaceHead, workspaceStatus } from './workspace.js';
import { lockProject, captureProject } from './project-files.js';
import { observationScope, contextObservation, gitObservation } from './project-observation.js';
import type { Agents } from './adapters.js';
import { gitProcess, validateGitObjects } from './git-process.js';
import { classifyFailure, FlowError } from './failure.js';
import { assertOperationPolicy, readInteractionPolicy } from './interaction-policy.js';
import { journalFile, prepareApplication, recoverApplication } from './application.js';
import { orderTasks, assertPrerequisites } from './dependencies.js';
import { captureBaseline, baselineDiff, reviewEvidence } from './incremental.js';
import { assertOnboardingScope, assertRunContext } from './context-onboarding.js';
import { loadProjectContext } from './project-context.js';
import { assertPlanningContext, freezeTaskContext, checkTaskContext, contextReviewProblems, normalizeContractReferences, reviewContractCatalog, taskContextBaseline } from './context-review.js';
import { prepareUnlocked, pendingContextConfirmations } from './context-confirmation.js';
import { decisionIdentity, assertDecisionState } from './decision-agent.js';
import { assertExecutionState } from './opencode-execution-agent.js';
import { initializeDiscussion, assertDiscussion, assertDiscussionPlan } from './decision-discussion.js';
import { timeoutSignal } from './timeout.js';
import { assertDeliveryAcceptanceRules } from './rules.js';
import {claimGuidance,claimPendingGuidance,processingGuidance,pendingGuidance,finishGuidance} from './steering.js';
import {withGuidanceHandoff,GuidanceHandoff} from './guidance-handoff.js';

export async function createRun(config: Config, source: string, goal: string, options: { purpose?: 'context-onboarding' } = {}): Promise<Store> {
  config = validate<Config>(configSchema, config);
  if (options.purpose === 'context-onboarding') throw new Error('Project Context onboarding isolation is unavailable without a content baseline. Maintain documents in authorized direct development.');
  if (!config.projectMode && !existsSync(path.join(source,'.git'))) config = {...config, projectMode:'direct'};
  if (config.projectMode === 'direct' && config.executionMode === 'proposal') throw new Error('Direct project mode requires native execution'); if (!goal.trim()) throw new Error('Goal is required');
  if (config.projectMode === 'direct') config = {...config,executionMode:'native'};
  if(config.mode==='mock' && config.projectMode && !options.purpose) for(const marker of ['hello','done']) { const file=path.join(source,marker+'.txt'); if(existsSync(file) && readFileSync(file,'utf8')!==marker+'\n') throw new Error('Mock 标记文件已存在且内容不同，拒绝覆盖'); }
  const store = new Store(config.runtimeDir, randomUUID());
  const isolated = store.file('workspace');
  let releasePreparation: (() => void) | undefined;
  let canonicalSource = path.resolve(source);
  let base: string;
  try {
    canonicalSource = realpathSync(source);
    releasePreparation = lockProject({ source: canonicalSource, config } as State);
    base = await prepare(source, isolated, config);
    assertDeliveryAcceptanceRules({ config, workspace: config.projectMode === 'direct' ? canonicalSource : isolated });
  }
  catch (error) {
    // Keep a durable, inspectable failure even when clone/preparation never completes.
    {
      const failure=classifyFailure(error,'prepare');
      const failed:State={version:1,id:store.id,goal,source:canonicalSource,workspace:config.projectMode==='direct'?canonicalSource:isolated,base:'',config,phase:'failed',nextPhase:'planning',tasks:[],taskIndex:0,loops:0,reworks:0,totalReworks:0,claudeCalls:0,completedTaskIds:[],reworkPending:false,claudeSessionId:null,codexThreadId:null,feedback:'',reason:failure.message,failure,evidence:null,executorExitCode:-1,updatedAt:'',beforeExecution:''};
      failed.snapshotPolicy = 'none';
      failed.decisionAgent = decisionIdentity(config);
      initializeDiscussion(failed);
      store.save(failed);store.audit('transition',{phase:'failed',reason:failed.reason,loops:0,reworks:0});store.audit('error',failure);
      if (error instanceof FlowError) error.runId=store.id;
      else { const durable = new FlowError(failure.kind, failure.message); durable.runId=store.id; throw durable; }
    }
    throw error;
  } finally { releasePreparation?.(); }
  const workspace = config.projectMode === 'direct' ? realpathSync(source) : isolated;
  const state: State = { version: 1, id: store.id, goal, source: realpathSync(source), workspace, base, config, phase: 'planning', nextPhase: 'planning', tasks: [], taskIndex: 0, loops: 0, reworks: 0, claudeSessionId: null, codexThreadId: null, feedback: '', reason: '', evidence: null, executorExitCode: -1, updatedAt: '', beforeExecution: '' };
  state.snapshotPolicy = 'none';
  state.decisionAgent = decisionIdentity(config);
  initializeDiscussion(state);
  if (options.purpose) state.purpose = options.purpose;
  if (loadProjectContext(workspace).enabled) state.projectContextEnabled = true;
  state.claudeCalls = 0; state.totalReworks = 0; state.completedTaskIds = []; store.save(state); store.audit('created', { source: state.source, workspace, base, goal });
  store.audit('project-observation-policy', { policy: 'none', coverage: observationScope });
  return store;
}
export async function drive(store: Store, agents: Agents, decision?: string, externalSignal?: AbortSignal, limits?: { maxLoops?: number; maxReworks?: number; timeoutMs?: number }, intent: 'resume' | 'visual' | 'rework' = 'resume'): Promise<State> {
  const unlock = store.lock(); let state: State; let releaseProject: (() => void) | undefined;
  try {
    state = store.load();
    if (!['resume', 'visual', 'rework'].includes(intent)) throw new Error('Unknown resume intent');
    if (intent === 'rework' && (!decision?.trim() || !['paused', 'failed', 'stopped'].includes(state.phase) || !state.tasks[state.taskIndex] || !['execute', 'verify', 'review'].includes(state.nextPhase))) throw new Error('返工需要明确修改意见、暂停的当前任务；规划或提案应用中断请先恢复原流程');
    assertDecisionState(state);
    assertDiscussion(state);
    assertExecutionState(state);
    if(state.phase==='failed' && state.failure?.stage==='prepare' && !state.failure.recoverable){unlock();return state;}
    if(state.config.projectMode==='direct' && agents.executionMode!=='native') throw new Error('Direct project mode requires native execution adapter');
    if (state.workspace !== (state.config.projectMode === 'direct' ? realpathSync(state.source) : store.file('workspace')) || realpathSync(state.workspace).toLowerCase() !== path.resolve(state.workspace).toLowerCase()) throw new Error('Persisted workspace path mismatch or junction redirect');
    releaseProject=lockProject({...state, source: state.workspace, config: {...state.config, projectMode: 'direct'}});
  }
  catch (error) { unlock(); throw error; }
  const stop = new AbortController();
  const abort = () => stop.abort(); externalSignal?.addEventListener('abort', abort, { once: true });
  if (externalSignal?.aborted) stop.abort();
  const poll = setInterval(() => { if (existsSync(store.file('stop.request'))) stop.abort(); }, 100);
  const checkpoint = (phase: Phase, reason = '') => { state.phase = phase; state.reason = reason; store.save(state); store.audit('transition', { phase, reason, loops: state.loops, taskIndex: state.taskIndex, reworks: state.reworks, totalReworks: state.totalReworks ?? 0, claudeCalls: state.claudeCalls ?? 0 }); };
  const reworkLimited = () => state.config.maxReworks !== undefined && state.reworks >= state.config.maxReworks;
  function advanceReadyTask(): void {
    const completed = state.completedTaskIds ?? [], deferred = state.deferredTaskIds ?? [];
    const next = state.tasks.findIndex(task => !completed.includes(task.id) && !deferred.includes(task.id) && (task.dependsOn ?? []).every(id => completed.includes(id)));
    state.reworks = 0; state.reviewRepairs = 0; state.reworkPending = false; state.failure = null; state.feedback = '';
    if (next >= 0) { state.taskIndex = next; state.nextPhase = 'execute'; checkpoint('execute'); }
    else if (deferred.length) {
      state.taskIndex = state.tasks.findIndex(task => deferred.includes(task.id)); state.nextPhase = 'verify';
      checkpoint('paused', 'deferred_by_work_mode / requires_system_authorization：相关节点验收 pending，其他可运行独立任务已处理。GUI/重型步骤需 idle 后明确恢复；系统高风险仍拒绝，idle 不授予授权。');
    } else { state.taskIndex = state.tasks.length; state.nextPhase = 'execute'; checkpoint(pendingGuidance(store).length ? 'execute' : 'completed'); }
  }
  async function agentOperation<T>(agent: 'claude' | 'codex' | 'opencode', role: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    assertOperationPolicy({ kind: 'model' });
    if (!(role === 'review' && state.evidence?.contextReport) && !(role === 'execute' && taskContextBaseline(state, store))) assertRunContext(state, store);
    if(state.snapshotPolicy !== 'none' && existsSync(path.join(state.workspace,'.git')))await validateGitObjects(state.workspace,await workspaceHead(state,stop.signal),stop.signal);
    const started = Date.now(), before = await observeWorkspace(state, stop.signal);
    const baseline = `agent-${agent}-${role}-${state.loops}-${state.claudeCalls ?? 0}-${started}-baseline.json`;
    await captureBaseline(store, state, baseline, stop.signal);
    store.audit('agent-start', { agent, role, taskId: state.tasks[state.taskIndex]?.id ?? null, loop: state.loops });
    try { return await timed(signal=>withGuidanceHandoff(store,signal,operation), role === 'plan' && state.discussion && !state.discussion.closed ? state.config.timeoutMs * (3 + 2 * state.discussion.config.rounds) : state.config.timeoutMs); }
    finally {
      // Processes have exited (or been killed) before recording their real diff.
      const after = await observeWorkspace(state, undefined);
      const diff = state.snapshotPolicy === 'none' ? (await gitObservation(state.workspace)).diff : await baselineDiff(store, state, baseline, new AbortController().signal);
      store.audit('agent-finish', { agent, role, taskId: state.tasks[state.taskIndex]?.id ?? null, loop: state.loops, durationMs: Date.now() - started, before, after, changed: state.snapshotPolicy === 'none' && !existsSync(path.join(state.workspace,'.git')) ? null : before !== after, verificationScope: state.snapshotPolicy === 'none' ? observationScope : undefined, diff, status: await workspaceStatus(state) });
      assertOnboardingScope(state, store);
      if (role === 'plan') assertPlanningContext(state, store);
    }
  }
  async function timed<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = state.config.timeoutMs): Promise<T> {
    const timeout = timeoutSignal(timeoutMs);
    const signal = AbortSignal.any([stop.signal, timeout]);
    try { return await operation(signal); }
    catch (error) { if (timeout.aborted) throw new Error(`Timeout after ${timeoutMs} ms`); throw error; }
  }
  async function checkedEvidence(): Promise<Evidence> {
    return withGuidanceHandoff(store,stop.signal,async signal=>{
    const contextReport = checkTaskContext(state, store);
    const finalNode = state.tasks.every((task, index) => index === state.taskIndex || state.completedTaskIds?.includes(task.id));
    const evidence = await collectEvidence(state, signal, state.nativeExecution === true && finalNode);
    if (contextReport) {
      if (contextObservation(state, taskContextBaseline(state, store)?.context).digest !== contextReport.snapshot) throw new FlowError('safety', '模块检查后工作区变化；必须重新检查和独立验收');
      evidence.contextReport = contextReport;
    }
    return evidence;
    });
  }
  try {
    if (state.phase === 'completed') return state;
    if (state.phase === 'planning' && state.discussion?.steps.some(s => s.status === 'running')) {
      for (const step of state.discussion.steps.filter(s => s.status === 'running')) { step.status = 'interrupted'; step.error = '规划进程中断，调用是否完成未知；需要明确恢复指令'; store.audit('discussion-step-failed', { participantId: step.participantId, participantAgent: state.discussion.participants.find(p=>p.id===step.participantId)!.agent, discussionStage: step.stage, status: step.status, error: step.error }); }
      state.nextPhase = 'planning'; state.failure = classifyFailure(new FlowError('interrupted', '双决策调用中断；保留已完成初稿、Session 和调用次数。恢复需要明确指令。'), 'planning');
      checkpoint('paused', state.failure.message);
    }
    if (limits && Object.values(limits).some(value => value !== undefined)) {
      if (!decision?.trim() || !['paused', 'failed', 'stopped'].includes(state.phase)) throw new Error('Changing limits requires paused run and explicit --decision');
      const nextConfig = { ...state.config, ...Object.fromEntries(Object.entries(limits).filter(([, value]) => value !== undefined)) };
      validate(configSchema, nextConfig); state.config = nextConfig; store.save(state); store.audit('limits-updated', limits);
    }
    if (state.phase === 'failed' && state.failure && !state.failure.recoverable) return state;
    if (state.phase === 'executing' && state.nativeExecution && existsSync(store.file(`native-result-${state.loops}.json`))) {
      const saved = JSON.parse(readFileSync(store.file(`native-result-${state.loops}.json`), 'utf8'));
      validate(nativeResultSchema, saved.result);
      if (state.snapshotPolicy !== 'none' && (saved.snapshot !== await observeWorkspace(state, stop.signal) || saved.head !== await workspaceHead(state,stop.signal))) throw new FlowError('safety', 'Native result workspace changed during recovery');
      state.executorExitCode = 0; state.nextPhase = 'verify'; checkpoint('verify');
      store.audit('native-result-recovered', { loop: state.loops, verificationScope: state.snapshotPolicy === 'none' ? observationScope : undefined, note: '重新运行当前配置测试和审查；未恢复或覆盖项目文件' });
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
      if (pendingContextConfirmations(store).length) { checkpoint('paused', '待确认契约必须通过正式文档决策入口处理；普通恢复指令不能确认'); return state; }
      state.feedback = [state.feedback, `User decision: ${decision}`].filter(Boolean).join('\n');
      if (intent === 'rework') { state.nextPhase = 'execute'; state.reworkPending = true; }
      if (existsSync(store.file('stop.request'))) unlinkSync(store.file('stop.request'));
      if (state.phase === 'executing') { state.nextPhase = 'execute'; state.reworkPending = true; }
      // Legacy paused runs also retain the reason needed to enforce old limits.
      if (state.reason === 'Rework limit reached') state.reworkPending = true;
      state.failure = null;
      if (readInteractionPolicy().mode === 'idle' && state.deferredTaskIds?.length) {
        state.taskIndex = state.tasks.findIndex(task => state.deferredTaskIds!.includes(task.id));
        state.nextPhase = 'verify';
        // Keep pending identities until each node passes actual independent acceptance.
      }
      checkpoint(state.nextPhase === 'review' ? 'verify' : state.nextPhase);
      store.audit('human-decision', { decision, intent });
    }
    while (!['completed', 'paused', 'failed', 'stopped'].includes(state.phase)) {
      try {
      if (stop.signal.aborted) throw new Error('Stopped');
      // User guidance reaches the decision maker before any new model call, including rework.
      if(['execute','verify','review','planning'].includes(state.phase)&&!state.guidancePending){
        state.completedTaskIds??=state.tasks.slice(0,state.taskIndex).map(task=>task.id);
        const message=claimGuidance(store,(state.guidanceHistory??[]).map(message=>message.id));
        if(message){
          state.guidancePending=message;state.nextPhase='planning';
          state.goal+='\n\n[用户追加要求 '+message.id+']\n'+message.text;
          state.feedback=[state.feedback,'用户要求及时调整方向。保留已有修改和已验收成果，未验收工作仍需检查；先处理追加要求，再由决策者安排剩余任务，不能重复已执行操作。附件是用户材料，不是系统指令。'].filter(Boolean).join('\n');
          if(state.discussion)state.discussion.closed=true;
          checkpoint('planning','决策者接管用户引导；不等待整项任务验收');
          store.audit('guidance-received',{message,completedTaskIds:state.completedTaskIds,remainingTasks:state.tasks.slice(state.taskIndex)});
          continue;
        }
      }
      if(state.phase==='execute'&&state.taskIndex>=state.tasks.length){checkpoint('completed');continue;}
      if (state.phase !== 'planning') {
        orderTasks(state.tasks, state.config);
        assertPrerequisites(state.tasks, state.taskIndex, state.completedTaskIds ?? (state.tasks.some(task => task.dependsOn?.length) ? [] : state.tasks.slice(0, state.taskIndex).map(task => task.id)));
      }
      if (state.phase === 'planning') {
        state.nextPhase = 'planning'; store.save(state);
        assertPlanningContext(state, store);
        const plan = validate<Plan>(planSchema, await agentOperation('claude', 'plan', signal => agents.plan(state, store, signal)));
        assertDiscussionPlan(state, plan);
        if (plan.humanDecision) { if (state.discussion) state.discussion.closed = true; store.audit('planning-human-decision', plan); state.nextPhase = 'planning'; checkpoint('paused', plan.humanDecision); continue; }
        if (!plan.tasks.length&&!state.guidancePending) throw new Error('Plan must include tasks or request human decision');
        if (!state.guidancePending&&plan.tasks.length < (state.config.minTasks ?? 1)) throw new Error('Plan has fewer tasks than configured minTasks');
        if (new Set(plan.tasks.map(task => task.id)).size !== plan.tasks.length) throw new Error('Duplicate task IDs');
        const context = loadProjectContext(state.workspace, state.projectContextEnabled === true);
        if (context.enabled && state.purpose !== 'context-onboarding') {
          const ids = new Set(context.modules.map(module => module.metadata.id));
          if (plan.tasks.some(task => !task.moduleIds?.length || task.moduleIds.some(id => !ids.has(id)))) {
            state.feedback = 'Project Context 已启用：每个开发任务必须声明至少一个现有且相关的 moduleIds。先通过原生工具探索模块目录和源码；新职责可先按建档规则补充业务模块再规划，不得随便填无关模块。';
            throw new FlowError('supervisor', state.feedback);
          }
        }
        const guidance=state.guidancePending;
        const completed=guidance?state.tasks.filter(task=>state.completedTaskIds?.includes(task.id)):[];
        if(guidance&&plan.tasks.some(task=>completed.some(previous=>previous.id===task.id)))throw new FlowError('validation','引导计划不能重复已验收任务 ID；需要修改既有成果时使用新任务 ID');
        state.tasks = orderTasks([...completed,...plan.tasks], state.config);
        state.taskIndex=completed.length;state.completedTaskIds=completed.map(task=>task.id);
        state.reworks=0;state.reviewRepairs=0;state.reworkPending=false;state.failure=null;
        const inputs=guidance?processingGuidance(store):[];
        if(guidance){state.guidanceHistory=[...(state.guidanceHistory??[]),...inputs];delete state.guidancePending;state.feedback='';}
        if (state.discussion) state.discussion.closed = true;
        state.phase='execute';state.nextPhase='execute';store.save(state);
        for(const input of inputs){finishGuidance(store,input);store.audit('guidance-applied',{messageId:input.id,completedTaskIds:state.completedTaskIds,tasks:plan.tasks});}
        store.audit('plan', { ...plan, tasks: state.tasks });
        checkpoint(state.taskIndex>=state.tasks.length&&!pendingGuidance(store).length?'completed':'execute');
      } else if (state.phase === 'execute') {
        if (state.discussion && !state.discussion.closed) throw new FlowError('safety', 'Discussion cycle has no Controller-validated final Plan');
        // Infrastructure must be healthy before charging a rework or execution attempt.
        if(state.snapshotPolicy !== 'none' && existsSync(path.join(state.workspace,'.git')))await validateGitObjects(state.workspace,await workspaceHead(state,stop.signal),stop.signal);
        // Limits are optional: desktop Runs carry none and are steered from chat; only an explicitly configured limit pauses.
        if (state.config.maxLoops !== undefined && state.loops >= state.config.maxLoops) { state.nextPhase = 'execute'; checkpoint('paused', 'Loop limit reached'); break; }
        if (state.reworkPending) {
          if (reworkLimited()) { state.nextPhase = 'execute'; checkpoint('paused', 'Rework limit reached'); break; }
          state.reworks++; state.totalReworks = (state.totalReworks ?? 0) + 1; state.reworkPending = false;
        }
        state.beforeExecution = await observeWorkspace(state, stop.signal);
        freezeTaskContext(state, store);
        await captureBaseline(store, state, `task-${state.taskIndex}-baseline.json`, stop.signal);
        await captureBaseline(store, state, `round-${state.loops + 1}-baseline.json`, stop.signal);
        state.nativeExecution = agents.executionMode === 'native';
        state.loops++; state.nextPhase = 'execute'; state.evidence = null; state.executorExitCode = -1; checkpoint('executing');
        assertExecutionState(state);
        const result = await agentOperation(state.config.executionAgent?.backend === 'opencode' ? 'opencode' : 'codex', 'execute', signal => agents.execute(state, store, signal));
        if (stop.signal.aborted) throw new Error('Stopped');
        if ('mode' in result && result.mode === 'native') {
          validate(nativeResultSchema, result);
          if (!state.nativeExecution) throw new FlowError('safety', 'Unexpected native result in proposal mode');
          atomicJson(store.file(`native-result-${state.loops}.json`), { result, snapshot: await observeWorkspace(state, stop.signal), head: await workspaceHead(state,stop.signal) });
          state.executorExitCode = 0; state.nextPhase = 'verify';
          store.audit('native-result', { ...result, agent: state.config.executionAgent?.backend ?? 'codex', sessionId: state.executionSession?.sessionId ?? state.codexThreadId, loop: state.loops }); checkpoint('verify'); continue;
        }
        if (state.nativeExecution) throw new FlowError('safety', 'Native execution returned a file proposal; refusing duplicate application');
        const edits = validate<Edits>(editSchema, result);
        for (const change of state.config.projectMode ? [] : edits.changes) {
          const ignored = await gitProcess(state.workspace, ['check-ignore', '--no-index', '--', change.path], { signal: stop.signal, timeoutMs: state.config.timeoutMs, allowedExitCodes:[0,1] });
          if (ignored.exitCode === 0) throw new Error(`Ignored edit target cannot be reviewed: ${change.path}`);
        }
        if (await observeWorkspace(state, stop.signal) !== state.beforeExecution) throw new FlowError('safety', 'Workspace changed during read-only execution');
        prepareApplication(store, state, edits); state.executorExitCode = 0; state.nextPhase = 'applying'; checkpoint('applying');
      } else if (state.phase === 'applying') {
        const edits = recoverApplication(store, state);
        store.audit('edits-applied', { summary: edits.summary, paths: edits.changes.map(change => change.path) }); checkpoint('verify');
      } else if (state.phase === 'verify') {
        state.nextPhase = 'verify'; store.save(state);
        state.evidence = await checkedEvidence();
        if (state.evidence.issues.some(issue => issue.startsWith('Asset or large-file content changed;'))) { store.audit('independent-check',state.evidence); state.nextPhase='verify'; checkpoint('paused','Asset/large-file content requires human review; exact hashes are in evidence.diff. Automatic safety PASS and delivery are blocked. Preserve changes for manual resource inspection, or restore the recorded baseline before resuming.'); continue; }
        if (!state.config.tests.length) { store.audit('independent-check',state.evidence); state.nextPhase='verify'; checkpoint('paused','No independent acceptance tests configured; human verification required'); continue; }
        const taskDiff = await baselineDiff(store, state, `task-${state.taskIndex}-baseline.json`, stop.signal);
        const roundDiff = await baselineDiff(store, state, `round-${state.loops}-baseline.json`, stop.signal);
        if (taskDiff !== undefined) state.evidence.taskDiff = taskDiff;
        if (roundDiff !== undefined) state.evidence.roundDiff = roundDiff;
        const contextSummary = reviewEvidence(state.evidence) as { fullDiffHash: string; taskDiffHash: string | null; roundDiffHash: string; diffOmitted: boolean };
        store.audit('diff-context', { fullDiffHash: contextSummary.fullDiffHash, taskDiffHash: contextSummary.taskDiffHash, roundDiffHash: contextSummary.roundDiffHash, diffOmitted: contextSummary.diffOmitted });
        store.audit('independent-check', state.evidence); checkpoint('review');
      } else if (state.phase === 'review') {
        state.nextPhase = 'verify'; store.save(state);
        if (!state.evidence || await observeWorkspace(state, stop.signal) !== state.evidence.snapshotDigest || await workspaceHead(state,stop.signal) !== state.evidence.head) {
          if (state.nativeExecution) {
            state.failure = classifyFailure(new FlowError('interrupted', '审查快照已变化；保留原生修改，恢复后重新独立验收'), 'review');
            store.audit('review-snapshot-interrupted', { loop: state.loops }); checkpoint('paused', state.failure.message); continue;
          }
          throw new Error('Workspace changed after independent verification');
        }
        const context = { runId: state.id, task: state.tasks[state.taskIndex], taskIndex: state.taskIndex, loop: state.loops, head: state.evidence.head, snapshotDigest: state.evidence.snapshotDigest, feedback: state.feedback, evidenceDigest: createHash('sha256').update(JSON.stringify({ tests: state.evidence.tests, issues: state.evidence.issues, passed: state.evidence.passed, executorExitCode: state.evidence.executorExitCode, ...(state.evidence.acceptanceRulesHash === undefined ? {} : { acceptanceRulesHash: state.evidence.acceptanceRulesHash }), ...(state.evidence.roundDiff === undefined ? {} : { roundDiff: state.evidence.roundDiff, taskDiff: state.evidence.taskDiff }) })).digest('hex') };
        const key = createHash('sha256').update(JSON.stringify({ ...context, contextReport: state.evidence.contextReport })).digest('hex');
        const receipt = store.file(`review-${state.loops}-${key}.json`);
        let review: Review;
        if (state.snapshotPolicy !== 'none' && existsSync(receipt)) {
          const saved = JSON.parse(readFileSync(receipt, 'utf8')) as { context: typeof context; review: Review };
          if (JSON.stringify(saved.context) !== JSON.stringify(context)) throw new FlowError('safety', 'Review receipt context mismatch');
          review = validate<Review>(reviewSchema, saved.review); store.audit('review-recovered', { receipt });
        } else {
          review = validate<Review>(reviewSchema, await agentOperation('claude', 'review', signal => agents.review(state, store, signal)));
          atomicJson(receipt, { context, review });
        }
        store.audit('review', review);
        if (await observeWorkspace(state, stop.signal) !== state.evidence.snapshotDigest || await workspaceHead(state,stop.signal) !== state.evidence.head) {
          store.audit('review-modified-workspace', { verdict: review.verdict, reason: review.reason, before: state.evidence.snapshotDigest, after: await observeWorkspace(state, stop.signal) });
          if (review.verdict === 'human') {
            // Human cards must show evidence for the actual post-review files,
            // even when further Agent work waits for the user's decision.
            state.evidence = await checkedEvidence();
            const taskDiff = await baselineDiff(store, state, `task-${state.taskIndex}-baseline.json`, stop.signal);
            const roundDiff = await baselineDiff(store, state, `round-${state.loops}-baseline.json`, stop.signal);
            if (taskDiff !== undefined) state.evidence.taskDiff = taskDiff;
            if (roundDiff !== undefined) state.evidence.roundDiff = roundDiff;
            store.audit('independent-check', state.evidence);
            state.nextPhase = 'verify'; checkpoint('paused', review.reason);
            for (const request of review.contextConfirmations ?? []) prepareUnlocked(store, request.relative, request.action);
          }
          else if (review.verdict === 'fail') { state.failure = classifyFailure(new FlowError('rejected', review.reason), 'review'); checkpoint('failed', review.reason); }
          else {
            state.nextPhase = 'verify';
            // Review edits also need a bounded repair cycle, independent of paid usage.
            if (state.config.maxReworks !== undefined && (state.reviewRepairs ?? 0) >= Math.max(1, state.config.maxReworks)) {
              state.evidence = await checkedEvidence();
              store.audit('independent-check', state.evidence);
              checkpoint('paused', 'Review repair limit reached');
            }
            else { state.reviewRepairs = (state.reviewRepairs ?? 0) + 1; checkpoint('verify', 'Claude 修改后重新独立验收和审查'); }
          }
          continue;
        }
        if (review.verdict === 'pass' && state.evidence.tests.some(test => test.status) &&
            state.evidence.issues.every(issue => issue.startsWith('Pending acceptance operations:')) &&
            contextReviewProblems(state.evidence.contextReport, review, normalizeContractReferences(review.contextReview?.checkedContracts ?? [], state.evidence.contextReport ? reviewContractCatalog(state) : [])).length === 0 &&
            !(reviewEvidence(state.evidence) as { diffOmitted: boolean }).diffOmitted) {
          const taskId = state.tasks[state.taskIndex]!.id;
          state.deferredTaskIds ??= [];
          if (!state.deferredTaskIds.includes(taskId)) state.deferredTaskIds.push(taskId);
          store.audit('task-acceptance-pending', { taskId, review, tests: state.evidence.tests.filter(test => test.status), note: '代码和安全检查已执行；GUI/风险验收未通过，禁止交付；依赖该节点的任务等待，继续独立节点。' });
          advanceReadyTask(); continue;
        }
        if (review.verdict === 'human') {
          state.nextPhase = 'verify'; checkpoint('paused', review.reason);
          for (const request of review.contextConfirmations ?? []) prepareUnlocked(store, request.relative, request.action);
        }
        else if (review.verdict === 'fail') { state.failure = classifyFailure(new FlowError('rejected', review.reason), 'review'); checkpoint('failed', review.reason); }
        else if (review.verdict === 'pass' && state.evidence?.passed) {
          const catalog = state.evidence.contextReport ? reviewContractCatalog(state) : [];
          const references = normalizeContractReferences(review.contextReview?.checkedContracts ?? [], catalog);
          if (state.evidence.contextReport) store.audit('context-review-references', { receipt, snapshot: state.evidence.snapshotDigest, baselineDigest: state.evidence.contextReport.baselineDigest, raw: review.contextReview?.checkedContracts ?? [], ...references, catalog, catalogHash: createHash('sha256').update(JSON.stringify(catalog)).digest('hex') });
          const contextProblems = contextReviewProblems(state.evidence.contextReport, review, references);
          if (contextProblems.length) {
            store.audit('review-vetoed', { reason: 'Project Context 审查缺少正式处理', contextProblems });
            state.feedback = contextProblems.join('\n'); state.nextPhase = 'execute'; state.reworkPending = true;
            checkpoint(reworkLimited() ? 'paused' : 'execute', reworkLimited() ? 'Rework limit reached' : state.feedback); continue;
          }
          if ((reviewEvidence(state.evidence) as { diffOmitted: boolean }).diffOmitted) { state.nextPhase = 'verify'; checkpoint('paused', 'Review context omitted diff; human inspection required'); continue; }
          state.completedTaskIds ??= state.tasks.slice(0, state.taskIndex).map(task => task.id);
          if (!state.completedTaskIds.includes(state.tasks[state.taskIndex]!.id)) state.completedTaskIds.push(state.tasks[state.taskIndex]!.id);
          state.deferredTaskIds = (state.deferredTaskIds ?? []).filter(id => id !== state.tasks[state.taskIndex]!.id);
          advanceReadyTask();
        } else {
          state.feedback = `${review.reason}\n${state.evidence?.issues.join('\n') ?? 'No evidence'}`;
          if (review.verdict === 'pass') store.audit('review-vetoed', { reason: 'Independent verification failed' });
          state.nextPhase = 'execute'; state.reworkPending = true;
          if (reworkLimited()) checkpoint('paused', 'Rework limit reached');
          else checkpoint('execute');
        }
      } else { throw new Error(`Unexpected phase ${state.phase}`); }
      } catch(error) {
        if(!(error instanceof GuidanceHandoff)||stop.signal.aborted)throw error;
        store.audit('guidance-interrupted',{phase:state.phase,loop:state.loops,taskId:state.tasks[state.taskIndex]?.id??null,forced:error.forced,note:'原调用已退出；保留修改和Session，不把中途结果视为验收通过，不重复已执行操作。'});
        while(claimPendingGuidance(store)){}
        const inputs=processingGuidance(store);
        if(!inputs.length)throw new FlowError('interrupted','引导交接消息不可用；保留现场');
        state.guidancePending=inputs[0];
        for(const input of inputs)if(!state.goal.includes('[用户追加要求 '+input.id+']'))state.goal+='\n\n[用户追加要求 '+input.id+']\n'+input.text;
        state.completedTaskIds??=state.tasks.slice(0,state.taskIndex).map(task=>task.id);
        state.feedback=[state.feedback,'用户要求及时介入。原调用已退出，保留工作区修改和Session；检查已有成果，仅继续剩余操作。未验收任务仍须独立验收。追加需求不等于取消原目标；若有方向冲突，优先最新用户要求。先由决策者重新规划，再派发执行者。'].filter(Boolean).join('\n');
        state.failure=null;state.reworkPending=false;state.evidence=null;state.nextPhase='planning';
        if(state.discussion)state.discussion.closed=true;
        checkpoint('planning','正在交给决策者调整方向');
        store.audit('guidance-received',{message:inputs[0],messageIds:inputs.map(input=>input.id),completedTaskIds:state.completedTaskIds,remainingTasks:state.tasks.filter(task=>!state.completedTaskIds?.includes(task.id))});
      }
    }
  } catch (error) {
    const stage = state.phase;
    // A structurally valid synthesis rejected by Controller does not repeat the
    // collaborative cycle. Explicit resume uses the existing primary-only Replan.
    if (stage === 'planning' && state.discussion?.steps.some(s => s.stage === 'synthesis' && s.status === 'success')) state.discussion.closed = true;
    state.failure = classifyFailure(error, stage);
    if (['git','git-integrity'].includes(state.failure.kind)) {
      state.reworkPending=false;
    } else if (stage === 'executing') {
      if (!state.nativeExecution && existsSync(journalFile(store, state))) state.nextPhase = 'applying';
      else {
        state.nextPhase = 'execute'; state.reworkPending = true;
        store.audit('execution-interrupted', { native: state.nativeExecution ?? false, before: state.beforeExecution, after: await observeWorkspace(state, undefined), note: '保留已有修改；续接同一 Thread，不重新应用文件提案' });
      }
    } else if (['planning', 'execute', 'applying', 'verify', 'review'].includes(stage)) state.nextPhase = stage === 'review' ? 'verify' : stage;
    if (stop.signal.aborted) state.failure = classifyFailure(new FlowError('interrupted', 'Stopped'), stage);
    checkpoint(stop.signal.aborted ? 'stopped' : state.failure.recoverable ? 'paused' : 'failed', state.failure.message);
    store.audit('error', state.failure);
  } finally {
    try {
      if(state.config.projectMode === 'direct' && state.snapshotPolicy !== 'none') {
        const checkpoint=`recovery-${randomUUID()}.json`;
        atomicJson(store.file(checkpoint),captureProject(state.workspace,store.file('snapshot-objects')));
        store.audit('direct-checkpoint',{checkpoint,phase:state.phase,note:'Changes already exist in selected project; do not apply a delivery'});
      }
    } finally {clearInterval(poll); externalSignal?.removeEventListener('abort', abort); releaseProject?.(); unlock();}
  }
  return state;
}
