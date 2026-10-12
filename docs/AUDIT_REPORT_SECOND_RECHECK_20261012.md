# 第二份外部全面审查报告核对与合并登记

日期：2026-10-12。执行方：外部 Codex。任务范围：用户要求核对合理性，优先合并相似问题，没有记录则新增。本轮没有修复产品源码、启动真实 Run、调用付费模型或操作 GUI。

原报告审查 MAIN `aff8024` 加未提交内容；本轮读取该旧实现及最新已提交 TEST `a39215edcbe8354be590c63b059703b3d88701c5`，登记以当前 TEST 的适用范围为准。任务分支 `fix/audit-second-problem-records-20261012`；独立任务树 `D:/PersonalAgent-worktrees/tasks/audit-second-problem-records-20261012`。规则版本维持治理 V2.1、问题反馈 V1.2。MAIN 用户改动、DEV 与实际运行实例均未替换。

## 逐项判断

| 编号 | 判断 | 证据与处理 |
|---|---|---|
| F1 | 错误分类缺陷成立，flaky 根因未确认 | 与上份 H1 同根因，补入 [Git 超时分类](../problems/2026-10-12-git-timeout-classification.md)。两份外部日志确有 253/254 和 254/254，但首轮失败没有 state.failure，耗时 27.786 秒也不能证明一条 30 秒 Git 超时。日志补入 [回归维护](../problems/2026-10-12-legacy-acceptance-regression-waits.md)。不接受“付费成果全部报废”推论。 |
| F2 | 旧 MAIN 暂停循环有依据；当前 TEST 不成立 | 旧 controller:261 的 diffOmitted gate 与普通 verify 恢复确有循环风险。当前 TEST pass 走 acceptDecision，不以 Diff 截断强制暂停，Diff 上下文大小限制交决策者用原生工具读取。与 [已记录自主推进问题](../problems/2026-10-12-decision-pass-resume-loop.md) 关联，不新建当前工单，不建议重新增加例行人工审批。 |
| F3 | 旧接口限制成立；当前“无出口”不成立 | 当前 drive limits 支持 timeoutMs/maxLoops/maxReworks，CLI --timeout-ms/--max-loops 可更新；Desktop 新 real timeoutMs=0、启动/恢复去除 loop/rework 上限，恢复旧 real 超时配置会传 --timeout-ms 0。显式 CLI 限制仍保留，不意味着应自动绕过。没有登记新的永久卡死问题。 |
| F4 | Run 锁竞态与无归属释放成立 | 用当前 Store.lock 源码模拟交错确认双持有者及旧 release 删新锁，新增 [Run 锁竞态](../problems/2026-10-12-run-lock-stale-recovery-race.md)。项目 guard/遗留交付 guard 补入 [既有恢复锁](../problems/2026-10-10-recovery-guard-owner.md)，不混淆锁类型或直接整合外部任务。 |
| F5 | 有条件风险，真实会话失效未证实 | 当前已 resumed 的 Claude ID 普通恢复不重建，但认证过期不等于会话丢失，且已有显式角色切换交接出口。新增 [会话恢复边界](../problems/2026-10-12-claude-existing-session-recovery.md)，状态待验证。禁止把所有错误自动重置会话并重放任务。 |
| F6 | 旧 MAIN 枚举/声明不一致；TEST 已改变 | 当前 Agent schema 为 codex/claude-code/opencode；agentCapabilities claude execute=true；OpenCode 有模型发现与启动能力检查实现。原 openai 隐式别名不代表当前架构。未新建过时问题。 |
| F7 | 合理，合并既有记录 | 原 apply 失败清 approval 已登记，本次额外确认 deliveryStatus 查询失败同样作废。补入 [交付批准失效](../problems/2026-10-12-delivery-transient-error-invalidates-approval.md)，不无条件保留安全失败的批准。 |
| F8 | 旧 MAIN 成立；TEST 不适用 | 当前 GroupWorkspace 使用 refreshLoop，失败抛出后选 retry 延迟，不使用旧 connected 闭包决定定时。与上次 A13 同结论，不重复登记。 |
| F9 | 合理，已有记录 | 固定 Native Node 路径仍存在，引用 [既有记录](../problems/2026-10-12-node-executable-hardcoded.md)。Electron process.execPath 不一定是 Native Node，不能未经验证直接替换。不因重复报告新增文件。 |
| F10 | 确认成立 | 真实源码函数体配模拟 child：无换行尾行在 stdout 但 onLineCount=0。新增 [流式尾行](../problems/2026-10-12-process-stream-trailing-line.md)，不是返回 stdout 全部丢失。 |
| F11 | F1 的未证实归因，合并 | 两轮通过/失败变化只证明日志不稳定，不证明具体 Git 超时，也没有本轮的失败状态。并入同一 Git/回归记录，避免将同一猜测拆成两份缺陷。 |
| F12 | 条件路径确认成立，修正上次结论 | overview→publicRun→pendingContextConfirmations→auditRecords；有确认目录才全量校验，无目录提前返回。thread 缓存不覆盖该路径。3 条审计、空目录、两次调用得到全文读 2 次。补入 [概览记录](../problems/2026-10-12-overview-history-scan.md)，并纠正 [上次索引 A5](AUDIT_REPORT_RECHECK_20261012.md)。大规模延迟未测。 |
| D1 | 当前规则已明确，不新增决策问题 | 2026-10-09 已取消内部付费预算阻断，agent-usage.ts 只统计历史调用；当前 ProjectCreate 不显示旧“总调用预算”，历史全局预算标已停用。保留 schema 历史字段不等于当前仍执行硬限制；不新增用户未要求的付费上限。 |
| D2 | 设计取舍，非已证缺陷 | recoverable 表示修复认证后允许用户恢复，不是自动成功或认证已恢复。当前 supervisionBlock 阻止 authentication/budget 自动续跑。真实请求未必每次计费，不能称所有失败都消耗 API 费用。无需为了可人工重复操作自动加产品上限。 |
| D3 | 部分事实合理，整体未验收推论过强 | 非 direct apply 主要复核源证据/目标内容，通常不在目标重新跑测试。但隔离源工作区已有决策者验收，当前治理要求决策者自主选择验证，不强制 Controller 固定全量测试。旧 proposal 的末任务全套测试范围与目标环境差异是应说明的边界，不等于从未整体审查或必须自动重测。本次不新建安全故障工单。 |

