# Context Review 两项旧验收断言

状态：已解决（本地回归）；本轮完整 TEST 交付前发现并修复。

现象：完整批次的 `review-contract-references.test.ts` 两项失败：历史 T1 receipt 测试期望 `userAccepted=true`；伪造文档状态测试期望 `phase=paused`。TEST `2a44a72` 与 DEV 整批候选均复现 5/7，失败完全相同，排除并行工作树修复引入的运行差异。

原因：测试仍使用旧的“逐任务等待用户确认”预期。现行 `acceptDecision` 在绑定当前证据及真实审查 receipt 后记录 `decisionAccepted=true` 并继续/完成任务，不伪造 `userAccepted`；正式 Delivery 审批仍独立存在。

修复：只更新上述两项测试的状态预期，明确断言决策验收成功且未获得用户批准。保留历史 Review 原字节、审计绑定、无机器改写、伪造契约状态 `CONFIRMATION_UNVERIFIABLE` 和 Context 警示断言。未修改生产 Controller、决策验收或交付门禁。

验证：根构建通过；`review-contract-references.test.js` 和 `decision-user-acceptance.test.js` 合计 25/25，通过，退出码 0。其中正式交付仍需明确批准、伪造验收标志不能替代审计 receipt 的测试通过。已通过的桌面完整回归 150/150、Context 其他 26 项、引导/恢复 24/24 和 headless UI 检查保持原证据边界，不宣称根目录全部回归已执行。
