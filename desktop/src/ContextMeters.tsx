import type { ModelContext } from '../../src/model-context.js';

const statusText = { unknown: '等待原生统计', normal: '自动管理', 'near-limit': '接近压缩阈值', compacting: '正在压缩', compacted: '已压缩，等待新统计', exceeded: '窗口超限' };
export function contextLabel(row?: ModelContext) {
  const percent = row?.usedTokens !== null && row?.usedTokens !== undefined && row.windowTokens ? Math.round(row.usedTokens / row.windowTokens * 100) : null;
  return { percent, text: percent === null ? '未知' : `${row?.measurement === 'estimated' ? '约 ' : ''}${percent}%` };
}
export function ContextMeters({ contexts, primaryId }: { contexts: ModelContext[]; primaryId?: string }) {
  return <div className="context-meters" aria-label="模型上下文窗口">{(['decision','execution'] as const).map(role => {
    const rows = contexts.filter(row => row.role === role), label = role === 'decision' ? '决策者' : '执行者';
    const row = rows.find(row => row.participantId === primaryId) ?? [...rows].sort((a,b)=>(a.updatedAt??'').localeCompare(b.updatedAt??'')).at(-1);
    const { percent, text } = contextLabel(row);
    return <details key={role} className={`context-meter ${row?.status ?? 'unknown'}`}>
      <summary title={`${label}上下文 ${text} · ${statusText[row?.status ?? 'unknown']}`} aria-label={`${label}上下文 ${text}`}>
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" className="context-ring-track"/><circle cx="10" cy="10" r="7" className="context-ring-fill" strokeDasharray={`${Math.max(0,Math.min(100,percent ?? 0))*0.43982} 43.982`} transform="rotate(-90 10 10)"/></svg>
        <span>{label === '决策者' ? '决策' : '执行'}</span>
      </summary>
      <div className="context-meter-popup">{(rows.length ? rows : [undefined]).map((item,index) => <div key={item?.participantId ?? index}>
        <strong>{label}{item?.participantId ? ` ${item.participantId.toUpperCase()}` : ''}上下文 · {contextLabel(item).text}</strong>
        <p>{item?.model ?? item?.configuredModel ?? '模型尚未报告'}</p>
        <p>{item?.usedTokens?.toLocaleString() ?? '未知'} / {item?.windowTokens?.toLocaleString() ?? '未知'} tokens</p>
        <p>压缩阈值：{item?.compactAtTokens?.toLocaleString() ?? '原生模型默认'} · 已压缩 {item?.compactions ?? 0} 次</p>
        <p>{statusText[item?.status ?? 'unknown']} · {item?.measurement === 'native' ? '原生窗口统计' : item?.measurement === 'estimated' ? '最近请求估算，非实时精确值' : '占用尚未知'}</p>
        <small>接近窗口时由原生会话压缩；保留 Session/Thread。累计消耗不等于窗口占用。</small>
      </div>)}</div>
    </details>;
  })}</div>;
}
