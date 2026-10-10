# 返工决策提交后反复回到验收暂停

状态：修复及相关验证已完成；尚未整合到 dev，正式审查与交付验收待完成。

## 现象与影响

OpenWorld Run `ea04a572-ff03-4b47-9d4f-fdf5c276ae64` 在未配置独立测试时停在 `paused / nextPhase=verify`。用户通过普通恢复和“提出修改并返工”提交修改意见，系统收到决策后立即重跑验收并再次暂停，没有重新派发执行 Agent。多次点击没有推进任务。

## 已核实证据

- 2026-10-10 16:46:29、16:46:48 的桌面操作记录包含 `intent=rework`。
- 16:47:14 收到普通恢复决策，16:47:15 再次进入相同验收暂停；执行次数保持 4。
- Run 配置为 `tests=[]`、`maxLoops=30`、`maxReworks=10`，当前返工为 3，因此此次不是限额阻断。
- 当前证据还包含 `Assets/ElderCareCampus/Reference/measurements.md:51: new blank line at EOF.`。这属于外部项目的文件问题，本修复不直接修改该文件。

## 确认原因

桌面服务仅将 `intent` 用于入口校验和用户操作记录，启动 CLI 时丢失该字段。CLI 和 Controller 也没有接收返工意图的通路。Controller 按保存的 `nextPhase=verify` 恢复，随后因 `tests=[]` 再次暂停。

## 修复范围

- 桌面服务将 `intent` 传给 CLI；CLI 校验 `--intent` 并传给 Controller。
- Controller 在锁内处理明确返工意见，切换当前任务到 `execute` 并设置 `reworkPending`；复用既有会话、次数和返工限制。
- 拒绝从规划节点、提案应用中断、活动 Run 或无当前任务的状态直接返工。
- 运行详情恢复弹窗增加“继续原流程 / 重新验收”和“按修改意见返工当前任务”的明确选择，并解释缺少独立测试时的人工验收入口。
- 普通恢复和人工验收保持既有语义；未配置测试不被宣称为自动验收通过，不自动批准成果交付。

## 验证记录

基线为 dev `3c32ebb34534da3c566c64a42621a75717cc00c1`，修复分支为 `fix/decision-rework-resume-v1`。
新增端到端 Mock 测试覆盖桌面服务、CLI 和 Controller；新增恢复测试覆盖历史原生 Run、新提案 Run、保留会话和计数、限额阻断和非法节点。

另外发现既有“复用审查回执”测试使用新 Run，但新 Run 的 `snapshotPolicy=none` 明确要求重新审查。基线同样失败；将该历史兼容测试夹具改为历史快照 Run，不改变生产逻辑。

最终结果见仓库根目录 `DECISION_REWORK_RESUME_VALIDATION.md`。上述测试均为本地夹具和开发会话自主验证，不等同于真实游戏开发验收或 Controller 对本修复的正式独立交付验收。
