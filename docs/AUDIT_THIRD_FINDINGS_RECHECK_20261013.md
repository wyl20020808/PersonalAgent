# 第二份新增功能审查的采纳结论

固定基线：TEST `53da0a495d2ff40bc1a5373059f9e12ced3223e1`。外部 Codex，独立 `fix/audit-third-findings-20261013`，仅文档登记；没有修改产品源码或真实 Run。

- D1：不采纳。把配置测试失败/tests=[] 变为 Controller 硬否决与当前决策者自主验收授权直接冲突。执行退出、路径/锁、审计和正式交付批准仍须保留。已补充到旧验收回归记录。
- D2：采纳测试维护方向，不采纳随 D1 恢复旧门禁。15/561 为外部报告数据，本轮未重跑全量。
- D3：新增 [未确认 Claude UUID](../problems/2026-10-13-claude-unconfirmed-decision-session.md)，P1 待处理。本地注入 runner 复现下一次错误 resume；“只能废弃 Run”不成立。
- D4：新增 [讨论配置切换](../problems/2026-10-13-discussion-decision-switch.md)，P2 待处理。实际 discussion 函数拒绝旧状态/新配置已复现；完整桌面切换链路未执行，不称 GUI PASS。
- D5：登记 [无人值守收敛观察](../problems/2026-10-13-unattended-convergence-observability.md)，P2 待评估。无实际无限运行或费用测量，不自动添加硬限额。
- R1：用户追加内容在 goal 中保留，prompt-context 也有预算观察与外置机制，但明确不静默裁剪用户约束。无界增长风险需长序列测量与完整约束交接方案，不直接截断；本轮暂不登记独立故障。
- R2：损坏账本拒绝装配是保护设计；可恢复性/诊断体验可以改进，不能自动忽略账本并重做任务。无损坏恢复复现实证，本轮不新建缺陷。
- R3：合并已有 PID 复用记录；不是永久锁，也不得自动删除不明锁。
- R4：补充已有活动历史规模记录；静态确认读取成本，性能未测量。
- R5：新增 [恢复活动归属错标](../problems/2026-10-13-transport-recovery-agent-label.md)，P3 待处理。本地实际 recoverTransport 已复现。
- R6：引导保留是恢复机制；当前 sessions.public 对 paused/failed/stopped 的 steering/adjusting 已显示“请明确恢复”说明，不能仅凭状态值称误导。需具体失败链路及 UI 展示证据后再定性。
- R7：读取期间文件变化与审计损坏要分开。AuditReader 保持一致性并拒绝未验证数据合理；真实并发失败频率及刷新恢复不足未测量，不当作独立已确认缺陷。
- accepted-flow 的 userAccepted 不能只凭当前自动 pass 分支称全项目死代码；manual-acceptance、显式 human 与历史 Run 兼容仍需覆盖。

## 验证

独立 npm.cmd run build 退出码 0；生成 schema 已在本任务工作树恢复，不提交。`.validation/verify-third.mjs` 的 D3、D4、R5 三项确定性验证退出码 0；真实模型、完整 desktop 测试、全量回归、GUI 与无人值守压力场景 not-run。未改变全局策略、用户凭据、真实历史或运行实例。

本轮只采纳、登记合理事项，不执行生产修复。后续优先 D3/D4 恢复路径与 D2 契约正确的测试维护，R5 可独立小改；D5 先明确观察与限制需求，不能以“安全门禁”名义撤销用户自主验收决定。

提交前 TEST 前进到 `fa7525376f82b21ffeca169971dc66f3d9572c3c`，任务工作树已快进吸收。新增变更是历史闲置任务排除与相同问题接管退避，没有改变 D3/D4/R5 的复现源码；运行中 Run 仍跳过监督。问题证据保持绑定最初固定基线，未把先前验证改写成新版本全量 PASS。

## 后续第三份报告复核

当前核对仍为 TEST `fa75253`。结论如下：

1. 验收语义：该报告承认行为与新规一致、字段未伪造，判断正确。分类应是测试/文档契约维护，不是需要重新二选一的产品安全缺陷。选按新规迁移，但 human、明确 GUI 必需证据和正式交付批准仍应独立覆盖，不能把所有 paused 改为 completed。tests=[] 也不能伪写实际测试 passed。
2. 根回归并发：package.json 确实没有 --test-concurrency=1，regression-policy.mjs 只注入隔离策略，不控制并发；并发与 3 秒夹具超时的相互影响合理。61/24 失败数及“组合全绿”本轮无原日志核算，不能确认所有失败都是并发所致。优先固定全名、捕获失败状态、对同构建并行/串行对照，再决定串行化或隔离夹具。加长超时不能掩盖阻塞。
3. interaction-policy 2!==1：上一轮已核对计划包含 first 与 independent 两任务，pass 推进第二项符合新规；不能继续标为根因未明的同任务重复派发。应维护旧契约断言。
4. codexImageHistory 默认测试遗漏：确认，新增 [问题记录](../problems/2026-10-13-desktop-image-history-test-omitted.md)。
5. v03c 文案：陈旧断言已复现，合并已有测试维护记录，不另建问题。

八条风险的修正：

- previousContext 对损坏 JSON 抛错是真的，属于可恢复性与诊断边界；是否应该回退必须区分权威状态与可重建观测，不直接忽略所有错误继续。
- ledgerBrief 的 shift 只裁剪摘要。assemblePrompt 携带完整 checkpoint 的 path/hash、acceptedCount/includedCount 与 task-ledger.json 路径，完整 completedTaskIds 保存在 checkpoint 中；不能称旧任务记录已经丢失。模型是否正确按引用读取需新 Session 场景验证。
- feedback 参与重试 key，显式恢复追加反馈可能开启新恢复批次；当前预算语义是一次恢复批次/问题，不是所有人工恢复共享终生五次。最新监督还有相同问题退避与接管次数限制，简单相乘不能证明实际五十次调用。若要按原故障身份累计，须先明确跨恢复预算契约。
- 返工重规划无总量硬上限：已有待评估记录；没有执行无限循环验证，不自动添加默认硬限额。
- 旧依赖 Run 缺 completedTaskIds：值得优先补历史夹具，但缺少具体旧状态、taskIndex、审计与恢复操作，尚不能确认会重做已完成任务。应从实际历史证据重建完成集合，不能对所有 DAG 简单取前缀。
- guidance-handoff 被中断时抛交接信号，即使 operation 返回结果也不会直接当作验收通过。这是有意保守行为；新 guidanceResume/planUpdate 与已持久化 native-result 也参与恢复。声称“只靠提示词防重做”不完整，需验证交接与输出持久化的竞态。
- Claude readOnly 加载共享 skills 插件事实成立，但插件只建立技能链接且调用禁用 Skill/Shell/MCP 工具；不能仅凭 --plugin-dir 证明发生写入。应验证副作用，不能移除全部原生能力作为默认修复。
- usage complete 降级 partial：CallObservation.observe/observeOpencodeMessage 有 closed 保护，finish 在关闭后才计算最终完整度并持久化。没有具体另一写入者或跨实例同 callId 路径时，未确认可达覆盖竞态。

本轮仅补静态检查，不重跑全量、desktop 测试或真实模型。可见 GUI 未执行，当前策略为 idle，不能复制外部报告的 deferred_by_work_mode 充当本轮结果。
