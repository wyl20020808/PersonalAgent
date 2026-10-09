# PersonalAgent Project Context V1.1 第二阶段验收报告

日期：2026-10-09。范围：跨模块 Diff、模块说明/核心哈希一致性、契约与决策的正式人工确认。全部演示均明确标记 **Mock**；本会话没有调用真实付费 Claude Code/Codex。真实 Controller、独立验收、审计、Desktop 服务和 Electron 实窗参与验证；Mock Agent 输出不能视为真实双 Agent 内容验收。

状态说明：第 1—13 节保留开发及补充审核当时的现场记录；最新正式提交、本机 dev 集成授权与最终源码验收见第 14 节。历史的“未提交、等待授权”描述不代表本次最新授权状态。

## 1. 开发基线与交付状态

- 开始前实际检查最新 `dev`：`d721e38b97100a43b1545b01cdda411dfd93e074`，与用户提供版本一致。
- 独立分支：`feature/project-context-v11-phase2`。
- 独立 Worktree：`D:\PersonalAgent-worktrees\tasks\project-context-v11-phase2`。
- `main` 保持 `be878bdc5e606a1461ef7085e4b1daa197147084`；`dev` 和 feature HEAD 仍为上述开发基线。
- 已全文读取 AGENTS.md、CLAUDE.md、统一规则和开发治理 V1。沿用第一阶段修订、V0.3E 白色群聊及原有 Run/Delivery/预算机制。
- 源码和报告保留为未提交变更。没有提交、合并、推送或发布；等待用户审核。当前开发会话是 Codex 开发会话，未冒充一次 PersonalAgent 真实双 Agent Run。

## 2. 固定任务基线与范围算法

任务首次 Execute 前，Controller 在当前 Run 的 `context/task-N-baseline.json` 冻结任务 ID、非空有效 moduleIds、完整模块路径映射、已解析知识及信任状态、工作区字节快照和完整性摘要。返工与恢复复用该基线，不重新按候选文档解释原范围。

执行后、独立验收及 Review 前，以工作区字节快照与固定任务快照比较，识别新增、修改、删除；不依赖未暂存 Git diff。因此原生工具写入、Agent 已提交的修改、direct/isolated 和普通文件夹均参与检查。相同字节的删除/新增补充 rename 对；重命名同时改内容仍保留旧路径删除和新路径新增，两端都参与模块判断。

使用冻结映射计算 declaredModules、actualModules、expandedModules、unmappedPaths；多归属文件保留模块集合。`docs/project-context/` 修改单独记为 knowledgeChanges。任务内修改 modules 的 paths 无法隐藏原映射下的越界。每轮检查有独立 UUID 报告路径，记录任务、源快照、当前快照、Diff、模块、契约和问题，旧报告及审计不覆盖。

快照沿用现有文件采集边界：排除 `.git` 和 `node_modules`，最多 20,000 文件、100 MiB。超过现有边界不静默构造完整仓库证明。本阶段没有调用图或长期索引缓存。

## 3. Review 实际取得的追加知识

关联选择使用原声明和实际模块，加一跳 `depends_on` 及反向声明依赖。正式 `Evidence.contextReport` 保留相关模块说明路径、实际文件、检查结果、契约/决策 ID、路径、状态、信任状态及全文。RealAgents 的现有 Review 证据输入包含完整报告；新增测试实际捕获 Review 提示词，验证共享几何契约全文进入输入。

任务开始时的有效原契约与本轮改变后的版本同时保留，不能先改规则再仅按新规则宣布合规。proposed 标记未确认建议；无法验证的历史 terminal 状态标记 unverifiable，不当作 accepted。未对重要契约做静默截断；本实现沿用 stdin 传入现有 Claude Review 提示词。

扩展模块本身不导致失败。pass 须提交扩展理由、未映射路径理由及已核对契约；遗漏必要说明走现有返工。rework/human 沿用原有结论和暂停恢复；没有额外必然付费 Review 调用。

## 4. 文档/核心哈希检查与审查门槛

- 源码变化而模块说明字节不变：`MODULE_DOC_UNCHANGED`。
- checked_files 对当前 SHA-256 不匹配或文件删除：`MODULE_HASH_MISMATCH`。
- 修改后的格式、模块引用、路径或项目身份非法：`CONTEXT_INVALID`。
- terminal 契约/决策没有可信确认：`CONFIRMATION_UNVERIFIABLE`。

