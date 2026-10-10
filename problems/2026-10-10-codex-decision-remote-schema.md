# Codex Decision 真实 Plan 的 Schema 被远端服务拒绝

- 归属：PersonalAgent P3A Codex Decision SDK 适配。
- 状态：已观察的远端 Schema 拒绝已解决；完整 P3A 技术链路已通过真实恢复验收，本轮纳入正式 DEV 集成候选。游戏业务验收仍需返工。
- 版本：`feature/codex-decision-agent-p3a`，`fff5dcc940d7eff0c259126776fcf5d42f51bc62`。
- 场景：OpenWorld 网吧入口真实开发验收，配置模型 `gpt-6.1-sol`，单 Codex 决策者及独立 Codex SDK 执行者。
- 证据：Run `f957b797-feed-43ef-80dd-20e1fd714f4f`；决策 Thread `01a12444-d1c1-7253-866c-9bf9a3c0b34c`；首次 Plan 调用 `3ff7b238-6caa-4a86-b11c-0a805a00e26d`。证据目录 `D:/PA-P3A-OpenWorld/20261010/runtime/runs/f957b797-feed-43ef-80dd-20e1fd714f4f/`。
- 服务原始错误：`Invalid schema for response_format 'codex_output_schema': In context=('properties', 'tasks', 'items', 'properties', 'dependsOn'), 'uniqueItems' is not permitted.`，错误码 `invalid_json_schema`。
- 已确认原因：将 Controller 完整 Ajv Schema 原样传给 SDK 的远端 Structured Outputs，包含服务不接受的 `uniqueItems`。官方文档另要求对象每个字段均为 required，可选字段以 null 联合表示；现有 Plan/Review 包含不在 required 中的字段，也需要传输适配。
- 影响：真实 Plan 尚未产出，Controller 暂停，Execute/Review 未派发；OpenWorld 源码无修改。本地原版专项 20/20 通过，但 SDK/协议替身没有模拟远端 Schema 限制。
- 处理：用户明确授权独立修复 Worktree `D:/PersonalAgent-worktrees/tasks/codex-decision-schema-real-v1`，从最新本地 dev `ddb098a` 建立，未提交地重现 P3A 实现；只修改 Codex 传输 Schema 与回传可选字段规范化，保留原 Schema 的本地严格验证。原 Run、调用计数和 Thread 继续保留，不重建清空失败历史。
- 官方依据：[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)。
- 下一步：回归传输结构、nullable 选项恢复、重复依赖仍拒绝及原 P3A 专项；修复版真实续接，分别报告原版失败和修复版结果。不自动提交、合并、push 或交付批准。

## 实际验证与收尾

- 修复后的真实 Plan 调用 `25a03320-820c-4579-b949-366fe7b7d2bc` 返回合法结构，Controller 校验并派发独立 Codex SDK 执行 Thread。随后三次真实 Review 均成功返回并通过结构校验，说明本次 Schema 适配解决了已观察的远端拒绝；不代表所有未来 Schema 均兼容。
- 构建通过。原 P3A 专项此前 20/20、新增 Schema 回归 3/3 通过。撤回无效运行时覆盖后，组合复测为 22/23；一个 `Codex + claude-code, 0 rounds, primary a` 本地替身用例超过现有 3000ms 超时，单独复测 1/1 通过。保留本次超时事实，不将最后组合测试写成 23/23，不扩大测试超时掩盖问题。
- 修复未提交，分支 `fix/codex-decision-schema-real-v1`，基线 `ddb098aedff7a40dc4a161f2e8eda8722bf32598`；该工作树同时包含从原 P3A 分支重现的实现，不应把所有相对 dev 的修改归为本次 Schema 修复。
- 原 Run、原决策 Thread 和调用计数保留。游戏执行确实完成，但决策只读工具持续失败，Review 结果依次为 rework、human、human，完整技术验收未通过。见同目录 `2026-10-10-codex-decision-windows-readonly-tools.md`。

## 只读恢复后的最终验证

- 本轮串行专项共 24/24 通过，含原 P3A 单/双决策组合、恢复与归属、原 Review Guard、新 Schema 与 Windows 运行时选择。此前 3000ms 替身超时未复现，历史失败记录保留，不据此保证绝无偶发超时。
- 最小真实 Review 与原 Run 第四次真实 Review 均正常完成远端结构化返回和原始严格 Schema 校验；本次未再出现 invalid_json_schema。已观察场景的 Schema 修复稳定，未声称所有未来 Schema 均兼容。
- 原 Run 最新 Review 正常读取源码后返回 rework（游戏闭门入口协调问题），Controller 保留原返工上限，不批准交付。技术调用成功与游戏审查未通过分开记录。
- 本轮用户明确要求在隔离修复分支提交完整候选，覆盖前轮“未提交”约束；仅提交本任务分支，不合入 DEV/MAIN、不 push、不批准游戏 Delivery。最终版本及提交绑定见 `P3A_CODEX_REAL_REVIEW_RECOVERY_VALIDATION.md` 与外部 commit-receipt.json。

## 2026-10-10：正式 DEV 集成

用户已认可真实技术验收并授权整合 DEV。完整来源为 `1d1351458c72d4a9ff542332cd8587eefe0220af`，从已包含 P3C 的 DEV `30dea6f98a5a74d87f828417dba87327001a2279` 在独立 `integration/codex-decision-p3a-dev-v1` 合并。传输适配与原始严格 Plan/Review 校验均保留；OpenCode 执行者的 Schema 选项按合并后的决策 Schema 定位，防止新增 Codex 决策选项改变下标后误绑定 Claude 执行者。

本次只做本地协议、角色组合、恢复、审计及必要构建，不重复付费模型调用。原真实失败与恢复审计保留。实际验证、DEV 更新及最终 SHA 见 `CODEX_DECISION_P3A_DEV_INTEGRATION.md`；默认不把历史失败、未观察的未来 Schema 或 OpenWorld 游戏结果写为通过。
