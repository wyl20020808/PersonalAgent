# Git 超时被标为不可恢复错误

- 归属：PersonalAgent。状态：待处理。优先级：P2。来源：外部审查 H1。
- 场景：旧快照模式或其他仍调用 `gitProcess` 的路径，Git 操作超过默认 30 秒。
- 证据：TEST `src/git-process.ts:13-21,35-44` 将非主动取消的进程异常统一包装为 `FlowError('git')`；`src/failure.ts:9-23` 将其判为不可恢复。当前源码的内存转译与注入 runner 验证：`Timeout after 30000 ms` 得到 `kind=git,recoverable=false`。
- 影响：瞬时超时可能使仍执行完整性检查的 Run 进入不能直接恢复的失败状态。30 秒超时与 Git 对象真实损坏应分别处理。
- 边界：当前 TEST 新 Run 默认取消全量快照，`controller.ts` 的完整性检查受 `snapshotPolicy !== 'none'` 条件控制。不是所有新 Run 都每轮 fsck；`agentOperation` 也不是前后各调用一次 fsck。原报告 25.4 秒不是本轮实测，更不证明发生超时。
- 下一步：区分超时、主动停止、真实 Git 错误；完整性检查按用途设时间限额。保留对象损坏的安全阻断，不能把所有 Git 错误改成可自动重试。
- 验证：本地注入通过；未制造真实超时，未恢复真实 Run。证据见 `D:/PersonalAgent-data/audit-problem-records-20261012/verification.json`。

## 第二份外部审查 F1/F11：同根因合并登记

TEST `a39215ed` 仍将 runner 超时包装成非 recoverable 的 git，此代码问题与原 H1 同根因，不新增文件。外部两轮日志可核实同一 MAIN 测试首次 failed、其次 completed，但缺少首次 state.failure、具体 Git 命令与时间线，不能归因为本问题。

首次失败用例总耗时为 27786.4885ms，小于其假设的单条 Git 默认 30000ms 超时，更不能把该推断当实证。不可恢复状态也不等于已完成付费成果全部丢失，代码和审计仍可能保留。只读 Git 重试也需确认错误类型及运行状态，不能同时放行真实 git-integrity/safety/rejected。

日志不稳定性补入 [已有回归维护记录](2026-10-12-legacy-acceptance-regression-waits.md)，保留待定位边界。