比较任务开始状态，标明 preexisting/task 来源。冻结与当前 checked_files 取并集，删掉候选中的核心文件登记不能隐藏检查。非法候选知识仍向 Review 提供冻结导航，便于修复；不会把坏文档当成合法。

正式 Review Schema 在原 pass/rework/human/fail 上增加可选 contextReview：扩展理由、未映射理由、checkedContracts、各 moduleId 的 documentUpdated、noUpdateReason、checkedFiles、constraintsChanged、disposition，以及 confirmationNotes。启用项目存在检查报告时，Controller 核验这些处理意见；声称文档更新须与实际相符，接口/职责约束改变但文档未更新不能通过。仅内部样式调整允许明确说明无需改职责正文。当前任务引入的非法/不可信文档阻止 pass；原先不可访问的历史确认须逐项说明边界，不能被算作 accepted。

检查不自动刷新哈希。Agent 核对后使用既有 `context-stamp`。Review 原生工具改代码后重新执行范围/文档检查及独立验收；human 期间发生原生修改也在暂停前重新验收。旧快照的 PASS 不用于证明新快照。

## 5. 正式 human-decision 接入与摘要

复用现有 Store 审计链、paused 状态、人工决策服务和 Desktop 卡片。新增请求仅存当前 Run `context/confirmations/<UUID>.json`，不是审批数据库；不创建 approvals/ 或新 Run 状态。

正式入口包括 Controller API `prepareContextConfirmation` / `decideContextConfirmation`、CLI `context-request` / `context-pending` / `context-decide` 和 Desktop `contextDecide` IPC。Review 的 contextConfirmations 请求通过既有 human 结论进入 paused。普通 resume 存在未处理请求时保持暂停，不调用 Agent，不默认同意。

请求含项目 ID、规范化目标源目录、当前工作区、文档 ID/类型/相对路径/标题、当前状态、建议动作、全文、内容摘要和 requestHash。Desktop 显示全文与上述字段，使用原人工决策位置及原生确认窗，默认取消；proposed 可显式接受或拒绝，即使选择与 CC 建议相反。批准替代另含已确认同类型后继文档的全文、路径和摘要。

`confirmationDigest` 使用 SHA-256：元数据排序后规范化，排除程序写入的 status 和 user-confirmation basis；正文规范化 BOM/CRLF，保留正文其余空白。其余实质元数据和正文均覆盖，不产生自引用哈希。requestHash 另绑定整个不可变请求。请求准备时预检最终状态/basis 序列化后的格式与行数，避免用户确认后才发现写入超限。

决定时持有 Run/项目锁，仅允许 paused；核验 requestHash、项目、源目录、工作区及当前精确摘要。Controller 写入并验证实际 `human-decision` 后，再核验内容，确定性原子更新 status/basis，并重新解析和验证。basis 引用 `human-decision:<run UUID>:<event hash>`。请求、审计链和此前 context-confirmation-requested 事件必须对应；已取消请求不能复用。

正式确认使 evidence 失效，后续重新 verify；没有批准 Delivery。事件持久化后更新中断可以复用同一请求恢复，无重复决定事件或 Agent 调用。取消保留审计，已持久化正式决定不能伪装取消撤回。

## 6. 可信状态与交付边界

| 文档状态 | 每次加载的处理 |
| --- | --- |
| proposed | 未确认建议，可以提供 Review 参考 |
| accepted | 精确项目、源目录、类型、ID、路径、动作、正文摘要、请求和有效审计链全部匹配才有效 |
| rejected | 同样验证正式拒绝依据；不当作已接受约束 |
| superseded | 验证原替代决定及同类型 accepted 后继，后继路径/ID/摘要必须仍匹配 |
| terminal 依据无效/不可访问 | effectiveStatus 为 unverifiable，明确原因，不凭 basis 字符串推测同意 |

Agent 手写 accepted 或伪造 basis 无法获得可信 accepted；确认后正文改变使旧确认失效。替代保留原审计和来源，改变替代目标也会失效。CLI 无审计 scope 的检查明确报不可验证；提供正确 config/repo 后才能核验本机记录，见 [CLI 证据](validation/phase2/cli-confirmation-proof.json)。