## 验证

- 本轮本地脚本：`rtk proxy node D:/PersonalAgent-data/audit-second-problem-records-20261012/verify.mjs`，退出码 0。用 TypeScript AST 抽取当前源函数体，执行内存锁交错、模拟 child EOF，以及 3 条有效审计的小样本；没有绕过策略启动真实工具或进程。结果：`verification.json`。
- 外部测试日志已只读核对：`C:/Users/WYL20/AppData/Local/Temp/opencode/pa-test.log` 与 `pa-test2.log`。其结果来自旧 MAIN；本轮未重新运行 npm test，也不能确认旧批次与当前源码/产物完全一致。
- 静态核对：新旧 Controller、锁、Process、Claude 会话、Desktop 恢复、OpenCode 能力与契约确认审计调用链。GUI、真实 CLI Session 丢失、并发真实 Controller 及大文件性能验收未运行。
- 文档验证：本批仅问题记录和核对索引，检查链接、UTF-8、条目覆盖和 Git diff；无需为文档改动重建活跃软件或重复全量测试。

## 登记结果

新增 3 个独立问题：Run 锁恢复竞态、流式无换行尾行、Claude 已确认会话丢失后的恢复边界。更新 5 个问题文件：Git 超时分类、历史回归、恢复 guard、交付批准失效、概览扫描。另修正首次核对索引并新增本索引，共 10 个文档文件。问题均待处理；会话失效保留待验证标记，其他未动态验证的条件分支也如实说明。本轮登记不受这些问题阻碍，没有实施修复或关闭工单。
