# 自动验收流程下部分历史回归仍等待旧暂停节点

- 状态：待处理；属于本轮验证额外发现的测试维护问题，不是全自动开发功能的用户需求登记。
- 现象：扩大 Controller 回归的 T1/T2/T3 固定任务仍断言 `paused`，实际决策者验收后为 `completed`。桌面 thread 测试还存在共享运行夹具等待超时后串联产生 `Run still active`、不可恢复等失败。
- 基线证据：在未修改 TEST 运行三项 fixed-task 对照，三项均失败，核心差异仍为 `completed` 与 `paused`。随后从初始 `test@59883a881d6b9555d233cd59b80eff2c5b0fc0d4` 创建独立只读基线工作树 `D:/pa-as-baseline-20261012`，针对扩大桌面回归的七项失败复核，六项 thread 失败复现，isolated rounds 一项通过。
- 任务工作树证据：`.validation/automatic-controller-tests.log`、`automatic-desktop-tests.log`、`automatic-desktop-focused.log`。基线证据：`D:/PersonalAgent-worktrees/test/.validation/supervision-baseline-check.log` 与 `D:/pa-as-baseline-20261012/.validation/automatic-baseline-desktop.log`。前者只运行本地注入式 Mock，不更改真实 Run 或配置。
- 额外时序事实：扩大根目录回归并发触发若干短超时，已停止本任务的该扩大测试进程树，未终止其他任务。核心受影响模块串行组合 34/35，唯一 Mock 超时用例单独复测 1/1 通过；桌面 isolated rounds 超时用例单独复测 1/1 通过。不能把这些不同批次改写成一次全量通过。
- 影响：不能宣称全量 Controller/桌面回归通过。新增自动监督专项及必要构建、类型检查单独报告；没有通过删除用例、增加生产权限或改写审计绕过失败。
- 下一步：在独立测试维护任务中迁移旧人工暂停断言、隔离共享夹具并按实际 Controller 终态及进程退出等待；保留真实用户批准与决策者验收的区分。

## 最新 TEST 组合复核

模型上下文任务（2026-10-12）补充证据：`call-observation.test.ts` 的 T1/T2/T3 固定回归及 Git 版本回归共四项沿用旧暂停预期；扩大检查 19/23。在干净 `test@aa52a965e0855dcda40566228b8286cd3732e4a4` 独立工作区过滤 T1，同样复现 `completed` 与 `paused` 不符。直接相关的观测检查 11/11，通过。该任务没有修改旧固定回归脚本或生产验收协议；与本记录合并登记，不重复创建问题文件。

本轮整合最新 TEST 的 `b939c22` 夹具等待修正后，桌面巡检与完整 thread 组合 35/35 通过，日志 `.validation/automatic-combined-desktop.log`。上述六项 thread 问题已由该独立任务修正，不再作为本功能剩余阻碍。此前失败批次保留。固定任务旧 `paused` 断言尚未处理，本记录仍为待处理，不标记整体已解决。

## 第二份外部审查 F1/F11：MAIN 回归非稳定结果

本轮只读核对 `C:/Users/WYL20/AppData/Local/Temp/opencode/pa-test.log` 与 `pa-test2.log`：第一轮 253/254，通过数 253、失败 1；第二轮 254/254。失败为 `test failures trigger rework; Claude cannot override independent failures`，期望 completed、实际 failed；首轮该用例 duration_ms=27786.4885。日志指向 `D:/PersonalAgent/dist/test/controller.test.js:47`，不是当前 TEST 验收。

可确认两份日志的结果不一致，但本轮没有重新执行全套测试，也没有失败 state/failure.kind。根因未确认，不能归结为 30 秒 Git 超时、真实 Run 付费成果报废，或因第二轮通过就宣称问题解决。测试还沿用“独立检查不能被 Claude 覆盖”的旧验收职责，与当前决策者自主验收规则需分别核对。

下一步：独立维护任务保留失败 Run 的状态、错误种类、命令和进程退出证据，再做有界复现与基线对照；不要盲目重复完整测试或调整生产错误分类来掩盖失败。Git 超时包装的独立缺陷见 [既有记录](2026-10-12-git-timeout-classification.md)。
