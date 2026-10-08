import type { Config, Task } from './schema.js';
import { FlowError } from './failure.js';

export function orderTasks(tasks: Task[], config: Config): Task[] {
  const ids = new Set(tasks.map(task => task.id));
  if (ids.size !== tasks.length) throw new FlowError('validation', 'Duplicate task IDs');
  for (const task of tasks) {
    for (const id of task.dependsOn ?? []) if (!ids.has(id)) throw new FlowError('validation', `Missing dependency ${id} for ${task.id}`);
    testIndexes(task, config);
  }
  const ordered: Task[] = [], remaining = [...tasks], done = new Set<string>();
  while (remaining.length) {
    const index = remaining.findIndex(task => (task.dependsOn ?? []).every(id => done.has(id)));
    if (index < 0) throw new FlowError('validation', 'Cyclic task dependencies');
    const task = remaining.splice(index, 1)[0]!; ordered.push(task); done.add(task.id);
  }
  return ordered;
}
export function testIndexes(task: Task | undefined, config: Config): number[] {
  const stage = acceptanceStage(task, config);
  if (!stage) return config.tests.map((_, index) => index);
  const indexes = config.acceptanceStages?.[stage];
  if (!indexes?.length || indexes.some(index => !config.tests[index])) throw new FlowError('validation', `Invalid acceptance stage ${stage}`);
  return indexes;
}
export function acceptanceStage(task: Task | undefined, config: Config): string | undefined {
  if (config.taskStages) {
    const stage = task && Object.hasOwn(config.taskStages, task.id) ? config.taskStages[task.id] : undefined;
    if (!stage || (task?.acceptanceStage && task.acceptanceStage !== stage)) throw new FlowError('validation', 'Task acceptance stage conflicts with trusted mapping');
    return stage;
  }
  return task?.acceptanceStage;
}
export function assertPrerequisites(tasks: Task[], index: number, completed: string[]): void {
  const task = tasks[index];
  if (!task || (task.dependsOn ?? []).some(id => !completed.includes(id))) throw new FlowError('safety', 'Task prerequisites are not completed');
}
