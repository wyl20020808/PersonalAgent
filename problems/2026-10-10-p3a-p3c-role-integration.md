# P3A 与 P3C 集成时的角色 Schema 与消息归属冲突

- 归属：PersonalAgent 独立集成 Worktree；尚未发布的合并结果，不是原有 DEV 运行故障。
- 状态：已解决；独立集成 Controller 84/84、Desktop 87/87、类型检查、构建与静态 UI 验证通过。
- 场景：在 DEV `30dea6f`（已含 P3C）合并完整 P3A 候选 `1d135145`，共 12 个文件发生实际冲突。
- 已确认原因：P3A 在决策 Schema 的首项新增 Codex，P3C 的执行 Schema 原来用 `oneOf[1]` 引用 OpenCode。直接保留该下标会错误引用 Claude Code。决策与执行的能力表、设置池、历史 Session 导入和消息投影也各有独立新增内容，不能整文件选一侧。
- 影响：错误合并可能丢失 OpenCode 执行者，或把同为 OpenCode 的执行工具事件标为“决策者”。执行池组件令 `role` 在后续 JSX 被 TypeScript 缩窄为 decision，旧 execution 比较触发 TS2367。
- 修复：逐段保留两侧功能，修正 Controller/Desktop 的 OpenCode Schema 引用；保留 P3C 执行池和历史执行身份，加入 P3A Codex 决策模型。消息投影先识别执行事件，再标记决策事件，避免后者覆盖执行者归属。保留两侧历史问题记录。
- 证据：Controller 84/84 定向通过；静态双池检查通过。新增 Desktop 回归覆盖 Codex 单/双决策分别搭配 Codex/OpenCode 执行，以及相同后端的决策/执行消息归属。测试日志位于 `D:/PersonalAgent-data/p3a-dev-integration-v1/`。
- 限制：Desktop 首次排除过滤未生效，误跑两个旧夹具，另见 `2026-10-10-test-filter-large-fixtures.md`。历史 Native 三项失败本轮未重跑或修复，不宣称全库回归绿色。
- 下一步：正式 DEV 快进与构建启动；最终结果见 `CODEX_DECISION_P3A_DEV_INTEGRATION.md`。不重新开发游戏，不恢复强制 Snapshot，不改变人工 Delivery。
