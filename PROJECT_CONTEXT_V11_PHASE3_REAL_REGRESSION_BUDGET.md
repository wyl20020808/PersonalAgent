# Project Context V1.1 第三阶段真实回归预算单

状态：**待用户明确授权，尚未执行。** 编制日期：2026-10-09。确定性验收已完成：Controller 231/231、Desktop 72/72、Electron 32/32。所有既有 Mock Token 和模型名称均为测试注入，不作为真实模型 Token 预算或费用预测。

## 1. 三项预算

每个固定任务只启动一个新的正式真实 Run。CC 内部多次模型请求不等于多次 Controller 调用；下表上限对应当前 Controller 的 `maxClaudeCalls`、`maxLoops`、`maxReworks`。金额和真实 Token 不作未经实测的估算。

| 任务 | 预计 CC Plan | 预计 CC Review | 预计 Codex Execute | CC 上限 | Codex 上限 | 返工上限 | 预留范围 |
|---|---:|---:|---:|---:|---:|---:|---|
| T1 HUD 局部修改 | 1 | 1 | 1 | 3 | 1 | 0 | 仅预留一次 CC 在小修后重审；需要额外 Execute 就暂停 |
| T2 跨模块错误候选 | 1 | 2 | 2 | 4 | 2 | 1 | 一次预置候选纠正；额外一次 CC 小修后重审；没有第二次返工预算 |
| T3 分支/过期知识 | 1 | 1 | 1 | 3 | 1 | 0 | 仅预留一次 CC 在文档小修后重审；需要额外 Execute 就暂停 |
| 合计 | 3 | 4 | 4 | **10** | **4** | T2 一次 | 预计 **CC 7 / Codex 4**；授权上限 **CC 10 / Codex 4** |

7/4 与历史粗估相同，但本次依据实际固定夹具和 Controller 流程重新核对：T1/T3 各 Plan、Execute、Review 一次；T2 增加一次纠正 Execute 和 Review。CC 可以在原生 Review 中直接修复小问题；发生审查修改时 Controller 会重新独立验收并可能再调用 Review，因此额外预留只用于同一 Run 的重审。用量和次数按实际发生记录；如果 T2 被 Review 直接修正，不为了凑预计次数再派发 Codex。

这里没有授权第四个真实 Run，也没有授权整个任务失败后自动从头重跑、恢复到新的 Run 清空预算、提高 maxLoops/maxClaudeCalls 或发布/合并成果。预计次数不是必须花完的次数。

## 2. 固定初始条件

真实运行必须重新创建隔离夹具，不能继续本次 Mock 的 Session、Claude session_id、Codex thread_id 或带有修正结果的工作区。

- 目录：新的 `D:\pa-pc3-real\<授权批次>\T1|T2|T3`，既有目录拒绝覆盖；Runtime 在各源码目录外，正式执行为 `projectMode=isolated`、`executionMode=native`、`mode=real`。
- 初始源码和知识来自 `scripts/context-regression-fixtures.ts` 的固定内容，记录 seedHash、需求、外部可信验收脚本哈希、Git HEAD/文件快照和源码工作区。
- T1 使用 main 条件：HUD 12px/4px，HP 文字函数不变，combat reach=2，world wallX=10、单位 m。独立验收必须核对样式结果与其他业务文件的逐字一致性。
- T2 使用相同 main 条件，需求为 reach=3、共享坐标单位 m 和 wallX=10。计划只允许一个 combat 任务，实际影响 world 由 Diff 和 Context Report 判断；共享几何契约全文必须进入 Review evidence。
- T3 只启动一个真实 Run，目标为固定 dev 条件（reach=5），其模块说明及 checked_files 保持 main=2 的过期值；同项目 main=2 版本作为独立只读比较条件保存，不再启动第二个真实 main Run。确定性阶段已经分别覆盖两个分支。目标 dev 的业务源码必须保持原样，只允许现场核对后修正文档和盖章；不得把 main=2 错套到 dev。
- 基于现场源目录构建新的正式配置后创建 Run；不能把已完成的 Mock State 改成 real 冒充新的真实调用。固定夹具创建和版本种子是准备工作，不代表真实模型分析。
- 使用机器原有认证、默认模型和原生工具，不复制凭据、不调整模型、权限、安全模式、MCP 或计费渠道。原有授权全局账本如适用继续生效，不得另开账本绕过已有账户额度。