isolated 更新仅发生隔离工作区；仍须原 Delivery 流程应用到目标项目。Delivery Approve 不确认 proposed，契约确认不批准 Delivery。没有跨机器审计同步；换环境缺少原 runtime 时保守报 unverifiable。信任依赖既有本机 Controller 管理的审计存储及 hash chain，不是防御本机管理员重写全部文件的安全沙箱。

## 7. 新增专项与恢复验证

第二阶段 30 项覆盖四种 direct/isolated × Git/非 Git 组合、已提交变更、多归属、增删重命名、game-app 正常范围、冻结 paths 防规避、实际提示词契约注入、pass 理由门槛、文档/哈希/stamp/非法格式、旧哈希归责、Review 原生修改后验收。

确认测试覆盖正式接受、拒绝、取消、替代及后继篡改；普通聊天/resume/Delivery 不接受；正文、项目、文档、basis、源目录复用及审计缺失/损坏；原 accepted 和新 proposal 并存；旧 runtime 不可验证说明；运行锁/非暂停拒绝；确认事件后崩溃恢复；预算、普通暂停恢复保持；最终序列化超限在请求及用户决定前拒绝。

第一阶段 24 项同时通过，未建档项目继续使用旧流程。仅更新第一阶段有关状态的断言以验证可信 terminal 语义，以及启用项目 Mock Review 的正式处理字段，没有删去关键覆盖。

## 8. 回归结果与原始异常

最终 Controller 全量 213/213、Desktop 72/72、Electron 55/55、第一阶段专项 24/24、第二阶段专项 30/30 均通过。原始失败日志保留，下文明确复测边界。

| 验证 | 实际结果 | 证据 |
| --- | --- | --- |
| Controller 全量，最后边界修复前 | 212/212，无跳过 | [日志](validation/phase2/controller-complete.log) |
| Controller 最终全量（含新增第 30 项专项） | 213/213，无跳过，242.17 秒 | [日志](validation/phase2/controller-final-213.log) |
| 第一阶段专项 | 24/24 | [日志](validation/phase2/phase1-complete.log) |
| 第二阶段最终专项 | 30/30 | [日志](validation/phase2/phase2-final-30.log) |
| Desktop 全量 | 72/72，无跳过 | [日志](validation/phase2/desktop-complete.log) |
| Desktop build / check | 均通过；构建有依赖 use client 警告 | [build](validation/phase2/desktop-build-final.log)、[check](validation/phase2/desktop-check-final.log) |
| Electron 第二阶段正式确认/范围实窗 | 7/7 | [JSON](validation/phase2/electron-phase2.json) |
| Electron V0.3E 白色群聊 | 9/9 | [日志](validation/phase2/electron-v03e.log) |
| Electron unified | 14/14 | [日志](validation/phase2/electron-unified.log) |
| Electron 第一阶段建档 | 4/4 | [日志](validation/phase2/electron-phase1-runtime.log) |
| Electron Context 删除 | 4/4 | [日志](validation/phase2/electron-context-deletion.log) |
| Electron legacy flow | 17/17 | [日志](validation/phase2/electron-legacy-flow.log) |
| Electron 合计 | 55/55 | 上述六组，真实 Electron 实窗、Mock 隔离项目 |

root TypeScript 编译和 Schema 导出通过，git diff --check 通过。全量 Controller 使用短路径字节等价副本运行所有原编译测试，未跳过或改写断言；[副本/指纹清单](validation/phase2/short-regression-manifest.json) 记录目录、全部文件及 SHA-256。并发仅用于不同隔离测试夹具，单 Run 调度仍顺序。

原始异常均保留：

