# 外部全面代码审查报告逐项核对

日期：2026-10-12。执行方式：外部 Codex 静态审查与确定性本地验证，没有 PersonalAgent Run、付费模型调用、真实锁清理或 GUI 操作。用户明确要求：核验报告，将合理发现按既有 Problems 规则登记。本轮没有修复产品代码。

## 范围与基线

- 原报告：`D:/PersonalAgent`，MAIN `aff80240342176ec196fedb2028905f489afced9` 加未提交内容。当前主工作区仍有大量用户/历史未提交内容，已保留。
- 登记基线：最新已提交 TEST `aa52a965e0855dcda40566228b8286cd3732e4a4`；从该提交创建 `fix/audit-problem-records-20261012` 与 `D:/PersonalAgent-worktrees/tasks/audit-problem-records-20261012`。
- MAIN 和 TEST 都核对相关实现。记录以 TEST 的仍存问题为主，旧 MAIN 的成立事实与当前已实现修复明确分开。未核验 DEV 或正在运行的二进制版本，不据此声明 DEV 已修复。
- 规则：`problems/README.md` V1.2，用户明确要求登记属于允许范围；每个独立问题一个文件，同类既有问题补充原记录。本轮没有改规则。

## 逐项结论

| 原编号 | 判断 | 核对结果及记录 |
|---|---|---|
| H1 | 成立，缩小范围 | 超时包装为不可恢复 git 已注入复现；TEST 新 Run 默认不每轮 fsck，原优先级 P1 调整 P2。[记录](../problems/2026-10-12-git-timeout-classification.md) |
| H2 | 旧 MAIN 成立；TEST 部分已实现 | lockProject 已有 PID/claim；遗留 targetLock 空 guard 仍有风险。补充 [既有记录](../problems/2026-10-10-recovery-guard-owner.md)，没有新建重复项目锁问题。 |
| H3 | 当前未复现 | 本轮 full fsck 退出 0，无错误。不采纳当前损坏、先 gc/expire 的建议。补充 [历史记录](../problems/2026-10-11-git-refs-after-crash.md)。 |
| A1 | 有依据的条件风险 | PID 复用可能保守误锁；没有实际复用证据，不称永久。[记录](../problems/2026-10-12-lock-pid-reuse.md) |
| A2 | 确认成立 | 普通数字 403 被误判 authentication，本地复现。[记录](../problems/2026-10-12-auth-status-number-misclassification.md) |
| A3 | 可移植性问题成立 | Claude 路径绑定固定用户，当前机故障未证明。[记录](../problems/2026-10-12-claude-executable-hardcoded.md) |
| A4 | 部分合理，不能原样修 | 零目标写入的短暂失败也清批准，可改进；部分写入失效合理，不能无条件保留 approval 或简单原子替换。[记录](../problems/2026-10-12-delivery-transient-error-invalidates-approval.md) |
| A5 | 扫描增长成立，机制描述错误 | 概览全遍历 profile/Run，但 overview 不逐条 hash 审计；会话可复用 profile。卡顿未测量。[记录](../problems/2026-10-12-overview-history-scan.md) |
| A6 | 条件故障成立 | taskkill 失败未报告，runProcess 仍等 close；配置超时不保证结束。[记录](../problems/2026-10-12-process-termination-unbounded-wait.md) |
| A7 | 路径问题成立，建议错误 | Native Node 固定路径；Electron process.execPath 不能直接替换当前启动方式。[记录](../problems/2026-10-12-node-executable-hardcoded.md) |
| A8 | 旧 MAIN 瓶颈成立；TEST 追加已改 | 补充 [既有追加记录](../problems/2026-10-10-audit-append-full-read.md)。活动规模管理另列 [记录](../problems/2026-10-12-native-activity-history-retention.md)，不主张截断可信审计。 |
| A9 | 旧路径成立 | 快照 Diff 临时内容没有清理；默认新 Run 绕过，增长需按调用名称评估。[记录](../problems/2026-10-12-legacy-diff-temp-retention.md) |
| A10 | 未证明缺陷，不登记 | fallback 仅无依赖任务使用 slice；有 dependsOn 时给空完成集合并由 assertPrerequisites 拒绝缺前置项。原报告“依赖顺序导致错误推断”未给可达例子。不能建议盲目置空重跑，可能重复已完成外部操作。 |
| A11 | 绕过结论错误，不登记 | case-sensitive startsWith 在大小写不同情况下更易拒绝；不会因没 toLowerCase 就放行不匹配前缀。path.resolve 规范化相对越界后仍拒绝。没有可达安全绕过证据；若发现实际误拒绝，可另记兼容问题。 |
| A12 | 低优先级改进合理 | 通用目录过滤含历史项目名；omitted 有原因记录，不是完全静默。[记录](../problems/2026-10-12-context-project-specific-exclusion.md) |
| A13 | 旧 MAIN 成立；TEST 已换实现 | MAIN 闭包 connected 固定；TEST GroupWorkspace 使用 refreshLoop，失败抛出后由循环选择 retry 延迟，无原闭包判断。不新建当前缺陷记录，GUI 未验收。 |
| A14 | 条件风险成立 | stopOwned 5 秒上限后 app.quit 未确认剩余 Controller 退出；实际孤儿行为未实测。[记录](../problems/2026-10-12-desktop-stop-incomplete-exit.md) |
| A15 | 配置易用性改进成立 | Real 配置仍要求 mockScenario、claudeExecutable；Desktop 代填，不能称桌面运行必然失败。[记录](../problems/2026-10-12-real-config-mock-required.md) |
| A16 | 误报，不登记 | AJV compile 对同一 schema 对象返回缓存 validator；本地 node_modules/ajv/dist/core.js:158-160,447-453 明确缓存，同对象两次 compile 引用相等。存在方法调用不等于每次重新编译。 |
| A17 | 构建混合成立，分发/攻击面未证实 | build 将测试与运行代码同放 out；没有正式包证据，降为构建改进。[记录](../problems/2026-10-12-desktop-build-test-artifacts.md) |
| B1 | 未证明风险，不登记为缺陷 | UUID 经 --session-id 显式传入，不是凭空猜测；TEST Claude 适配还绑定 init/result session_id，预初始化失败有恢复保护。缺 result.session_id 本身不能证明 --resume 开新会话；真实 CLI 行为未验证。 |
| B2 | 重复工作成立，性能待验证 | 旧隔离交付逐 change 全量校验，成本至少 m×n，direct 走另一路径。不能删除并发安全检查。[记录](../problems/2026-10-12-legacy-delivery-repeated-validation.md) |
| B3 | 旧说法已不适用于 TEST | MAIN 存在 pending 手动处理，但界面有“已记录，等待处理”和待办列表，非完全无提醒。TEST sessions.drainCompleted 自动处理 autoQueued，并明确失败/中断边界，QueuedMessages 可见待办。无自动触发的泛化结论不成立，真实 GUI 未验收。 |
| C1 | TEST 已改变行为 | chatRouting 对暂停后的“好的/可以/继续”等返回 resume，界面有继续按钮；不重复登记旧产品取舍。 |
| C2 | 旧模型枚举，不是当前问题 | 当前 decisionAgent/executionAgent schema 为 codex、claude-code、opencode。旧 openai/codex 别名不能代表当前三种引擎，未发现需登记的当前缺陷。 |
| C3 | 合理边界说明，不是缺陷 | manual acceptance 与测试证据本应区分；MAIN 确认弹窗明确“不声明独立测试通过”，TEST decisionAccepted/userAccepted/passed 分开记录。无需另立工单。 |

