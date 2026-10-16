# 自动验收流程下部分历史回归仍等待旧暂停节点

- 状态：待处理；属于本轮验证额外发现的测试维护问题，不是全自动开发功能的用户需求登记。
- 现象：扩大 Controller 回归的 T1/T2/T3 固定任务仍断言 `paused`，实际决策者验收后为 `completed`。桌面 thread 测试还存在共享运行夹具等待超时后串联产生 `Run still active`、不可恢复等失败。
- 基线证据：在未修改 TEST 运行三项 fixed-task 对照，三项均失败，核心差异仍为 `completed` 与 `paused`。随后从初始 `test@59883a881d6b9555d233cd59b80eff2c5b0fc0d4` 创建独立只读基线工作树 `D:/pa-as-baseline-20261012`，针对扩大桌面回归的七项失败复核，六项 thread 失败复现，isolated rounds 一项通过。
- 任务工作树证据：`.validation/automatic-controller-tests.log`、`automatic-desktop-tests.log`、`automatic-desktop-focused.log`。基线证据：`D:/PersonalAgent-worktrees/test/.validation/supervision-baseline-check.log` 与 `D:/pa-as-baseline-20261012/.validation/automatic-baseline-desktop.log`。前者只运行本地注入式 Mock，不更改真实 Run 或配置。
- 额外时序事实：扩大根目录回归并发触发若干短超时，已停止本任务的该扩大测试进程树，未终止其他任务。核心受影响模块串行组合 34/35，唯一 Mock 超时用例单独复测 1/1 通过；桌面 isolated rounds 超时用例单独复测 1/1 通过。不能把这些不同批次改写成一次全量通过。
- 影响：不能宣称全量 Controller/桌面回归通过。新增自动监督专项及必要构建、类型检查单独报告；没有通过删除用例、增加生产权限或改写审计绕过失败。
- 下一步：在独立测试维护任务中迁移旧人工暂停断言、隔离共享夹具并按实际 Controller 终态及进程退出等待；保留真实用户批准与决策者验收的区分。

## 最新 TEST 组合复核

2026-10-16 Token 效率任务补充：在 `test@efcac51ef96b8945844e966641d24ad89fbcb3f4` 的独立未修改基线，T1/T2/T3 固定回归及 Git 版本回归四项均再次复现 `completed` 与旧 `paused` 预期不符；任务工作树出现相同四项失败。证据：`D:/PersonalAgent-validation/autonomous-budget-efficiency-20261016/baseline.log`、`regression.log`。本轮新增预算分配/提醒的最终针对性检查 10/10 通过，没有修改这四项旧断言或生产验收政策。状态仍为待处理，影响为不能宣称扩展回归全部通过；不阻碍这次已验证的预算提示增量。

模型上下文任务（2026-10-12）补充证据：`call-observation.test.ts` 的 T1/T2/T3 固定回归及 Git 版本回归共四项沿用旧暂停预期；扩大检查 19/23。在干净 `test@aa52a965e0855dcda40566228b8286cd3732e4a4` 独立工作区过滤 T1，同样复现 `completed` 与 `paused` 不符。直接相关的观测检查 11/11，通过。该任务没有修改旧固定回归脚本或生产验收协议；与本记录合并登记，不重复创建问题文件。

本轮整合最新 TEST 的 `b939c22` 夹具等待修正后，桌面巡检与完整 thread 组合 35/35 通过，日志 `.validation/automatic-combined-desktop.log`。上述六项 thread 问题已由该独立任务修正，不再作为本功能剩余阻碍。此前失败批次保留。固定任务旧 `paused` 断言尚未处理，本记录仍为待处理，不标记整体已解决。

## 第二份外部审查 F1/F11：MAIN 回归非稳定结果

本轮只读核对 `C:/Users/WYL20/AppData/Local/Temp/opencode/pa-test.log` 与 `pa-test2.log`：第一轮 253/254，通过数 253、失败 1；第二轮 254/254。失败为 `test failures trigger rework; Claude cannot override independent failures`，期望 completed、实际 failed；首轮该用例 duration_ms=27786.4885。日志指向 `D:/PersonalAgent/dist/test/controller.test.js:47`，不是当前 TEST 验收。

