# 决策者通过后未推进，继续指令反复送审同一任务

- 归属：PersonalAgent Controller 调度及验收设计。
- 状态：已解决。用户批准后 DEV 已更新至 850809f；原 OpenWorld Run 经正式 CLI 恢复，复用 t01 验收并进入 t02 实际执行。整个建筑导入工程尚未完成。
- 场景：OpenWorld Blender 12 个院落建筑导入，Run `922a7176-8dea-4269-977a-ab785b4927d0`。
- 现象：t01-setup 实际执行一次，审查八次（七次 pass、一次 human），仍为 taskIndex=0、completedTaskIds=[]、loops=1、claudeCalls=9。用户反复继续未推进 t02。
- 已确认原因：旧 pass 分支只保存 paused/nextPhase=verify，没有登记任务完成。普通继续恢复 verify，重新调用决策者审查同一成果。第六次 human 又受旧 Diff 截断提示影响，把上下文大小限制当成人工门槛。
- 影响：反复消耗模型调用、用户监督成本和时间；真实工程阶段停滞。
- 修复：pass 写入独立 decision-acceptance 审计，完成当前任务并自动推进；human 保留重大决策，rework 返工，fail 终止。旧 pass 恢复核对成果、规则和历史审计，未变化复用结论；修改后重审，明确返工仍执行。decisionAccepted 不冒充 userAccepted 或 passed；正式 Delivery 批准保留。
- 历史兼容：无依赖旧 Plan 缺 completedTaskIds 时沿用此前任务索引推导；旧 pass 复用前检查依赖，禁止倒回重放已执行任务。
- 验证：真实 CC/Codex/Controller Run `266c3679-02ae-4759-829f-65908ddbb1e9`，两个任务完成、两次执行、两次审查、零暂停、零人工验收。Mock/回归与真实验证分别记录，详见下方说明。
- 下一步：原 Run 自主继续剩余建筑导入；仅实际重大问题升级用户。保持运行 DEV 版本固定，不能手改原 state.json、伪造批准或重新创建 OpenWorld 工作树。
- 范围限制：原 Run 的观察根仍为 OpenWorld Primary，执行者建立的独立游戏 Worktree 需要决策者用原生工具核查；本次没有重构任意子 Worktree 的观察绑定。

说明与证据：[Controller 自主推进及 OpenWorld 案例](../docs/CONTROLLER_AUTONOMY_OPENWORLD_20261012.md)。

2026-10-12 DEV 交付进展：用户批准后已将 42f195b 正常快进 DEV，停止旧程序后备份原业务和构建；22950 个业务文件、54 个未跟踪文件校验一致，构建与类型检查通过。原 Run 正式恢复时，预先投递的授权 guidance 在 while 之前的历史 pass 核验中触发 GuidanceHandoff，旧外层 catch 错记 unknown/nonrecoverable；没有新增模型调用或重复执行。补修复将历史 receipt 只读核验与 Agent 交接分开，消息随后在正式循环边界处理；精确识别已被误记的旧暂停 pass 引导错误，通过正式恢复入口记录重分类，保留错误审计并重新核对成果。其他不可恢复失败不放行。新增正常预投递、历史误分类恢复和无关失败仍拒绝三项回归。现场恢复结果以交付目录中的实际记录为准。

最终现场验证：相关验收/引导回归 31/31 通过，补修复合入 TEST 和 DEV 为 850809f。DEV 正常重启，原 Run 的 taskIndex=1、loops=2、completedTaskIds=[t01-setup]，审查仍为八次，没有第九次 t01 审查。一次正式重分类、一次 review-reused、一次 t01 decision-acceptance，guidance 已应用，Claude 完成剩余计划调整，Codex 开始 t02-site-candidates。审计链校验通过。证据为 `D:/PersonalAgent-data/dev-delivery-20261012/f0f1360e-56e6-4bd7-b070-81b203ad3204/recovery-verification.json`。本段记录更新在 TEST；为保护已恢复的真实任务，不为文档更新再次替换运行 DEV。
