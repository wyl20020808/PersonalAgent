import {decisionLabel} from './DecisionAgentSelect.js';
import type { Run } from './types.js';
const value = (n: number | null) => n === null ? '未知' : n.toLocaleString();
export default function UsageSummary({ usage,decisionAgent }: { usage: Run['usage'];decisionAgent?:Run['decisionAgent'] }) {
  if (!usage) return <section className="panel usage-summary"><p>决策 Agent：{decisionLabel(decisionAgent)}</p><p>原生用量未知；不估算 Token。</p></section>;
  return <section className="panel usage-summary" aria-label="上下文与调用用量">
    <div className="section-heading"><span>上下文与调用用量</span><span>{usage.complete ? '已报告完整' : '部分数据 / 未知'}</span></div>
    <p>决策 Agent：{decisionLabel(decisionAgent)}</p><p>{usage.controllerCalls} 次已观测 Controller 调用 · {usage.calls.reduce((sum, call) => sum + call.promptBytes, 0).toLocaleString()} Prompt UTF-8 字节</p>
    <p className="field-help">{usage.note}</p>
    <p>CC 已报告输入 {value(usage.reported.claude.inputTokens)} / 输出 {value(usage.reported.claude.outputTokens)} · Codex 已报告输入 {value(usage.reported.codex.inputTokens)} / 输出 {value(usage.reported.codex.outputTokens)}</p>
    {usage.reported.opencode&&<p>OpenCode 已报告输入 {value(usage.reported.opencode.inputTokens)} / 输出 {value(usage.reported.opencode.outputTokens)}</p>}
    <div className="table-wrap"><table><thead><tr><th>任务 / 阶段</th><th>输入</th><th>输出</th><th>缓存读取</th><th>缓存创建</th><th>状态</th></tr></thead><tbody>{usage.calls.map(call => <tr key={call.callId}>
      <td>{call.taskId ?? '计划'} · {call.agent === 'claude' ? 'CC' : call.agent === 'opencode' ? 'OpenCode' : 'Codex'} {call.phase}{call.rework ? ' · 返工' : ''}</td>
      <td>{value(call.inputTokens)}</td><td>{value(call.outputTokens)}</td><td>{value(call.cacheReadTokens)}</td><td>{value(call.cacheCreationTokens)}</td><td title={call.notes.join('\n')}>{call.status} · {call.completeness}<small>模型：{call.models.join(', ') || '未知'} · 请求数：{value(call.modelRequests)}</small></td>
    </tr>)}</tbody></table></div>
    {usage.calls.length === 0 && <p>此 Run 无原生用量观测记录；不从字节数或调用次数估算 Token。</p>}
  </section>;
}
