# 自动验收流程下部分历史回归仍等待旧暂停节点

- 状态：待处理；属于本轮验证额外发现的测试维护问题，不是全自动开发功能的用户需求登记。
- 现象：扩大 Controller 回归的 T1/T2/T3 固定任务仍断言 `paused`，实际决策者验收后为 `completed`。桌面 thread 测试还存在共享运行夹具等待超时后串联产生 `Run still active`、不可恢复等失败。
- 基线证据：在未修改 TEST 运行三项 fixed-task 对照，三项均失败，核心差异仍为 `completed` 与 `paused`。随后从初始 `test@59883a881d6b9555d233cd59b80eff2c5b0fc0d4` 创建独立只读基线工作树 `D:/pa-as-baseline-20261012`，针对扩大桌面回归的七项失败复核，六项 thread 失败复现，isolated rounds 一项通过。
- 任务工作树证据：`.validation/automatic-controller-tests.log`、`automatic-desktop-tests.log`、`automatic-desktop-focused.log`。基线证据：`D:/PersonalAgent-worktrees/test/.validation/supervision-baseline-check.log` 与 `D:/pa-as-baseline-20261012/.validation/automatic-baseline-desktop.log`。前者只运行本地注入式 Mock，不更改真实 Run 或配置。
- 额外时序事实：扩大根目录回归并发触发若干短超时，已停止本任务的该扩大测试进程树，未终止其他任务。核心受影响模块串行组合 34/35，唯一 Mock 超时用例单独复测 1/1 通过；桌面 isolated rounds 超时用例单独复测 1/1 通过。不能把这些不同批次改写成一次全量通过。
- 影响：不能宣称全量 Controller/桌面回归通过。新增自动监督专项及必要构建、类型检查单独报告；没有通过删除用例、增加生产权限或改写审计绕过失败。
- 下一步：在独立测试维护任务中迁移旧人工暂停断言、隔离共享夹具并按实际 Controller 终态及进程退出等待；保留真实用户批准与决策者验收的区分。