## 3. T2 预置错误候选的来源处理

真实 Codex 第一轮 Execute 返回后，先保存其原生结果、实际 Diff、文件哈希和原生事件证据，再将明确标记的固定错误候选注入新隔离工作区：combat reach=4、world.unit=cm。测试注入不是模型自主行为。

注入动作必须单独审计，记录 `origin=test-injected-wrong-candidate`、`autonomousModelError=false`、受影响文件、前后哈希和候选 Diff。随后交回原 Controller Verify/Review 流程，不新增绕过独立验收的 pass 通道。原模型输出和测试覆盖层同时保留。

固定独立断言必须失败，expandedModules 必须包含 world，Review 必须收到完整共享几何契约。Review 可以 rework、人工作出决策，或在自身原生调用内修复后由 Controller 重新验收；未修正的候选不得完成任务。若需要 Codex 纠正，只使用同一 Run 已授权的第二次 Execute 和一次返工。

若真实模型在看到全文和独立失败后仍忽略约束，应记录模型失败或 Review 错误；不能将注入来源改为“Codex 自主犯错”，也不能修改验收程序使其通过。

## 4. 正式执行与停止条件

授权后依次执行 T1、T2、T3，使用当前正式 createRun/drive、RealAgents 和预算机制；同一 Run 内 CC/Codex 顺序运行。每个任务只有一个正式计划任务；真实 Plan 拆成额外任务、选择无关模块、越过范围或需要重大变更时，在 Execute 前停止并记录偏离，而不是自行增加预算。

使用各任务外部可信验收程序。每轮先由 Controller 验证最终内容和任务 Diff，再由 CC Review；Review 修改后再次独立验证。文档 proposed 状态保持为 proposed，知识文档交付不自动接受契约/决策。

停止或暂停条件包括：

1. 预算、返工、原有全局额度到达上限。
2. 未满足关键约束、引用错误版本、修改无关业务文件，或计划超出固定任务范围。
3. 原生调用认证失败、服务中断、超时、输出无法校验、路径/审计异常。
4. 需要新的人工确认、重大架构变更、额外 Execute 或新的任务重跑。
5. 读取/用量协议缺失导致关键指标无法确认：按不可观测或不完整判定，不用估算值补齐。

有限的 T2 纠正只能在已授权原 Run 的一次返工内进行。任务最终通过即停止，不自动重复。暂停保留同一 Session/Run 和真实已消耗次数；只有另行明确授权才能恢复或追加预算。不得自动 Approve/Apply、提交、整合 dev、发布 main 或推送远程。

## 5. 真实指标与判定

每次调用使用当前工程新增的 Manifest、reads、usage 和原审计；另外保存正式计划、模型实际 Diff、测试预置 Diff、CC Review、外部独立断言及整体耗时。

关键指标分别记录：最终关键约束违反/遗漏数量，错误版本引用数量，上下文遗漏/错误导致的返工次数，测试预置候选导致的纠正次数，Controller 调用数，可识别原生模型请求数，协议报告的输入/输出/缓存 Token，confirmed-read、supplied、Shell 事件和观测完整性。

必须从计划、实际源码行为、最终 Diff、Review 和独立断言共同判定；提到契约 ID 本身不算理解或遵守。真实流程没有满足预期，就如实记录 FAIL/暂停/不可观测，不用 Mock 结果替代，不改断言，不重复抽取“好的一次”覆盖失败。

所有 null 保持未知。Claude 恢复调用排除含历史的累计统计；Codex 模型和内部请求数在当前 SDK 协议中仍可能未知。最终结果不自动计算金额，不设置固定 Token 节约比例，不能与范围不一致的 FPSArena 历史任务作严格成本比较。

## 6. 授权门槛

请用户针对本预算单明确授权：**固定 T1/T2/T3 每项一个正式真实 Run；合计最多 CC 10 次、Codex 4 次；T2 最多一次纠正返工；超出上述条件停止，不自动增加预算。**

可以分别授权任务；未授权的任务不能启动。如果用户只授权预计 7/4 而未授权上限 10/4，必须将实际配置按较小授权设置，不能默认使用重审预留。本预算单的生成和展示不构成授权。
