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
