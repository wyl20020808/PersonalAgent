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
  const coverage = { partialCalls: 0, unknownInput: 0, unknownOutput: 0, unknownCache: 0, excluded: [] as { callId: string; reason: string }[] };
  for (const row of rows) {
    const groups = [total, byPhase[row.phase], byAgent[row.agent] ??= sum()];
    for (const group of groups) group.calls++;
    if (row.inputTokens === null && row.outputTokens === null) continue;
    let value = { input: row.inputTokens ?? 0, cached: row.cacheReadTokens ?? 0, output: row.outputTokens ?? 0 };
    if (row.agent !== 'codex') value.input += (row.cacheReadTokens ?? 0) + (row.cacheCreationTokens ?? 0);
    else if (row.source !== 'codex-app-server-turn') {
      // Between the live channel's arrival and per-turn totals, Codex records held one request or a wrong difference.
      const liveEvidence = events.some(e => e.event === 'model-context' && e.data.source === 'codex.thread/tokenUsage/updated.last' && e.data.role === (row.phase === 'execute' ? 'execution' : 'decision') && e.time >= row.startedAt && e.time <= (row.finishedAt ?? row.startedAt));
      if (liveEvidence || row.inputTokens === null || row.outputTokens === null || row.source !== 'codex-sdk-0.161.0-turn.completed' || row.resumed && row.completeness === 'partial') { unresolved++; coverage.excluded.push({callId: row.callId, reason: 'Ambiguous legacy Codex scope; native reconstruction required'}); continue; }
      // Older records hold the Thread's running total on resumed turns.
      const chain = `${row.phase === 'execute' ? 'execute' : 'decision'}:${row.participantId ?? ''}`, previous = threadTotals.get(chain);
      threadTotals.set(chain, { ...value });
      if (row.resumed) {
        if (!previous || value.input < previous.input || value.output < previous.output) { unresolved++; continue; }
        value = { input: value.input - previous.input, cached: Math.max(0, value.cached - previous.cached), output: value.output - previous.output };
      }
    }
    if (row.completeness !== 'complete' || row.inputTokens === null || row.outputTokens === null) coverage.partialCalls++;
    if (row.inputTokens === null) coverage.unknownInput++;
    if (row.outputTokens === null) coverage.unknownOutput++;
    if (row.cacheReadTokens === null) coverage.unknownCache++;
    for (const group of groups) { group.counted++; group.input += value.input; group.cached += value.cached; group.output += value.output; }
  }
  // Occupancy is what one request carries; it is separate from the consumption summed above.
  const context = { decision: { samples: 0, used: 0, max: 0, compactions: 0 }, execution: { samples: 0, used: 0, max: 0, compactions: 0 } }, compacted = new Map<string, number>(), samples = new Map<string, { role: 'decision' | 'execution'; value: number }>();
  let sampleSequence = 0;
  for (const event of events) if (event.event === 'model-context' && context[event.data.role as 'decision' | 'execution']) {
    const row = context[event.data.role as 'decision' | 'execution'], key = `${event.data.role}:${event.data.participantId ?? ''}:${event.data.sessionId ?? ''}`;
    const sample = key + ':' + (event.data.sampleId ?? `legacy-${sampleSequence++}`);
    if (event.data.sampleKind !== 'snapshot' && typeof event.data.usedTokens === 'number' && event.data.usedTokens >= 0) samples.set(sample, { role: event.data.role, value: event.data.usedTokens });
    row.compactions += Math.max(0, (event.data.compactions ?? 0) - (compacted.get(key) ?? 0)); compacted.set(key, event.data.compactions ?? 0);
  }
  for (const {role, value} of samples.values()) { const row=context[role]; row.samples++; row.used+=value; row.max=Math.max(row.max,value); }
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
    tokens: { total, byPhase, byAgent }, coverage,
    cachedPercent: ratio(total.cached, total.input),
    averageInputPerCall: Object.fromEntries(phases.map(phase => [phase, average(byPhase[phase].input, byPhase[phase].counted)])) as Record<typeof phases[number], number | null>,
    inputPerCompletedTask: completed ? average(total.input, completed) : null,
    executionsPerTask: { tasks: perTask.length, average: perTask.length ? Math.round(perTask.reduce((a, b) => a + b, 0) / perTask.length * 10) / 10 : null, max: perTask.length ? Math.max(...perTask) : null },
    context: Object.fromEntries((['decision', 'execution'] as const).map(role => [role, { average: average(context[role].used, context[role].samples), max: context[role].samples ? context[role].max : null, compactions: context[role].compactions }])) as Record<'decision' | 'execution', { average: number | null; max: number | null; compactions: number }>,
    reviews: verdicts, sessionRotations: count('execution-session-rotated'), decisionRotations: count('decision-session-rotated'), reworkReplans: count('rework-replan'), guidance: count('guidance-received'), humanDecisions: count('human-decision'),
    note: 'input 含缓存输入，cached 是其中的缓存读取。单项未知不抹掉其他已知项，合计只表示已知下限；coverage 标明部分记录及未知项。withoutUsage 和 unresolvedThreadTotals 未计入。旧 Codex 累计差值按角色连续调用链推导，缺少 Session 证据时不能当作严格对照；检测到实时通道占用证据的旧单请求记录排除。旧占用快照可能重复；新记录只采原生测量。原生压缩消耗可能未报告，Token 不等于金额。'
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
    ['Session 轮换 执行/决策 · 重新规划', r => `${r.sessionRotations}/${r.decisionRotations} · ${r.reworkReplans}`],
    ['部分用量调用 / 输出未知', r => `${r.coverage.partialCalls} / ${r.coverage.unknownOutput}`],
    ['输入合计', r => number(r.tokens.total.input)], ['其中缓存读取 %', r => r.cachedPercent === null ? '-' : r.cachedPercent + '%'], ['输出合计', r => number(r.tokens.total.output)],
    ...phases.map(phase => [`平均输入/次 ${phase}`, (r: Report) => number(r.averageInputPerCall[phase])] as [string, (report: Report) => string]),
    ['输入/已完成任务', r => number(r.inputPerCompletedTask)],
    ['上下文占用 决策 平均/最高', r => `${number(r.context.decision.average)}/${number(r.context.decision.max)}`], ['上下文占用 执行 平均/最高', r => `${number(r.context.execution.average)}/${number(r.context.execution.max)}`],
    ['压缩次数 决策/执行', r => `${r.context.decision.compactions}/${r.context.execution.compactions}`]
  ];
  const width = (text: string) => [...text].reduce((size, char) => size + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
  const cells = lines.map(([label, read]) => [label, ...reports.map(read)]), widths = cells[0]!.map((_, column) => Math.max(...cells.map(row => width(row[column]!))));
  return cells.map(row => row.map((cell, column) => cell + ' '.repeat(widths[column]! - width(cell))).join('  ')).join('\n');
}
