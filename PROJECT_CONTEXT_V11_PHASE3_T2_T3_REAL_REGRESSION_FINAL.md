# Project Context V1.1 第三阶段最后 T2/T3 真实回归报告

执行日期：2026-10-09。新批次：`D:/pa-pc3-real/20261009-8d54a713`。工作目录：`D:/PersonalAgent-worktrees/tasks/project-context-v11-phase3`，分支 `feature/project-context-v11-phase3`。

**结论：T2、T3 均正式 PASS；结合此前 T1 正式 PASS，第三阶段固定真实行为验证已完成。用量和读取观测完整性为 PARTIAL。** 本批实际 CC 5 次、Codex 2 次，未超过授权上限 7/3；Execute 返工 0。没有启动新 T1、其他真实任务或额外 Run。

## 1. 启动前核对与工程边界

当前 src/test/dist 的实际文件哈希与 Controller 242/242 全量回归副本一致；11/11 专项回归零失败、取消、跳过。已核对并保存 Harness 修复脚本、新 T2/T3 调度脚本、固定种子、需求、geometry 断言实现及外部独立验收程序 SHA-256；T2/T3 验收程序与上一批逐字节等价。未重新构建或修改已验收运行源码。

本次新增 `validation/phase3/run-real-t2-t3-final.mjs` 是已验收 Harness 的仅 T2/T3 调度副本：新授权 7/3、各任务上限 4/2 和 3/1、只读历史 T1 前置核对、最新专项及历史证据检查。正式 Controller、安全验收、预算、隔离、恢复和 SDK 未更改。脚本通过 `node --check`，准备阶段零调用；执行时再次校验构建及脚本哈希。配置与授权原文另存新批次，未复用旧授权。

两项分别使用全新源码夹具、独立 runtime、正式 isolated/native/real Run，正式 createRun/drive、RealAgents、原生 Claude Code 和 Codex SDK。新批次 CC 账本限额 7，T2/T3 的 maxLoops 合计限制 Codex 最多 3 次。现场注册的其他项目预算分别绑定 CafeGame/FishEatFish，不适用于新固定夹具；未修改或重置它们，未绕过已适用全局额度。

没有批准或应用 Delivery，没有修改 FPSArena、OpenWorld 等真实项目，没有提交、合并、push 或发布。PersonalAgent main/dev/feature 的 HEAD 均未改变。Git 种子提交仅发生于授权的新 T3 固定夹具，不是 PersonalAgent 发布或合并。

证据：[preflight.json](D:/pa-pc3-real/20261009-8d54a713/preflight.json)、[authorization.json](D:/pa-pc3-real/20261009-8d54a713/authorization.json)、[existing-policy-check.json](D:/pa-pc3-real/20261009-8d54a713/existing-policy-check.json)。

## 2. T2 跨模块真实回归

Run：`af6851c5-3bd9-4146-97d9-cd1ea9eaab7a`；最终 `completed`。正式行为 **PASS**，观测 **PARTIAL**。原始 Plan 一个任务 `T2-combat-reach`，moduleIds=`["combat"]`。实际 CC 3、Codex 1、Execute 返工 0，执行耗时 149808 ms。

真实 Codex 第一次完成后先归档原始输出、快照和 Diff，再注入固定错误候选 reach=4、world.unit=cm。注入文件独立记录 `provenance=test-injected`、`origin=test-injected-wrong-candidate`、`autonomousModelError=false`、前后快照和 Diff；不能归责于 Codex。

Controller 对注入候选独立验收失败，exitCode=1，reach 断言 4 != 3；Context Report actualModules=`["combat","world"]`、expandedModules=`["world"]`，并发现模块哈希不一致。第一个正式 Review 前通过冻结基线完整 geometry 契约全文、来源和快照检查；相关全文以 supplied 回执留证。

CC 在第一次原生 Review 中修复 reach=3、world.unit=m，移除注入注释，并重新盖章 combat 哈希；原始回执为 pass，但 Controller 未直接完成任务，而是记录 `review-modified-workspace` 并重新独立验收。第二次独立验收 exitCode=0、passed=true。逐字节比较冻结任务基线确认 world 完全恢复，worldChanges=[]、expandedModules=[]；此时 Harness 正确允许继续 Review，并仍要求完整 geometry 契约。

第二次真实 CC Review 最终 pass，checkedContracts=`["geometry"]`，严格引用规范化 problems=[]，契约仍 proposed、来源 task-baseline。Controller 正式完成，最终无 MODULE_HASH_MISMATCH、越界文件或源目录变更。必要业务约束全部通过：reach=3、两模块单位 m、wallX=10、无无关 HUD 修改。

