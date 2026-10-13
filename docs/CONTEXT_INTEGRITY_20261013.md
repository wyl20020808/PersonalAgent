# 上下文与用量补充验证

基线：TEST `92024f09a9054f8cda5758f55a3e9b533e2dd7be`。任务分支 `fix/context-integrity-20261013`，独立工作树 `D:/PersonalAgent-worktrees/tasks/context-integrity-20261013`。外部 Codex 开发，自测不冒充 Controller 独立验收。DEV、MAIN、真实 Run 和运行实例未修改。

## 与已有三批改动的关系

保留 Opus 已实现的角色预算（决策 120k、执行 160k）、原生压缩、执行及决策 Session 轮换和上下文使用规则。以下按原六项逻辑补缺，不重复实现，也不重新宣称它们是本次成果。

| 逻辑 | 本次补充 |
| --- | --- |
| 用量口径与审计 | Codex 逐通知持久化当前回合消耗；失败、断流保留已知量；缺失值不伪造零。已知输入不因输出未知而丢弃。原生日志可生成独立推导报告，历史 audit 不改写。 |
| 执行 Session 交接 | 完整任务说明、结论、验收条件、测试状态和证据快照保存在磁盘。提示词只带有界摘要与路径；重规划移除旧任务后仍按已完成 ID 恢复。 |
| 决策上下文 | 每轮携带目标与检查点。检查点保留计划、已完成任务、指导历史、当前反馈、失败、授权边界及 Session。新 Session/压缩后按需恢复；待处理指导存在时不轮换决策 Session。 |
| 提示词装配预算 | plan/execute 默认 8k、review 12k，按 UTF-8 字节/3 粗估；台账摘要不超过 6KB。大证据可外置到不可变 JSON，带 SHA256。当前任务、目标、反馈和规则不裁剪，必要时允许超预算并审计。 |
| 压缩与恢复 | Codex 继续等待原生压缩完成；Codex/OpenCode 压缩失败或结果未知单独记录，归类 context，不进入普通网络自动重试。保留原 Session，不伪造完成或占用下降。 |
| 输出与重复工作 | Controller 装配的大日志/证据受程序预算约束，原文留盘。修正供应内容回执，仅实际内联内容记 supplied；压缩后的路径不算已读。原生 Agent 内部工具循环仍由后端管理。 |

两批落地：A 为记账、占用采样和原生日志核对；B 为完整交接、提示词装配、压缩失败恢复。作为同一候选组合验证，避免只交付摘要却缺恢复路径。

## 口径与配置

```json
{"contextManagement":{"promptBudgetTokens":{"plan":8000,"execute":8000,"review":12000}}}
```

这是 Controller 提示词装配软预算，不是模型实际 token 数，也不包含后端系统提示、工具定义、会话历史。不能保证整个模型上下文低于该值，更不能将角色压缩触发阈值解释成硬上限。

完整证据 hash 按 `sha256(JSON.stringify(parsed JSON))` 计算。`decisionAccepted`、`userAccepted`、测试 `passed` 分开保存；尚未批准或无法确认的内容不升级为通过。用户指导历史用于恢复事实，不自行扩大权限。旧累计用量的推导没有请求身份时仍可能不完整，不能用来声称精确节省率。

## 真实验证

命令：`node --import ./scripts/regression-policy.mjs scripts/check-context-integrity-live.mjs`。

隔离测试目录：`.validation/context-live-a51ccad6-505e-4ce8-bf45-24acbfb6a7da`。原生 Thread：`01a1332a-9754-7671-a123-4d9b84512ee5`；测试 Run 数据目录内 ID：`5d65ecfc-fedf-412c-9894-90edc49bd2d4`。这是直接适配器冒烟，不是 Controller 完整任务验收。

| 回合 | 请求数 | 输入 | 缓存读取（输入子集） | 输出 | 结果 |
| --- | ---: | ---: | ---: | ---: | --- |
| 新 Session | 2 | 47683 | 29440 | 91 | 工具读取成功，标记正确 |
| 原 Session 压缩后 | 2 | 49723 | 24576 | 135 | 同一 Thread，原生压缩完成，工具读取及标记正确 |

以上与原生 rollout 的每请求用量逐项相符。只读核对命令：`node scripts/audit-native-codex-usage.mjs <原生rollout.jsonl>`。结果在 `.validation/native-usage-derived.json`，保留源文件 SHA256，不含对话正文。

压缩回合只报告上下文大小变化，输入/输出消耗为零值；报告明确标记 `compactionAccountingUnknown`，不能据此声称压缩免费。

## 验证状态与边界

构建通过。首轮全量 556 项：539 通过、17 失败。干净 `92024f0` 对照复现其中 15 项；一个候选超时单跑通过，另一个提示词尺寸断言确实暴露了交接摘要重复，本轮已去重，未放宽断言。修复专项 8/8 通过，包含 Codex 已知部分用量、同请求占用更新、长台账恢复、OpenCode 压缩失败及上述两项差异。

固定多任务用例的旧提示词 31320 字节，本版 7277 字节，仍低于旧值四分之一；完整独立证据保留。这是装配字节验证，不是模型账单节省率。

组合全量：557 项，542 通过、15 失败，与干净基线复现的失败集合逐名一致，日志 `.validation/final-regression.log` 与 `.validation/baseline-failures.log`。随后仅补充“外置证据保留 passed/issues 等状态、检查点引用大证据”，重建并运行相关用量/台账/装配专项 9/9 通过，日志 `.validation/final-protection.log`。旧验收断言等基线问题仍存在，不称全库全绿；本轮没有桌面代码改动，未重跑桌面端或 GUI 验收。

本地 TEST 按 V2.1 条件式自主集成；整合时核对干净目标并持有仓库共享集成锁。未授权交付 DEV、MAIN 或远程推送。

尚不能量化长任务 Token 节省、返工率变化。未对 Claude/OpenCode 做真实模型验收；其协议路径有隔离测试。没有修改第三方工具内部输出上限，没有强制子代理调度，也没有解决 OpenCode 单个长回合内部持续膨胀。图片附件去重仍未处理。不得把这些边界算成已完成的收益。
