# 外部新增功能审查复核

日期：2026-10-13。执行方：外部 Codex。固定基线：TEST `a2d3f95a645320afcb86fa79cc29b08432308c1f`；DEV 只核对引用 `e91d9e4`，未修改；MAIN 未修改。独立分支 `fix/audit-findings-records-20261013`。本轮仅登记问题，不修产品源码、测试、规则或运行实例；没有 PersonalAgent 真实 Run。

## 成立并登记的事项

1. 回归断言维护：更新 [既有记录](../problems/2026-10-12-legacy-acceptance-regression-waits.md)。专项两项失败已复现；全量 16/22 失败数仅来自用户提供报告，未独立核算。不能批量删断言或一律扩大超时。
2. Work/Idle 延后节点的文档与新验收机制不一致：新增 [契约记录](../problems/2026-10-13-work-idle-deferred-contract.md)，P2。恢复旧入队逻辑不是已经确定的修复方案。
3. 非法历史时间污染监督时间：新增 [监督记录](../problems/2026-10-13-supervision-invalid-timestamp.md)，P3，最小函数验证确认。
4. 根目录去重与技能位置过滤冲突：新增 [技能记录](../problems/2026-10-13-shared-skills-root-index.md)，P2，真实配置转换函数的本地夹具确认。
5. 锁 PID 复用：更新 [已有记录](../problems/2026-10-12-lock-pid-reuse.md)。静态风险仍在；没有实际 PID 复用证据，不重复登记。

## 修正或暂不登记为缺陷的说法

| 外部说法 | 复核结论 |
| --- | --- |
| #264 表示执行者再次执行同一任务 | 测试计划有两个不同任务，固定 pass 后推进第二任务符合新契约。归入旧测试断言维护，不另建生产重复执行问题。 |
| 重试应复用 callId | 新 callId 标识真实的独立调用尝试；`CallObservation` 使用 wx 保留历史，`usage-report.ts:33-41` 按调用尝试计数。不能简单复用 ID 覆盖审计。逻辑任务与尝试统计是否需要分开展示，可另提产品改进，当前无误计证据。 |
| thread 累计文件先覆盖后读取 | `CallObservation.codexTurn` 在写入前已读取 previous。同 Run 正式调度顺序执行，累计文件又位于 Run 目录；未发现可达的同线程并发写入路径。读改写竞态仅是假设，当前不登记为已确认问题。 |
| 未知 worker 协议应忽略 | `real-agents.ts:89-96` 对专用 worker 的非法协议 fail-closed 是明确契约。未证明合法 worker 会输出未知行；直接忽略可能吞掉关键结果或身份事件，不采用该修复建议。 |
| stderr 截断 2000/1500 是新缺陷 | 能确认错误摘要被截断，但须以丢失关键诊断的样例证明影响。已有流式 stderr 保留边界，不能无限积累；本轮不重复登记。 |
| Claude 执行侧没有共享 Skills 注入 | 不成立。`ClaudeCodeExecutionAgent extends ClaudeCodeDecisionAgent`，execute 调用继承的 invoke；invoke 在角色 execute 时同样构造 shared plugin 并传 --plugin-dir。 |
| file_change 序列化整份修改内容 | 当前 `codex-live.ts:49` 已把上游 changes 映射成 path/kind；telemetry 序列化的是映射后的数组，不能据此断言泄露文件正文。需要实际另一输入路径或大事件测量后再定性。 |
| 讨论 plan 的 timeoutMs=0 意味着永久调用 | 外层整个多参与者计划不设统一耗时上限，但 `real-agents.ts:51` 给每一步独立 timeoutSignal，适配器还接收配置 timeoutMs；`discussPlan` 按有限步骤与轮数执行。外部取消仍有效，不能只据外层 0 判断无限调用。 |
| 预览项目外路径必然是漏洞 | `service.ts:343-345` 明确要求路径出现在选中事件，并有意允许本机绝对链接只读预览；还限制普通文件、2 MiB、UTF-8、硬链接与读取期间变化，文本做 redact。这不是目录沙箱，也没有敏感路径专门拒绝；是否需更严格授权取决于本地桌面信任边界。未证明未授权读取/外发，不登记为已确认安全缺陷。 |
| delivery.ts:333+ 未读就是风险 | 未读是审阅覆盖限制，不能当作代码缺陷。本轮补读尾段：有写后哈希验证、最终差异/指纹验证及 finally 释放；瞬时错误使审批失效已有独立问题记录。没有新尾段缺陷证据。 |

## 验证与限制

- 独立工作树 `npm.cmd run build`：退出码 0。构建生成的 schema 差异仅发生在本任务工作树，已恢复；不纳入本次文档提交。
- 两项旧断言专项：0/2，通过 0、失败 2，退出码 1。失败证实问题，不是文档交付的失败。
- `.validation/verify-findings.mjs`：非法时间与根目录去重两项确定性检查通过，退出码 0。没有修改共享策略、用户配置或真实 Skills。
- 文档变更要求差异/规则一致性与链接检查，不因记录既存失败而伪称产品回归通过。
- 全量根回归、desktop check/test、真实模型、真实 PID 复用与 GUI 验收均 not-run。本机策略读取为 idle；本轮没有执行 GUI，不能把外部报告的 deferred_by_work_mode 当作本轮实际 GUI 结果。
- 保留任务工作树与 .validation 夹具；无远程推送、DEV/MAIN 交付或实例重启。
- 交付核对时 TEST HEAD 仍为 `a2d3f95`，但工作区出现其他来源的未跟踪 `.delivery-locks/`。按治理规则的目标干净条件，本轮仅提交独立任务分支，暂不整合 TEST；不删除、接管或忽略该目录，不把它纳入本任务提交。
