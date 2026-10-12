# 固定 Context 回归仍沿用逐任务用户确认断言

- 状态：待处理。
- 归属：PersonalAgent 固定回归夹具；本轮自省发现，区别于用户交办的模型窗口功能。
- 现象：`test/call-observation.test.ts` 的 T1/T2/T3 固定回归及 Git 版本回归，共 4 项失败。`scripts/run-context-regression.ts` 期待 `phase=paused`，现行决策者验收后得到 `completed`。
- 证据：模型窗口分支扩大测试为 19 通过、4 失败。干净 TEST `aa52a965e0855dcda40566228b8286cd3732e4a4` 独立工作区构建后，过滤 T1 同样失败，核心错误为 `actual: completed; expected: paused`，不是本次窗口改动引入。
- 影响：不能宣称根目录全库回归全绿。与模型窗口直接相关的 11 项观测检查、15 项窗口/原生压缩检查、95 项适配器组合及桌面专项通过；不阻断隔离开发与 TEST 试用，也不据此发布 DEV/MAIN。
- 下一步：单独核对固定回归的验收协议，更新过时暂停预期，同时保留 decisionAccepted/userAccepted 区分、审计 receipt、Context 真实性及正式 Delivery 审批断言。不为了旧断言改回生产逐任务用户确认流程。

这是另一个固定回归脚本的失败，不重新打开已解决的 `review-contract-references.test.ts` 两项旧断言问题。