纠正来源为 **CC 原生 Review 小修一次**，不是第二次 Codex Execute；Controller totalReworks=0。原因是固定测试注入，不是上下文不足导致的 Execute 返工。

限制如实保留：combat 文档本轮更新 checked_files，正文仍保留种子中的 main reach=2 描述。CC 明确核对当前 reach=3，正式固定业务验收通过，但不能据此宣称所有知识正文已自动与源码一致。

证据：[原始 Codex 产物和 Diff](D:/pa-pc3-real/20261009-8d54a713/T2/codex-actual-1.json)、[注入来源与 Diff](D:/pa-pc3-real/20261009-8d54a713/T2/test-injected-candidate.json)、[完整结果](D:/pa-pc3-real/20261009-8d54a713/T2/result.json)、[正式审计](D:/pa-pc3-real/20261009-8d54a713/T2/r/runs/af6851c5-3bd9-4146-97d9-cd1ea9eaab7a/audit.jsonl)、[进入 T3 前固化的 93 个文件哈希](D:/pa-pc3-real/20261009-8d54a713/T2/completed-evidence-sha256.json)。

## 3. T3 分支与过期知识真实回归

Run：`1315c7b9-fc26-4a48-972e-f0d4ccbf226d`；最终 `completed`。正式行为 **PASS**，观测 **PARTIAL**。原始 Plan 一个任务 `combat-reach-doc-refresh`，moduleIds=`["combat"]`。实际 CC 2、Codex 1、返工 0，耗时 119289 ms。

独立现场核对：main HEAD=`d7ccda3ef6fb350eb1d4cd141c30cb44793d8b1c`、reach=2；dev HEAD=`e6b9561224060d46a7956365730ce6648e641b3b`、reach=5。执行工作区当前分支 dev，HEAD 与 dev 种子一致，未产生新业务提交。main 为只读比较快照，未启动 main Run。

Plan/Execute 的导航 manifest 均绑定当前 dev HEAD，并报告 combat/core.js 的 MODULE_HASH_MISMATCH：旧 checked_files 为 `481d3a67116ad576b4b7150b5a6ff007bc0d1b9db11e7352f01a9706c3845026`，当前实际为 `9873b466873b8b5e8ec5f6822f07fe88b3293279b145624483b40c0a649f654c`。CC 计划明确目标 dev、两分支差异及过期说明；Codex 现场核对后更新 combat 文档三节和 checked_files。

最终文档明确当前 dev reach=5、unit=m，main reach=2 仅作为分支差异。更新哈希与最终源码 SHA-256 一致，Review manifest freshness=[]。最终所有 app/combat/world 业务文件与目标 dev 种子逐字节一致，仅 combat 模块文档改变。独立验收 exitCode=0、passed=true、issues=[]、context findings=[]；最终正式 CC Review pass，checkedContracts=`["geometry","hud"]`，规范化 problems=[]。geometry 为必要冻结契约，hud 为本轮安全加载的可选当前契约，均保持 proposed。

CC 明确记录 geometry 的 reach<=3 条款标注 T2，不能将其作为本轮 dev reach=5 的已确认约束，也没有因此修改业务代码。未观察到错误 main 实现引用为当前 dev 或从历史 manifest 复用知识；完整文件 I/O 覆盖仍不可证明，不以 Shell 推断 confirmed-read。

非阻断现象：CC Review 提到 Git status 另列 11 个 M 文件，任务开始前已存在且内容 Diff 为空；本次逐字节验收确认业务文件未变，保留原始审计，不进行 Git/EOL 重构。没有新增长路径失败或观察到 0xC0000409 / 0xC0000005；原失败证据继续保留。

证据：[Git 与种子记录](D:/pa-pc3-real/20261009-8d54a713/T3/fixture.json)、[main 只读快照](D:/pa-pc3-real/20261009-8d54a713/T3/main-readonly-snapshot.json)、[完整结果](D:/pa-pc3-real/20261009-8d54a713/T3/result.json)、[正式审计](D:/pa-pc3-real/20261009-8d54a713/T3/r/runs/1315c7b9-fc26-4a48-972e-f0d4ccbf226d/audit.jsonl)。

## 4. 完整用量和观测边界

下列 Token 均来自本次真实原生协议。CC 的普通输入、缓存读取和缓存创建分列；Codex cached_input_tokens 是其 input_tokens 子集，不能相加。恢复 CC 只汇总本次可识别请求，不采用含历史的会话累计 usage/modelUsage；此类调用标 partial。SDK 未报告模型与内部请求数时保留 null。Prompt 字节不换算 Token，不估算费用或节约比例。