1. 首次长路径全量 205 项、202 通过、3 失败：[日志](validation/phase2/controller.log)。其中新 Delivery 测试夹具错误已改为真实 Mock Controller 完成流程；另两项 Windows Git 深路径错误（`$GIT_DIR too big` / fetch-pack invalid index-pack）通过短根目录等价复测，未声称解决 Git 根因。
2. 首次 Desktop 70 项中 1 项在同时高负载回归时未在既有等待内完成：[日志](validation/phase2/desktop.log)。后续新增测试后的完整 72 项通过，未删断言。
3. 首次短根全量运行的 direct-project 测试进程退出 `3221225477 / 0xC0000005`：[原始日志](validation/phase2/controller-final-short.log)。该文件单独复测 [10/10](validation/phase2/direct-project-retest.log)，随后完整 212 项通过。底层原因仍未知，复测成功不是根因修复证明。
4. 用户指出的既有 `0xC0000409` 风险保留，本轮未观察到同码重现；与本轮 `0xC0000005` 区分记录，不开展无关重构。
5. Electron 初始依赖缺少运行时二进制，安装下载未完成。仅在 feature 的 ignored node_modules 使用本机已有同版本 Electron 44.7.0 运行时；原目录只读。Playwright 同样使用本机已有依赖。初期演示脚本选择工作台/重复 Mock 标题的问题已修正为项目群和唯一目标；没有把这些启动/夹具错误当作产品验证通过。

## 9. 明确标记的 Mock 功能演示

可执行脚本：`scripts/demo-project-context-phase2.ts`；实际结果 [mock-demo.json](validation/phase2/mock-demo.json)、[执行日志](validation/phase2/mock-demo-final.log)。夹具 `D:/pa-pc2-demo/d95ef34f`，使用正式 Controller API 和独立验收；真实付费调用数为零。

跨模块 Run `d2c6a7ce-e736-46cd-ae12-7c59fb154310`：

1. Mock CC Plan 声明 combat。
2. Mock Codex 候选实际修改 combat 和 world。
3. Controller 报 declared=[combat]、actual=[combat,world]、expanded=[world]。
4. Review 实际输入含 geometry 契约全文“combat 与 world 必须使用同一世界坐标系；核对跨模块碰撞测试”，及两个模块的 MODULE_DOC_UNCHANGED、MODULE_HASH_MISMATCH。
5. Mock CC 使用既有 rework 要求核对；后续候选核对后盖章，提供合理扩展理由及明确处理意见，原流程完成。

独立确认 Run `cb61d9a2-7d52-4921-8bcd-b3e767aace74`：proposed geometry → human 暂停 → 带全文/摘要的正式请求 → Mock 用户经正式 API 明确接受 → 真实 human-decision hash chain → Controller 原子写 accepted 与 user-confirmation basis → 每次加载验证通过 → resume 后新验收/Review → completed。JSON 保留请求和完整原始审计事件数组，未靠修改状态伪造完成。目标源目录不变，未批准或应用 Delivery。

Electron 另验证建议 accepted 但用户拒绝、建议 rejected 但用户接受，以及原生弹窗默认取消/白色群聊/无横向溢出。截图和完整请求卡片见 [实窗证据索引](validation/phase2/electron-phase2.json)。以下截图来自 Mock 隔离项目：

![正式请求全文](D:/PersonalAgent-validation/project-context-phase2/b6814428/accepted-from-accepted-request.png)

![范围及文档/哈希证据](D:/PersonalAgent-validation/project-context-phase2/b6814428/accepted-from-accepted-scope.png)

## 10. 源码与验证文件清单

新增：`src/context-review.ts`（冻结与确定性报告）、`src/context-trust.ts`（摘要/审计验证）、`src/context-confirmation.ts`（正式请求/决定/恢复）、`test/project-context-phase2.test.ts`、`scripts/demo-project-context-phase2.ts`、`scripts/run-short-controller-regression.mjs`、`desktop/validate-project-context-phase2-electron.mjs`、本报告及 validation/phase2 证据。

修改 Controller：`src/controller.ts`、`src/project-context.ts`、`src/context-navigation.ts`、`src/context-onboarding.ts`、`src/real-agents.ts`、`src/schema.ts`、`src/store.ts`、`src/cli.ts`。

修改 Desktop：`desktop/src/GroupWorkspace.tsx`、`desktop/src/main.ts`、`desktop/src/service.ts`、`desktop/src/types.ts`、`desktop/src/service.test.ts`。沿用原白色群聊组件，没有主题/CSS 重构。

修改回归：`test/project-context.test.ts`。Schema 有实质修改的是 `schemas/review.schema.json`、`schemas/state.schema.json`；build 导出的其他 schema 在 status 中有工作区标记，但 git 内容差异统计为空。没有还原/清理用户原有未跟踪文件。

