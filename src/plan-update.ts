import type { Plan, Task } from './schema.js';
import { FlowError } from './failure.js';

/** Applies a guidance planUpdate to the unaccepted tasks. Unlisted tasks keep their exact content and order. */
export function applyPlanUpdate(remaining: Task[], plan: Plan, completedIds: string[]): { tasks: Task[]; changed: Set<string> } {
  const patches = plan.planUpdate?.patches ?? [], remove = plan.planUpdate?.remove ?? [];
  const known = new Set(remaining.map(task => task.id)), changed = new Set([...patches.map(patch => patch.id), ...remove]);
  const reject = (message: string): never => { throw new FlowError('supervisor', `planUpdate 无效：${message}。只列出需要调整的未验收任务；需要整体重排时省略 planUpdate 并返回完整剩余任务。`); };
  const unknown = [...changed].filter(id => !known.has(id));
  if (unknown.length) reject(`${unknown.join(', ')} 不是未验收任务；已验收成果的后续修改使用新任务 ID`);
  if (changed.size !== patches.length + remove.length) reject('同一任务只能出现在一个 patch 或 remove 中');
  const reused = plan.tasks.filter(task => known.has(task.id)).map(task => task.id);
  if (reused.length) reject(`tasks 只放新增任务，${reused.join(', ')} 已在计划中；修改既有任务使用 patches`);
  const tasks = [...remaining.filter(task => !remove.includes(task.id)).map(task => ({ ...task, ...patches.find(patch => patch.id === task.id) })), ...plan.tasks];
  const ids = new Set([...completedIds, ...tasks.map(task => task.id)]);
  const missing = tasks.flatMap(task => (task.dependsOn ?? []).filter(id => !ids.has(id)).map(id => `${task.id}→${id}`));
  if (missing.length) reject(`依赖指向不存在的任务（${missing.join(', ')}）；同时修改相关任务的 dependsOn`);
  return { tasks, changed };
}
