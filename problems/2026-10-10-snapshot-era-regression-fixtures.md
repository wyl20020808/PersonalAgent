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

## 2026-10-10：Global Work / Idle V1 的整库核查

原 13 项修复状态保持已解决；其他历史整库测试仍未全部迁移，剩余问题状态为待处理。本次 feature 阶段性整库 314 项中 194 通过、120 失败；DEV 归档副本 307 项中 148 通过、159 失败。119 个 feature 失败名称也出现在 DEV 失败集合；唯一额外跨进程 Mock 失败来自测试子进程未继承隔离 idle 夹具，修复测试启动后 dual-instance 5/5。归档副本目录较长，Windows 路径问题增加了基线失败，不能把数量差异当作功能改善证明。

后续受影响 Agent 组合 49 项中 46 通过、3 项失败；失败为 planning/executor/reviewer 变更汇总、带同一 thread 的中断恢复、跨恢复的审查修复上限，均为既有失败。旧 no-verifiable-diff、untracked Snapshot 及旧预算前提等断言没有为本任务删除或恢复强制 Snapshot。Desktop 的模式夹具在测试子进程中显式注入后最终 84/84，通过；DEV Desktop 83/83。

详细日志留在本次任务工作区 `validation/global-interaction-regression/`，提交中保存脱敏比较摘要。影响：不能将 Global Work / Idle 专项或 Desktop 成功称为根目录整库全绿或正式发布验收；后续应单独审查各失败断言的现行契约，而非扩大本功能任务修复全部历史问题。

## 2026-10-10：工作模式持续开发修正

工作模式不再暂停 Agent。整库阶段检查 `validation/semantic-full-final.log` 为 322 项、203 通过、119 失败；按失败名称逐项对照，119 项均在已有 DEV 归档失败集合中，没有新增名称。DEV 归档长路径仍影响基线，不能据此声称等价或全绿。最后的策略专项独立复核 16/16，Desktop 84/84；正常安全命令通过、GUI pending 不绕过 Review/审批和失败单测。

此次新增 Claude invocation-local Hook 后，旧“CLI 永远不传 --settings”断言已过时；改为核对仅追加 interaction Hook、保留 Session 与工具配置，单独合约检查 1/1。其他历史失败没有删掉或为本轮恢复 Snapshot。阶段整库与最终专项分开记载，状态仍为剩余历史迁移待处理，影响仍是不能据此发布稳定版本。比较证据在 `docs/evidence/global-work-idle/verification-summary.json`。
