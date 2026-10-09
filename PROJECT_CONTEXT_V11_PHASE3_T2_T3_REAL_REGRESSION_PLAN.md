# 第三阶段剩余 T2/T3 真实验证方案

2026-10-09。状态：待明确付费授权；本次未创建新的真实 Run、未调用付费 Agent。

## 既有结果与本批范围

保留 `D:/pa-pc3-real/20261009-c67e41d2` 的原始结果。T1 Run `ea0ecbe2-1326-44cc-a606-e04766f92435` 正式 PASS，不重新执行。T2 Run `70715ce4-6abf-4e1e-bc8c-81904d3fe2a5` 保持 failed，不恢复、不补写 PASS。T3 尚无真实 Run。

新批只包含 T2、T3，各一个新的隔离真实 Run；沿用原预算单、固定需求、种子及外部独立验收程序。不得用历史失败 Run 或确定性 Mock 替代新验收。

## 提议调用预算（尚未授权）

| 任务 | 预计 CC | 预计 Codex | CC 上限 | Codex 上限 | Execute 返工上限 |
|---|---:|---:|---:|---:|---:|
| T2 | 3 | 2 | 4 | 2 | 1 |
| T3 | 2 | 1 | 3 | 1 | 0 |
| 合计 | **5** | **3** | **7** | **3** | 仅 T2 一次 |

CC 在原生 Review 内直接修复时，T2 可能只用一次 Codex Execute；不为达到预计次数增加调用。预计 CC 包含 Plan 和 Review，预留只用于同一 Run 的必要重审；不是新增 Run 授权。任何超过上限、额外 Run 或未授权返工均停止。金额、Token 和成本节约不作估算。

历史两批已用 CC 6 次、Codex 3 次（第一批 2/1；第二批 4/2），单独保留，不抵扣、不清零。新授权仍须遵守适用的既有全局预算，不能通过新账本绕过。

## 隔离与启动前检查

授权后采用全新 `D:/pa-pc3-real/<新批次>/T2`、`T3`，各自 `s` 源目录、`r` 独立 runtime 和正式隔离工作区；目录存在则拒绝覆盖。使用当前 feature 的已验收构建、原生 Claude Code、Codex SDK、正式 createRun/drive 和 Controller 调度。默认模型、认证及工具权限保持原设置。

启动前核对构建与全量测试指纹、固定需求/seedHash、外部验收脚本哈希、任务调用上限、适用全局预算和历史证据哈希。旧执行脚本的三任务顺序及旧授权文本不能直接当作新 T2/T3 授权；新调度只选择 T2/T3，历史 T1 PASS 作为只读前置证据，不能生成虚假的新 T1 result。

## 顺序与验收

1. T2：一个 combat 计划任务。真实 Codex 首次输出与 Diff 先归档，再注入 reach=4、world.unit=cm，独立记录 `test-injected`、`autonomousModelError=false`。错误候选必须独立验收失败、识别 world 扩大，并向 CC 提供任务冻结的完整 geometry 契约。最多一次纠正；CC 原生小修由 Controller 重新独立验收。修复后逐字节比较整个 world 模块与任务基线：恢复则允许 expandedModules 为空；仍有差异则必须识别 world 扩大。完整 geometry 契约两种情况下均保留。最终独立验收和正式 CC Review 必须完成；仅测试脚本放行不算 PASS。
2. 保存 T2 的状态、调用、原始证据、失败/修复与正式验收后，只有 PASS 才启动 T3。预置错误的预期拒绝不算最终批次失败；纠正、审计或安全检查不能完成则停止。
3. T3：全新 Git main/dev 固定夹具，一个目标 dev Run。main reach=2、dev reach=5，保存不同 HEAD 与只读 main 快照，明确 dev 当前版本。检查过期 checked_files，现场读取实际源码并更新文档及哈希；业务源码保持逐字节一致。不把旧 manifest 当索引，不额外运行 main。

每次调用记录 Prompt UTF-8 字节、supplied、confirmed-read、Shell 原始命令/事件、真实输入/输出/缓存 Token、次数、返工、耗时和数据完整性。Shell 不计入 confirmed-read；未报告的模型、内部请求数和 Token 字段保留 null/unknown。非阻断观测缺失可标 PARTIAL，不增加调用补统计。

## 停止与工程边界

关键约束或版本引用错误无法在授权范围内纠正、正式 Review 无法解释地否决、范围扩大失控、预算/隔离/审计异常、原生认证或恢复阻断时立即保存证据并停止。Windows 长路径及底层异常保留原始记录。

不自动批准或应用 Delivery，不升级 proposed 契约，不修改真实游戏项目，不提交、合并、push 或发布 dev/main。完成新验证后单独报告 PASS/PARTIAL/FAIL；历史报告及失败记录不覆盖。
