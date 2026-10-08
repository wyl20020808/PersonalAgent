import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import type { Config, Edits, ExecutionResult, Plan, Review } from './schema.js';
import type { State, Store } from './store.js';

export interface Agents {
  readonly executionMode?: 'native' | 'proposal';
  plan(state: State, store: Store, signal: AbortSignal): Promise<Plan>;
  execute(state: State, store: Store, signal: AbortSignal): Promise<ExecutionResult>;
  review(state: State, store: Store, signal: AbortSignal): Promise<Review>;
}
export class MockAgents implements Agents {
  constructor(readonly config: Config) {}
  async plan(state: State): Promise<Plan> {
    state.claudeSessionId ??= 'mock-claude-session';
    return { humanDecision: null, tasks: [{ id: 'hello', instruction: 'Create hello.txt containing hello', acceptance: ['hello.txt must contain hello followed by a newline', 'Independent tests pass'] }, { id: 'done', instruction: 'Create done.txt containing done', acceptance: ['done.txt must contain done followed by a newline'] }] };
  }
  async execute(state: State, store: Store, signal: AbortSignal): Promise<Edits> {
    state.codexThreadId ??= 'mock-codex-thread'; store.save(state);
    if (this.config.mockScenario === 'timeout') await delay(this.config.timeoutMs * 2, undefined, { signal });
    if (this.config.mockScenario === 'fail') throw new Error('Mock executor failed');
    if (this.config.mockScenario === 'invalid') return { unexpected: true } as unknown as Edits;
    if (this.config.mockScenario === 'escape') return { summary: 'unsafe', changes: [{ path: '../escape.txt', content: 'bad' }] };
    if (this.config.mockScenario === 'nochange') return { summary: 'no change', changes: [] };
    const task = state.tasks[state.taskIndex]!;
    const content = this.config.mockScenario === 'rework' && state.reworks === 0 ? 'incorrect\n' : `${task.id}\n`;
    writeFileSync(store.file('mock-executor.json'), JSON.stringify({ task: task.id }));
    return { summary: task.instruction, changes: [{ path: `${task.id}.txt`, content }] };
  }
  async review(state: State): Promise<Review> {
    if (this.config.mockScenario === 'human' && !state.feedback) return { verdict: 'human', reason: 'Need user decision' };
    return { verdict: state.evidence?.passed ? 'pass' : 'rework', reason: state.evidence?.passed ? 'Verified' : 'Fix failed checks' };
  }
}
