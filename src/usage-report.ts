import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { CallUsage } from './call-observation.js';

type Sum = { calls: number; counted: number; input: number; cached: number; output: number };
const sum = (): Sum => ({ calls: 0, counted: 0, input: 0, cached: 0, output: 0 });
const phases = ['plan', 'execute', 'review'] as const;

/** Locate runs/<id> below a data root. Copies of one Run can exist; the longest audit wins. */
export function findRun(root: string, id: string): string {
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 10) return;
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory() || ['node_modules', '.git', 'workspace', 'snapshot-objects'].includes(entry.name)) continue;
      const child = path.join(dir, entry.name);
      if (entry.name === 'runs') { if (existsSync(path.join(child, id, 'audit.jsonl'))) found.push(path.join(child, id)); }
      else walk(child, depth + 1);
    }
  };
  walk(root, 0);
  if (!found.length) throw Error(`Run ${id} not found below ${root}`);
  return found.sort((a, b) => statSync(path.join(b, 'audit.jsonl')).size - statSync(path.join(a, 'audit.jsonl')).size)[0]!;
}

/** Read-only summary of one Run's recorded usage. Protocols report input differently, so input is
 * normalized to "everything sent, cached part included" and cached is its cache-read subset. */
export function usageReport(directory: string) {
  const events = readFileSync(path.join(directory, 'audit.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as { time: string; event: string; data: any });
  const state = existsSync(path.join(directory, 'state.json')) ? JSON.parse(readFileSync(path.join(directory, 'state.json'), 'utf8')) : null;
  const calls = new Map<string, CallUsage>(), count = (name: string) => events.filter(event => event.event === name).length;
  for (const event of events) if (['observation-call-start', 'usage-progress', 'agent-usage'].includes(event.event)) calls.set(event.data.callId, event.data);
  const rows = [...calls.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const total = sum(), byPhase = Object.fromEntries(phases.map(phase => [phase, sum()])) as Record<typeof phases[number], Sum>;
  const byAgent: Record<string, Sum> = {}, threadTotals = new Map<string, { input: number; cached: number; output: number }>();
  let unresolved = 0;
  for (const row of rows) {
    const groups = [total, byPhase[row.phase], byAgent[row.agent] ??= sum()];
    for (const group of groups) group.calls++;
    if (row.inputTokens === null || row.outputTokens === null) continue;
    let value = { input: row.inputTokens, cached: row.cacheReadTokens ?? 0, output: row.outputTokens };
    if (row.agent !== 'codex') value.input += (row.cacheReadTokens ?? 0) + (row.cacheCreationTokens ?? 0);
    else if (row.source !== 'codex-app-server-turn') {
      // Between the live channel's arrival and per-turn totals, Codex records held one request or a wrong difference.
      if (row.source !== 'codex-sdk-0.161.0-turn.completed' || row.resumed && row.completeness === 'partial') { unresolved++; continue; }
      // Older records hold the Thread's running total on resumed turns.
      const chain = `${row.phase === 'execute' ? 'execute' : 'decision'}:${row.participantId ?? ''}`, previous = threadTotals.get(chain);
      threadTotals.set(chain, { ...value });
      if (row.resumed) {
        if (!previous || value.input < previous.input || value.output < previous.output) { unresolved++; continue; }
        value = { input: value.input - previous.input, cached: Math.max(0, value.cached - previous.cached), output: value.output - previous.output };
      }
    }
    for (const group of groups) { group.counted++; group.input += value.input; group.cached += value.cached; group.output += value.output; }
  }
  const verdicts: Record<string, number> = {};
  for (const event of events) if (event.event === 'review') verdicts[event.data.verdict] = (verdicts[event.data.verdict] ?? 0) + 1;
  const executions = new Map<string, number>();
  for (const row of rows) if (row.phase === 'execute' && row.taskId) executions.set(row.taskId, (executions.get(row.taskId) ?? 0) + 1);
  const perTask = [...executions.values()], completed: number | null = state?.completedTaskIds?.length ?? null;
  const ratio = (part: number, whole: number) => whole ? Math.round(part / whole * 1000) / 10 : null, average = (value: number, by: number) => by ? Math.round(value / by) : null;
  return {
    runId: (state?.id ?? path.basename(directory)) as string, directory, goal: typeof state?.goal === 'string' ? state.goal.slice(0, 80) as string : null, phase: (state?.phase ?? null) as string | null,
    startedAt: events[0]?.time ?? null, finishedAt: events.at(-1)?.time ?? null,
    tasks: (state?.tasks?.length ?? null) as number | null, completedTasks: completed, loops: (state?.loops ?? null) as number | null, totalReworks: (state?.totalReworks ?? null) as number | null,
    calls: { total: rows.length, failed: rows.filter(row => row.status === 'failed').length, interrupted: rows.filter(row => row.status === 'interrupted').length, withoutUsage: total.calls - total.counted - unresolved, unresolvedThreadTotals: unresolved },
    tokens: { total, byPhase, byAgent },
    cachedPercent: ratio(total.cached, total.input),
    averageInputPerCall: Object.fromEntries(phases.map(phase => [phase, average(byPhase[phase].input, byPhase[phase].counted)])) as Record<typeof phases[number], number | null>,
    inputPerCompletedTask: completed ? average(total.input, completed) : null,
    executionsPerTask: { tasks: perTask.length, average: perTask.length ? Math.round(perTask.reduce((a, b) => a + b, 0) / perTask.length * 10) / 10 : null, max: perTask.length ? Math.max(...perTask) : null },
    reviews: verdicts, sessionRotations: count('execution-session-rotated'), reworkReplans: count('rework-replan'), guidance: count('guidance-received'), humanDecisions: count('human-decision'),
    note: 'input 为归一化后的全部输入（含缓存部分），cached 是其中的缓存读取；只统计有用量记录的调用，withoutUsage 和 unresolvedThreadTotals 未计入。旧 Codex 记录按同一 Thread 的相邻累计值相减还原，失败调用的消耗会并入下一次成功调用；2026-10-12 至 10-13 之间实时通道只记录了单次请求或错误差值的 Codex 记录不计入。Token 数不等于计费金额。'
  };
}

type Report = ReturnType<typeof usageReport>;
export function usageTable(reports: Report[]): string {
  const number = (value: number | null) => value === null ? '-' : value.toLocaleString('en-US');
  const lines: [string, (report: Report) => string][] = [
    ['Run', r => r.runId.slice(0, 8)], ['状态', r => r.phase ?? '-'], ['任务 完成/总数', r => `${r.completedTasks ?? '-'}/${r.tasks ?? '-'}`],
    ['调用 总/失败/中断', r => `${r.calls.total}/${r.calls.failed}/${r.calls.interrupted}`], ['未计入的调用', r => String(r.calls.withoutUsage + r.calls.unresolvedThreadTotals)],
    ['每任务执行次数 平均/最大', r => `${r.executionsPerTask.average ?? '-'}/${r.executionsPerTask.max ?? '-'}`],
    ['验收 pass/rework/human/fail', r => ['pass', 'rework', 'human', 'fail'].map(verdict => r.reviews[verdict] ?? 0).join('/')],
    ['Session 轮换 / 重新规划', r => `${r.sessionRotations}/${r.reworkReplans}`],
    ['输入合计', r => number(r.tokens.total.input)], ['其中缓存读取 %', r => r.cachedPercent === null ? '-' : r.cachedPercent + '%'], ['输出合计', r => number(r.tokens.total.output)],
    ...phases.map(phase => [`平均输入/次 ${phase}`, (r: Report) => number(r.averageInputPerCall[phase])] as [string, (report: Report) => string]),
    ['输入/已完成任务', r => number(r.inputPerCompletedTask)]
  ];
  const width = (text: string) => [...text].reduce((size, char) => size + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
  const cells = lines.map(([label, read]) => [label, ...reports.map(read)]), widths = cells[0]!.map((_, column) => Math.max(...cells.map(row => width(row[column]!))));
  return cells.map(row => row.map((cell, column) => cell + ' '.repeat(widths[column]! - width(cell))).join('  ')).join('\n');
}