可确认两份日志的结果不一致，但本轮没有重新执行全套测试，也没有失败 state/failure.kind。根因未确认，不能归结为 30 秒 Git 超时、真实 Run 付费成果报废，或因第二轮通过就宣称问题解决。测试还沿用“独立检查不能被 Claude 覆盖”的旧验收职责，与当前决策者自主验收规则需分别核对。

下一步：独立维护任务保留失败 Run 的状态、错误种类、命令和进程退出证据，再做有界复现与基线对照；不要盲目重复完整测试或调整生产错误分类来掩盖失败。Git 超时包装的独立缺陷见 [既有记录](2026-10-12-git-timeout-classification.md)。

## 2026-10-13 原生能力任务的基线对照

原生能力与 Skills 适配回归 104 项中，103 项通过；唯一失败为 `interaction-policy.test.ts` 的 `pending GUI cannot bypass human/fail Review or a failed safe acceptance check`，断言执行次数为 1，实际为 2。同一用例在未修改 TEST `92024f0` 的构建中单独运行，同样以 `2 !== 1` 失败。本任务没有修改该用例或 Controller 验收逻辑，不将其记为通过，也不据此宣称完整回归通过。与当前决策者自主验收职责的关系仍需独立维护任务核对。

## 2026-10-13 用户提供审查的复核

本轮在独立工作树固定 TEST `a2d3f95` 构建，执行：

```powershell
rtk proxy node --import ./scripts/regression-policy.mjs --test --test-concurrency=1 --test-name-pattern="pending GUI cannot bypass|Codex public events expose actual" dist/test/interaction-policy.test.js dist/test/v03c.test.js
```

两项均失败，进程退出码 1：interaction-policy 为 `2 !== 1`；v03c 为 `/尚不代表测试通过/` 不匹配当前公开文案。此次没有修改测试或生产代码。

定性补充：

- interaction-policy 对应 `test/interaction-policy.test.ts:116-122`，计划明确包含 first 与 independent 两个任务，夹具 review 在 safe-failure 子场景固定返回 pass。当前 Controller 遵循决策者 pass 自动推进，因此执行次数 2 不能证明同一任务重复执行；这是旧固定检查否决 pass 的断言与当前职责不符。应保留 human/fail 不推进的覆盖，并按当前契约重写 pass 场景，不能改生产逻辑恢复旧否决机制来迁就断言。
- v03c 对应 `test/v03c.test.ts:16` 与 `src/telemetry.ts:58`。当前文案描述决策者验收后自动继续，测试仍严格匹配旧文案，陈旧断言确认。迁移时保留“执行回合结束不等于实际测试通过”的语义覆盖，不只删除断言。
- 用户提供的“561 项、两轮 16/22 失败、A 族 14、B 族 3、C 族 4”是外部报告数据，本轮未取得其两份完整日志并重新核算，不作为本轮全量结果。A 族迁移方向合理，但每项需单独核对是不是显式人工确认场景；不能一律把 paused/userAccepted 改成 completed。
- B 族延长超时仅在串行复测、耗时和失败类型证实夹具调度不足后再决定；不直接认定所有超时都是负载抖动。
- #197、#334/#335 只有当次 TAP 序号与简短现象，缺稳定测试名、失败状态与原始日志，本轮不登记为额外已确认缺陷。后续用测试全名、Run failure.kind 和串行对照定性。

本问题仍为待处理。可以确认专项回归失败，不能声称当前全量回归通过；本轮没有执行 DEV 交付，也不判定 TEST 不可试用。
## 2026-10-13 第二份报告的验收契约纠正

当前 TEST `53da0a4` 的 AGENTS.md 与统一规则明确：Controller 不因 tests 为空或程序检查结果自动否决决策者结论；pass 记录 decisionAccepted 并推进，正式交付授权另行保留。因此外部 D1 建议“exit≠0 硬阻断、tests=[] 必须人工”与现行授权冲突，不采纳，也不能把同批旧测试恢复到原固定门禁称为修复。acceptDecision 仍检查当前证据对应的 recordedPass 和 executorExitCode；delivery completionProof 仍检查完成状态、指纹、执行退出码与批准链。固定测试结果与执行者退出码需区分。

D2 的测试维护问题合理。此次报告的 15/561 失败数未取得原日志独立复核，不能视为本轮测试结果。迁移需逐条区分旧逐项用户确认、明确保留的 human/正式交付批准及真实异常，不批量把 paused/userAccepted 改成 completed，也不为绿灯改生产权限。