## 11. 项目、历史与治理保护

结束前再次检查 main/dev/worktree：main 无 tracked 修改，原有未跟踪历史文件保留；dev HEAD 不变。第一阶段及 refinement 工作树不被覆盖。所有新 Run、Delivery 和截图只来自独立 disposable Mock 夹具；FPSArena、OpenWorld、认证、原项目 Context、历史 Run/Delivery 和运行数据未由本会话修改或清理。依赖安装/构建与验证产物限 feature 工作区及独立验证根。

没有扩大真实调用预算、改模型/权限、发布 main、整合 dev 或创建新 launcher。所有 Mock 审计同意仅对应 Mock 文档，不能作为本功能正式交付的用户审批。

## 12. 剩余风险与后续接口

尚未解决 Windows Git 长路径和偶发底层 Node/CLI 异常根因；保留全部日志和等价复测。没有跨机器审计迁移服务；没有运行真实付费模型，故本报告证明确定性逻辑和 Mock 接入，不证明真实模型的内容判断质量。大仓库依然受原快照数量/容量边界约束。

已形成按任务的基线、快照、实际 Diff、关联知识和结构化 Review 报告，可作为后续阶段接口。本阶段没有文件读取审计、Token 统计、向量数据库、知识图谱、语义检索、调用图、Windows MCP 或新的长期记忆架构。

交付停止在独立 feature 分支，等待用户审核；不自行提交或合并。

## 13. 主体审核后的针对性补充：原生 Plan 写入边界

用户于主体审核通过后要求只检查这一项；本次没有重新审计整个阶段。

核查发现真实遗漏：`agentOperation` 原本保存 Plan 前后快照和完整 `agent-finish` Diff，但未据此阻止进入 Execute。任务范围基线首次 Execute 才冻结，Plan 修改 world、只声明 combat、Execute 不再修改 world 时，修改已成为范围起点。修复前负向测试四种组合均未满足规划拦截断言，见 [原始失败日志](validation/phase2/plan-boundary-before.log)。普通文件夹实际进入 completed；Git 提交候选被既有独立验收的 HEAD 规则拦截，但仍没有得到正确规划范围处理。

最小修复仅涉及 `src/context-review.ts`、`src/controller.ts` 和新增负向测试：

- `assertPlanningContext` 在已启用项目首次 Plan 前保存当前 Run 的 `context/planning-baseline.json`，摘要核验后比较非 `docs/project-context/` 文件的字节及存在性。新增、删除、改名两端、已提交内容均可发现；不使用未暂存 Git diff。
- Controller 在 Plan 调用前和 `agentOperation` 的 finally 中检查。业务文件发生变化时，追加正式 `context-planning-change` 事件（路径及前后摘要），使用既有 supervisor/paused 和 planning 恢复位置；不派发 Execute 或 Review，不冻结任务范围基线。
- 未处理修改保留现场与完整原生 Plan 审计。恢复仍复用最初规划基线，普通“继续”不能洗掉差异；恢复业务文件后允许继续规划。知识文档补充仍允许，建档 Run 继续沿用原 scope 保护；未启用项目保持旧流程。原生工具权限、模型、预算和状态机未改变。

源码入口：[规划检查](src/context-review.ts:11)、[Plan 前检查](src/controller.ts:139)、[Plan 结束检查](src/controller.ts:78)；测试：[四种组合负向测试](test/project-context-phase2.test.ts:47)。测试 Mock Plan 原生写 world 并仅声明 combat，Execute 实现明确不改 world；断言暂停、world 路径、Plan 原生完整 Diff、Execute/Review 调用为零、任务基线不存在；再次普通恢复仍暂停且不调用 Plan。还验证隔离源保护、恢复业务文件后可继续及知识文档原生补充不被阻止。Git 组合包含实际 Mock 提交，恢复字节后既有禁止 HEAD 改变规则仍有效，没有修改该规则。

