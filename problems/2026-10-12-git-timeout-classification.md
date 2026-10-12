# Git 超时被标为不可恢复错误

- 归属：PersonalAgent。状态：待处理。优先级：P2。来源：外部审查 H1。
- 场景：旧快照模式或其他仍调用 `gitProcess` 的路径，Git 操作超过默认 30 秒。
- 证据：TEST `src/git-process.ts:13-21,35-44` 将非主动取消的进程异常统一包装为 `FlowError('git')`；`src/failure.ts:9-23` 将其判为不可恢复。当前源码的内存转译与注入 runner 验证：`Timeout after 30000 ms` 得到 `kind=git,recoverable=false`。
- 影响：瞬时超时可能使仍执行完整性检查的 Run 进入不能直接恢复的失败状态。30 秒超时与 Git 对象真实损坏应分别处理。
- 边界：当前 TEST 新 Run 默认取消全量快照，`controller.ts` 的完整性检查受 `snapshotPolicy !== 'none'` 条件控制。不是所有新 Run 都每轮 fsck；`agentOperation` 也不是前后各调用一次 fsck。原报告 25.4 秒不是本轮实测，更不证明发生超时。
- 下一步：区分超时、主动停止、真实 Git 错误；完整性检查按用途设时间限额。保留对象损坏的安全阻断，不能把所有 Git 错误改成可自动重试。
- 验证：本地注入通过；未制造真实超时，未恢复真实 Run。证据见 `D:/PersonalAgent-data/audit-problem-records-20261012/verification.json`。
