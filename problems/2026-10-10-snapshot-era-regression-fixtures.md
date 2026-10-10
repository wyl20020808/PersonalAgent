# 旧隔离快照回归夹具需要适配新开发流程

- 归属：PersonalAgent 测试夹具及固定 Project Context 回归，不是外部项目问题。
- 状态：已解决已报告的 13 项失败；组合验证通过，正式进入本机 DEV，窗口启动正常。未声称所有历史测试均已迁移或全库回归通过。
- 发生场景：取消强制 Snapshot 后，自主运行 `call-observation.test.js` 与原子写入、进程测试的组合检查，共 18 项，5 项通过、13 项失败。
- 已确认原因：12 项失败在 `scripts/context-regression-fixtures.ts` 的非 Git `isolated` 创建阶段，夹具依赖已取消的自动项目复制；1 项 Git 固定回归断言期望没有过期盖章，实际得到 1 项。现场确认源 `combat/core.js` 为 LF、Git 克隆工作区为 CRLF；旧流程的全量副本覆盖曾保持源字节。
- 影响：这些旧夹具尚不能证明新流程的工具观察及固定上下文回归全部通过。生产工具事件、Session/Run 审计实现没有删除；桌面审计回放及新的无快照流程专项已通过。
- 证据：组合检查命令为 `node --test dist/test/atomic-replace.test.js dist/test/process-stream.test.js dist/test/call-observation.test.js`。失败夹具及审计保留在 `D:/pa-pc3/c633e2de`，未删除、修复历史记录或启动付费 Agent。
- 下一步：另行将普通审计夹具改为显式授权 Direct，或准备适合 Git 检出语义的 clean Git 隔离夹具；重新明确源字节、checked_files 与未验证 Diff 的断言。不能为了满足旧测试恢复强制全项目扫描或备份。本任务按用户要求不扩大到整套旧测试迁移。

## 2026-10-10：获批组合整合处理

上述发生场景与下一步是独立 Snapshot 阶段的历史记录。本次用户明确授权处理这 13 项失败，全部原测试保留，没有删除或跳过审计保护。

| 原失败测试 | 判断与处理 | 结果 |
| --- | --- | --- |
| supplied receipts / prompt / catalog | 非 Git 自动隔离前提过时；固定夹具使用 clean Git isolated，保留实际 prompt、路径不等于已读的断言 | 通过 |
| Claude Read paired result / range / shell | 同一过时前提；成功/失败读取、越界及凭据保护保留 | 通过 |
| Claude usage deduplication / resume | 同一过时前提；去重与未知使用量断言保留 | 通过 |
| Codex typed commands / cache / negative exit | 同一过时前提；类型映射、负退出码及不得推断 Read 保留 | 通过 |
| fresh / resumed Claude modelUsage | 同一过时前提；完整与未知使用量语义保留 | 通过 |
| RealAgents timeout | 同一过时前提；本地失败注入和部分 usage 保留 | 通过 |
| RealAgents interrupted | 同一过时前提；中断与已有 usage 保留 | 通过 |
| RealAgents invalid-output | 同一过时前提；不完整输出仍不得成功 | 通过 |
| partial progress / separate Runs / audit tampering | 同一过时前提；跨 Run 分离和篡改拒绝保留 | 通过 |
| T1 fixed regression | 同一过时前提；真实 Git Diff、完整契约和独立源码测试保留 | 通过 |
| T2 fixed regression | 同一过时前提；预置跨模块错误、独立否决及实际返工保留 | 通过 |
| T3 fixed regression | 同一过时前提；知识更新及业务代码不变保留 | 通过 |
| T3 main/dev Git freshness | 源 LF/克隆 CRLF 属于测试输入差异；`.gitattributes` 固定 LF，仍测试 dev 真正过期，不恢复内容复制 | 通过 |

T2 Review 辅助断言同步使用 Controller 文档/checked_files 观测及 `projectFileHash`，不再错误比较旧全量 Snapshot 和新定点摘要；完整 geometry 契约、跨模块扩展及独立失败否决仍保留。额外四项 T2 修复 Review 回归通过。

P2A 决策夹具改为明确授权 Direct，保留独立 Session、模型、调用、失败恢复与禁止提前 Execute；加入旧全项目捕获会拒绝的硬链接，仍完成讨论，并断言没有 project-baseline/snapshot-objects。Desktop 逐段更新非 Git isolated 明确失败、Direct 摘要审批零重复写入、大型准备无快照、准备失败消息/Run/审计绑定等前提；clean Git isolated 历史和下一轮保护保留。长 Git Runtime 限制另见 `2026-10-10-isolated-git-long-runtime-path.md`。

最终核心组合 65/65、Desktop 83/83、实际 Electron 8 组检查通过。证据：`D:/PersonalAgent-data/snapshot-p2a-integration-v1/core-final.log`、`desktop-final.log`；`D:/PersonalAgent-data/multi-decision-discussion-p2a/electron-f7abd572/result.json`。付费调用 0；这是独立 Codex Desktop 自主确定性验证，不是远端 Agent 或 Controller 独立开发验收。

## 2026-10-10：P3C 全量回归补充

- 当前状态：原获批 13 项已解决；本次新确认的其余历史回归失败待处理。没有将旧处理结论扩展为全库通过。
- 场景：P3C 独立 Worktree 对全部 Controller 测试执行 `node --test --test-concurrency=1 dist/test/*.test.js`：321 项，202 通过、119 失败。排除 6 项大项目失败后，其余 113 项在 `ddb098aedff7a40dc4a161f2e8eda8722bf32598` 的独立副本全部同名失败，missing/additional 均为空。基线命令另有 12 个未匹配测试的文件级通过条目，不能当作 12 项业务验证通过。
- 现象：旧 Delivery isolated Apply 夹具被“Snapshot-free isolated Run cannot safely Apply”拒绝；非 Git isolated 夹具在准备阶段被拒绝；无完整 Snapshot 的 no-change、变更范围、源文件一致性和对象完整性断言与现流程不符。以实际失败日志逐项为准，不能将所有失败笼统归为测试问题或生产代码问题。
- 验证隔离：从 `dev` 的 Git archive 生成 `.validation/baseline-dev`，仅在该独立副本编译并复现同名失败；没有运行正式 DEV、修改其 Worktree 或数据。
- 证据：`D:/PersonalAgent-worktrees/tasks/opencode-execution-agent-p3c/.validation/controller-tests.log`、`baseline-failures.log`、`baseline-comparison.json`。这些本地证据不提交到 Git。
- 影响：P3C 不能宣称全库回归通过；新增专项、Desktop 和本地原生闭环单独报告。本轮不合入 DEV，因此不扩展至整套 Snapshot 遗留迁移。
- 下一步：按现有无 Snapshot、有限 Diff、Direct 审批和显式 isolated 规则逐项审查；获授权后修复夹具或确证的生产缺陷，不删除用例、降低保护或恢复强制 Snapshot。
- 测试范围偏差：首次全量误包含既有 2 万文件、101 MB 文件及 512 MB 稀疏文件的夹具，违背本轮禁止压力测试的约束；后续排除 `large-project-snapshot.test` 和 `no-project-snapshot.test`，没有重跑。6 项大项目失败只静态比对，不宣称已运行复现。保留证据，不删除历史记录。