本次构建通过；两阶段专项合计 **58/58**（第一阶段 24，第二阶段由 30 增至 34），无跳过：[最终专项日志](validation/phase2/plan-boundary-context-final.log)。相关 Controller/原生工具/恢复回归 **55/55**、无跳过，见 [日志](validation/phase2/plan-related-regression.log) 和 [短路径副本及指纹](validation/phase2/plan-related-manifest.json)。中间修复验证日志保留：[日志](validation/phase2/plan-boundary-context-regression.log)；其中首次补丁缺少 context 目录创建，已修复并通过上述最终专项。

第 8 节完整 213/72/55 回归数字属于主体审核时的原版本证据，不能替代此次修复验证；本次按用户要求不重复全阶段回归、不运行 Electron，不调用真实付费 Agent。main/dev/feature HEAD 均保持原记录，无提交、合并或推送，等待正式集成授权。

## 14. 正式提交与本机 dev 集成授权：最终源码验收

用户已明确批准第二阶段主体和 Plan 原生写入保护，并在当前会话授权整理提交 feature、合入本机 dev。这次正式操作直接依据该真实用户授权，不使用 Mock 文档确认事件冒充软件交付批准。授权仅限本机 dev，不包含远程 push 或发布 main。

操作前重查 feature/dev HEAD 均为 `d721e38b97100a43b1545b01cdda411dfd93e074`，main 为 `be878bdc5e606a1461ef7085e4b1daa197147084`。dev 无 tracked 或 staged 修改，仅有原 `desktop/validation-v03e/` 未跟踪数据（16 文件）；已留存逐文件 SHA-256。未发现关联 dev 的运行进程。完整 Worktree 和 Git 状态记录存于 feature 的 `validation/phase2/integration/`，保留所有原未跟踪文件。

在包括 Plan 固定快照保护的最终实际源码上完成一次验证：

| 本次提交前检查 | 实际结果 | 本机证据（不纳入 Git 提交） |
| --- | --- | --- |
| Controller TypeScript 构建 / Schema 导出 | 通过 | `integration/feature-controller-build.log` |
| Controller 全量回归 | **217/217**，无跳过，281.07 秒 | `integration/feature-controller-full.log` |
| Desktop build / check | 均通过；原依赖 use client 构建警告仍在 | `integration/feature-desktop-build.log`、`integration/feature-desktop-check.log` |
| Desktop 全量测试 | **72/72**，无跳过 | `integration/feature-desktop-test.log` |
| Electron 正式确认实窗 | **7/7** | `integration/feature-electron-confirmation.json` |
| Electron 暂停恢复、返工、停止与旧流程实窗 | **17/17** | `integration/feature-electron-recovery.json` |

Controller 全量使用已记录的短路径字节等价副本，未改断言或跳过覆盖；清单为 `integration/feature-full-manifest.json`。217 项包含第二阶段 34 项及第一阶段 24 项；Plan 原生写 world、任务仅声明 combat、Execute 不再改 world 的四种组合全部通过，未处理变化和普通恢复均在 Execute 前被拦截。该保护与三个核心功能完整保留。

本轮以上命令均首次通过，未出现新的 `0xC0000409`、`0xC0000005` 或 Git 深路径失败；原有底层风险没有因此被宣称已修复。所有 Agent 行为仍为 Mock，真实付费调用为零。仅验证新建隔离夹具，未改 FPSArena、OpenWorld 或其 Context/历史 Run/Delivery。

明确暂存清单包含 24 文件：第 10 节的 16 个有实质差异的既有文件、3 个新增核心模块、第二阶段专项测试、2 个必要 scripts、第二阶段 Electron 验证脚本和本报告。排除所有 validation 日志、截图、Mock runtime、缓存、凭据及临时产物；不使用 `git add -A`。源码哈希在测试结束后复核保持一致。

按用户授权使用提交说明 `feat: add Project Context V1.1 phase 2`；集成前再次核验 dev 原基线、tracked/index 无修改、无运行冲突及祖先关系，以 `git merge --ff-only` 整合。合入后验证 dev 构建、第二阶段专项、恢复与正式确认路径，核对 dev 与已验收 feature Git tree 相同。本报告记录提交前验收；实际提交 SHA、快进结果及合入后结果另存本机 `validation/phase2/integration/DEV_MERGE_REPORT.md`，避免将包含自身 SHA 的报告写入同一提交产生循环。

不改 main、不 push、不发布、不启动第三阶段，不清理历史或未跟踪数据；完成本次授权操作后停止。
