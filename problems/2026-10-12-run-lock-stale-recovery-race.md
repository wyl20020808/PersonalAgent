# Run 锁恢复竞态与无归属释放

- 归属：PersonalAgent。状态：待处理。优先级：P2。来源：第二份外部审查 F4。
- 场景：两个 Controller 进程同时恢复同一个已确认死 PID 的残留 Run 锁。
- 证据：TEST `a39215ed` 的 `src/store.ts:157-167`，检查旧锁、unlink、创建新锁没有串行恢复保护；release 只检查存在就删除，没有验证当前锁身份。
- 确定性复现：直接抽取当前 `Store.lock` 方法体，在内存文件系统模拟跨进程交错。B 读取旧 PID 后暂停；A 回收旧锁并创建自己的锁；B 恢复后 unlink 删除 A 的新锁，再创建 B 锁。A/B 均拿到 release；随后 A release 删除 B 锁。验证输出 `bothAcquired=true,firstReleaseDeletedSecondLock=true`，退出码 0。
- 影响：互斥失效，两个持有者可并发写 state/audit；释放锁可能删除另一持有者的锁。本轮没有损坏任何真实 Run，也没有实际启动两个 Controller 竞争生产锁。
- 已确认原因：`wx` 只能保证单次创建独占，无法保护 stale 检查与删除之间的交错；仅比较 PID 也不足以标识锁的一次持有生命周期。
- 下一步：为 Run 锁建立可验证的恢复串行机制及唯一持有 token，释放时核对身份；明确未知/损坏锁的保守处理。不要因其他 worktree 有项目 guard 修复就直接宣称 Run 锁已修。
- 验证：源码方法体、模拟调度与虚拟文件系统；脚本及结果在 `D:/PersonalAgent-data/audit-second-problem-records-20261012/verify.mjs`、`verification.json`。
- 关联：[PID 复用](2026-10-12-lock-pid-reuse.md) 是身份误判；[恢复 guard](2026-10-10-recovery-guard-owner.md) 是另一个锁范围。本记录不重复这两个根因。