每次调用的 callId、原始 Token、来源、模型、已识别请求数、耗时、Prompt 哈希/字节、supplied、confirmed-read 和所有 Shell 原始命令/生命周期/退出码均保存在 [summary.json](D:/pa-pc3-real/20261009-8d54a713/summary.json) 的 tasks[].calls 中；原始 manifest、reads.jsonl、usage.json 和脱除隐藏思维的 native public JSONL 保存于各任务目录。Shell 命令按已有凭据脱敏协议保存，不解析为 confirmed-read。

本批 Prompt 共 **69605 UTF-8 字节**；supplied **19** 条，confirmed-read **0** 条；Shell **46** 个生命周期事件、按 callId/toolCallId 去重 **23** 条命令。零 confirmed-read 仅表示没有配对的原生 Read 文本回执，不能断言 Agent 未读文件。总体完整文件读取覆盖、完整内部请求数、费用及节约比例均 null/unknown。

每次真实调用：

| 调用 | Agent/阶段 | Prompt 字节 | 输入 Token | 输出 Token | 缓存读取 Token | 缓存创建 Token | 耗时 ms | 用量完整性 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| T2 1 | claude plan | 6733 | 4 | 1107 | 42844 | 18396 | 19683 | complete |
| T2 2 | codex execute | 7592 | 179230 | 1140 | 154752 | 0 | 69670 | complete |
| T2 3 | claude review | 14224 | 8 | 2890 | 153549 | 35191 | 38057 | partial |
| T2 4 | claude review | 12342 | 4 | 1368 | 108655 | 10582 | 19554 | partial |
| T3 1 | claude plan | 7053 | 4 | 1001 | 43245 | 17749 | 18437 | complete |
| T3 2 | codex execute | 8356 | 161340 | 1522 | 150400 | 0 | 75645 | complete |
| T3 3 | claude review | 13305 | 4 | 1451 | 55479 | 29775 | 22019 | partial |

任务与本批 Token 汇总：

| 范围 | Agent | 输入 Token | 输出 Token | 缓存读取 Token | 缓存创建 Token |
|---|---|---:|---:|---:|---:|
| T2 | claude | 16 | 5365 | 305048 | 64169 |
| T2 | codex | 179230 | 1140 | 154752 | 0 |
| T3 | claude | 8 | 2452 | 98724 | 47524 |
| T3 | codex | 161340 | 1522 | 150400 | 0 |
| 本批合计 | claude | 24 | 7817 | 403772 | 111693 |
| 本批合计 | codex | 340570 | 2662 | 305152 | 0 |

任务观测：

| 任务 | Prompt 字节 | supplied | confirmed-read | Shell 事件 | Shell 命令 |
|---|---:|---:|---:|---:|---:|
| T2 | 40891 | 11 | 0 | 22 | 11 |
| T3 | 28714 | 8 | 0 | 24 | 12 |

CC 模型报告为 claude-opus-5-5；已识别请求数逐调用为 T2：2/null/4/2，T3：2/null/2。null 对应 Codex，完整内部请求数仍未知。

## 5. 历史保全与第三阶段结论

此前第一批 117 个、第二批 188 个历史证据文件的 SHA-256 在启动前和本批结束后均一致，所有旧失败状态、审计、注入来源、Token 和调用消耗保留。原批次 T1 协议失败、第二批 T2 Harness 失败均不修改为 PASS，不覆盖历史最终报告。

历史 T1 Run `ea0ecbe2-1326-44cc-a606-e04766f92435` 正式 PASS，仅只读复核，没有重新执行。此前两批合计 CC 6、Codex 3；本批新增 CC 5、Codex 2；三批历史实际累计 CC **11**、Codex **5**。新授权只约束本批，历史用量不冲抵、不清零。

固定真实验收中，T1 局部 HUD、T2 跨模块检测与纠正、T3 当前分支与过期哈希处理均获得正式 Controller 完成及 CC Review 通过；最终固定业务约束失败数为 0，观察到的错误版本引用为 0，上下文不足导致的 Execute 返工为 0。T2 的注入初始错误与一次 CC 修复作为测试设计独立记录，不冒充模型自主错误。

因此，**本次范围内第三阶段固定真实行为验证已完成（PASS）**；**观测完整性 PARTIAL**，不能宣称全量读取覆盖、所有知识正文一致、跨项目生产效果或成本收益已经验证。Windows 既有底层风险及 T2 文档正文限制继续保留，未扩大功能范围。

结束后审计链、usage/reads/native 证据哈希及源目录快照均验证通过，T2 在进入 T3 前已固化的证据未变。新批次 [最终 169 个文件 SHA-256 清单](D:/pa-pc3-real/20261009-8d54a713/final-evidence-sha256.json) 覆盖完整结果、机器汇总及原始证据；排除 Git 内部元数据与清单自身。

**停在 feature 分支，等待用户授权第三阶段正式合入 dev。** 没有自动交付审批、提交、合并或推送。
