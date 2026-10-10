# P3C 实战任务的交付验收路径配置错误

归属：本次实战编排配置，不是 Controller 门禁失效。状态：本任务配置已解决，用户授权修正后重新验收及 Review 均通过。

## 现象与影响

OpenWorld 顾客需求任务的真实 Plan、Execute、自测、Controller 独立测试和 OpenCode Review 均已完成。首次 Delivery Preview 被 `Delivery acceptance rules must be outside Agent workspace` 拒绝。

原因已确认：编排脚本把新建的 `Tools/CafeUI/test_customer_demands.py` 直接作为配置验收文件，该文件位于 Agent 可写工作区。`src/rules.ts::acceptanceRulesHash(state, true)` 在交付阶段正确拒绝这一配置。前面的独立测试通过不代表交付验收文件满足可信存储要求。

## 证据与处理

- Run：`97b43d12-8a50-4451-8570-c064418c93b2`，历史模型、Session、调用计数、原完成状态及失败证据均保留。
- 用户明确授权将验收配置改为字节一致、带哈希的外部固定测试副本，重跑独立验收和真实 Review，不自动批准交付。
- 外部固定副本与入口：`D:\PersonalAgent-data\p3c-openworld-demand\trusted-acceptance\`。
- 测试源码 SHA-256：`90a64d4f0867ca70a2b40e29fad56d786131de198b3c62a107b61f00feb090ba`。
- 使用现有 Store API 显式记录 `authorized-acceptance-contract-correction`，仅重新打开验收和 Review；不重放 Execute，不清空历史，不篡改原证据。
- 修正记录：`trusted-acceptance\contract-correction.json`；原完成状态：`state-before-correction.json`；最终结果：`D:\PersonalAgent-data\p3c-openworld-demand\receipt.json`。

下一步：新任务创建前就准备工作区外的固定验收入口及测试哈希，避免真实开发完成后才发现交付可信路径不满足要求。当前任务不修改 Controller 的可信验收门禁。

最终 Delivery：`2b907997-a901-4c19-b133-06e6cc2047fa`，`phase=preview`、`approval=null`。没有重放 Execute，也没有正式交付、提交、合并或推送。