## 验证与判断边界

1. `rtk git fsck --full --no-dangling`：在 MAIN 共同对象库执行，退出码 0，无错误输出。没有在本轮修复 Git；不证明未来不会损坏。
2. `rtk proxy node D:/PersonalAgent-data/audit-problem-records-20261012/verify.mjs`：退出码 0。直接内存转译 TEST failure/git-process，注入超时 runner，确认错误分类；本地 AJV 缓存与规范化路径拒绝的最小示例也通过。此为确定性验证，不是真实服务/超时/路径攻击验收。
3. 注入结果在 `D:/PersonalAgent-data/audit-problem-records-20261012/verification.json`。源码与已有规则通过 Serena/定向文本读取核对；未运行真实 Agent、交付、跨机器、进程强杀或规模 benchmark。
4. 原报告仅凭 dist/out 时间戳就声称与源码同步，证据不足：时间较晚不证明来自当前代码。本轮没有接受运行产物等价结论，也没有重建正在使用的产物。
5. 登记内容均包含现象、场景、影响、证据、已确认与待验证边界、状态及下一步。没有因登记授权而实施修复，没有把维护性改进当已发生故障。

## 本轮登记结果

新增 15 个独立问题文件，更新 3 个既有问题文件；本文件是核对索引，不作为额外问题工单。新问题均待处理，其中性能、可移植性、打包与保留策略明确保留待验证边界。登记本身不受这些问题阻碍。后续优先核查认证误分类、进程有界停止、旧 Git 超时与交付恢复 guard；结合实际使用路径确定修复次序，不按旧 MAIN 报告的优先级机械排序。
