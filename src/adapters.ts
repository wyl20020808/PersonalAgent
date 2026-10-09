import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import type { Config, Edits, ExecutionResult, Plan, Review } from './schema.js';
import type { State, Store } from './store.js';
import { applyEdits } from './workspace.js';
import { contextPath, loadProjectContext, mockContextDocuments, stampContext, stampEligible } from './project-context.js';
import { projectFiles } from './project-files.js';

export interface Agents {
  readonly executionMode?: 'native' | 'proposal';
  plan(state: State, store: Store, signal: AbortSignal): Promise<Plan>;
  execute(state: State, store: Store, signal: AbortSignal): Promise<ExecutionResult>;
  review(state: State, store: Store, signal: AbortSignal): Promise<Review>;
}
export class MockAgents implements Agents {
  get executionMode(): 'native' | 'proposal' {return this.config.executionMode ?? 'proposal';}
  constructor(readonly config: Config) {}
  async plan(state: State): Promise<Plan> {
    state.claudeSessionId ??= 'mock-claude-session';
    if (state.purpose === 'context-onboarding') return { humanDecision: null, tasks: [{ id: 'context', instruction: '本地 Mock 建档夹具，仅生成约定文档', acceptance: ['格式有效，源目录不变；不是付费 Agent 验收'] }] };
    return { humanDecision: null, tasks: [{ id: 'hello', instruction: 'Create hello.txt containing hello', acceptance: ['hello.txt must contain hello followed by a newline', 'Independent tests pass'] }, { id: 'done', instruction: 'Create done.txt containing done', acceptance: ['done.txt must contain done followed by a newline'] }] };
  }
  async execute(state: State, store: Store, signal: AbortSignal): Promise<ExecutionResult> {
    state.codexThreadId ??= 'mock-codex-thread'; store.save(state);
    if (state.purpose === 'context-onboarding') {
      const candidates = projectFiles(state.workspace).filter(name => contextPath(name) && !name.startsWith('docs/project-context/'));
      const file = candidates.find(stampEligible) ?? candidates[0];
      if (!file) throw Error('Mock 建档夹具需要一个可核对的已有文件');
      const projectId = loadProjectContext(state.workspace).overview?.metadata.project_id ?? state.id;
      const documents = mockContextDocuments(projectId, file);
      applyEdits(state.workspace, { summary: '本地 Mock 建档文档', changes: Object.entries(documents).map(([path, content]) => ({ path, content })) });
      if (stampEligible(file)) stampContext(state.workspace, 'fixture', [file]);
      store.audit('agent-activity', { agent: 'codex', kind: 'file', title: 'Mock 建档夹具', text: '仅本地确定性夹具，没有付费 Agent 调用。' });
      return { mode: 'native', summary: '本地 Mock 建档夹具；不代表真实代码分析' };
    }
    if (this.config.mockScenario === 'timeout') await delay(this.config.timeoutMs * 2, undefined, { signal });
    if (this.config.mockScenario === 'fail') throw new Error('Mock executor failed');
    if (this.config.mockScenario === 'invalid') return { unexpected: true } as unknown as Edits;
    if (this.config.mockScenario === 'escape') return { summary: 'unsafe', changes: [{ path: '../escape.txt', content: 'bad' }] };
    if (this.config.mockScenario === 'nochange') return { summary: 'no change', changes: [] };
    const task = state.tasks[state.taskIndex]!;
    const content = this.config.mockScenario === 'rework' && state.reworks === 0 ? 'incorrect\n' : `${task.id}\n`;
    writeFileSync(store.file('mock-executor.json'), JSON.stringify({ task: task.id }));
    const edits={ summary: task.instruction, changes: [{ path: `${task.id}.txt`, content }] };
    if(this.executionMode==='native') {
      applyEdits(state.workspace,edits);
      applyEdits(state.workspace,{summary:'Explicit local Mock run marker',changes:[{path:`mock-result-${state.id}.txt`,content:`PersonalAgent 本地 Mock 夹具运行标记；任务 ${task.id}；不代表真实 Agent 或项目功能验收。\n`}]});
      store.audit('agent-activity',{agent:'codex',kind:'file',title:'Mock native file write',text:`${task.id}.txt (local Mock; no paid Agent)`});
      return {mode:'native',summary:`Mock native fixture: ${task.instruction}`};
    }
    return edits;
  }
  async review(state: State): Promise<Review> {
    if (this.config.mockScenario === 'human' && !state.feedback) return { verdict: 'human', reason: 'Need user decision' };
    return { verdict: state.evidence?.passed ? 'pass' : 'rework', reason: state.evidence?.passed ? 'Verified' : 'Fix failed checks' };
  }
}
