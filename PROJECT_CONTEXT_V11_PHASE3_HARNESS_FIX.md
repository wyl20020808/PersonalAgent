# 第三阶段 T2 执行脚本误判修复

2026-10-09。工作分支 `feature/project-context-v11-phase3`；不提交、不合并、不 push。本次仅修复测试执行脚本，未新增付费调用，未创建或恢复真实 Run。

## 根因与最小变更

旧 `validation/phase3/run-real-fixed-review-repair.mjs` 每次 Review 前都要求 `expandedModules` 包含 world。CC 原生修复把 world 恢复成任务冻结基线后，Controller 重新独立验收成功，实际 Diff 已无 world，返回空扩大范围是正确结果。脚本在第二次正式 Review 调用前自行抛出 `Cross-module Review contract missing`，造成真实 T2 failed。

新增 `scripts/context-regression-review.ts`，由脚本调用阶段断言并单独审计 `regression-review-stage`。读取 Controller 的任务冻结基线，按 world 模块真实路径映射比较前后文件集合及 base64 字节，涵盖新增、删除和修改；不是只检查单位，也不是对照修复前的错误候选。

- 错误候选阶段：world 必须实际变化、扩大范围包含 world，且独立测试已经失败。
- 修复后：world 逐字节恢复则允许空扩大范围；仍有任意实际差异则继续要求 world 扩大。
- 两阶段均要求与冻结任务基线内容完全一致的 geometry 契约全文、路径及来源；截断文本不能通过。Context Report 必须对应当前快照和冻结基线。
- 正式 Controller 独立验收、Review 回执、契约可信状态、预算、隔离及恢复逻辑未修改。脚本只决定是否派发 Review，不新增通过通道；最终 PASS 仍要求 completed、独立验收 passed、源目录不变及无异常。

执行脚本优先使用本次新验收清单，旧验收清单保留。新 T2/T3 调度与付费授权另行办理，不能把旧三任务授权配置直接当作新授权。

## 确定性证据

新增 `test/context-regression-review.test.ts` 四项正式 Controller Mock 回归，明确标记为无付费测试：

1. world 完全恢复：第二轮为空扩大范围，完成两次独立验收和两次正式 Review，最终 completed。
2. world 仍有有效业务但保留注释差异：要求 world 扩大、完整 geometry；模拟漏报扩大及截断契约均拒绝。
3. world 已恢复但 geometry 契约丢失：阻断第二次 Review，不能 completed。
4. 修复后独立验收仍失败：即使 Review 返回 pass，Controller 正式否决，不完成且不增加返工。

构建通过；新增四项及原 Review 协议七项专项 **11/11 PASS**。日志：`validation/phase3/harness-fix/build.log`、`specialized.log`。执行脚本 `node --check` 通过。

Controller 全量 **242/242 PASS**，失败、取消、跳过均为 0，耗时 485078 ms；覆盖正式审查、预算、隔离、暂停/恢复及原生执行机制。日志 `validation/phase3/controller-short-1791543295818.log`；测试清单 `validation/phase3/short-manifest-1791543295818.json`；新验收清单 `validation/phase3/harness-fix/acceptance.json`。已核对短路径副本与当前 src/test/dist/scripts 的全部文件哈希一致。

采用已有短路径等价方式，源码、编译测试及断言逐字复制，不跳过断言；原 Windows 长路径失败日志保留。本次未改 Desktop/Electron 运行源码或协议，沿用已验收 Desktop 72/72、Electron 24/24 和 build/check 证据，不将它们描述为本次重新运行。未观察到新的 0xC0000409 / 0xC0000005 异常。

## 历史保全与真实结论

修复前、全量通过后，均核对第一批 117 个、第二批 188 个历史证据文件 SHA-256，一致。历史清单及原脚本副本记录在 `validation/phase3/harness-fix/history-before.json`、`history-after.json`、`runner-before.mjs`。

T1 Run `ea0ecbe2-1326-44cc-a606-e04766f92435` 的正式真实 PASS 保留，不重复。T2 Run `70715ce4-6abf-4e1e-bc8c-81904d3fe2a5` 仍为 failed，原始审计、test-injected 来源、原生输出、实际 Token 及失败原因全部保留。第一批失败 T1 同样保持原状态。旧真实最终报告不覆盖、不补写 PASS。

本次新增真实 CC/Codex 调用 **0/0**。历史两批合计仍为 CC **6**、Codex **3**；确定性测试中的 Mock 调用不计入真实用量，不作为真实 Token。修复的确定性 PASS 不代表新的 T2/T3 真实验收已通过。

下一步方案见 `PROJECT_CONTEXT_V11_PHASE3_T2_T3_REAL_REGRESSION_PLAN.md`：仅新 T2/T3，预计 CC 5、Codex 3，提议上限 CC 7、Codex 3，仅 T2 一次 Execute 纠正返工。当前尚未获得新付费授权，停在 feature，等待明确授权。

结论：本次测试脚本修复及确定性验收 **PASS**；第三阶段完整真实验证仍为 **PARTIAL（T1 PASS，历史 T2 FAIL，T3 未运行）**，须等待新的 T2/T3 真实证据。
