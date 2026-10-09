# Project Context V1.1 第一阶段验证记录

验证日期：2026-10-09。实施依据：`D:/Download/PERSONALAGENT_PROJECT_CONTEXT_V11_PHASE1_PROMPT.md`，仅执行已经批准的第一阶段。当前开发会话直接实施；没有制造 PersonalAgent 自我开发 Run 或真实 CC 审查记录。

## 1. 完成状态分别记录

| 项目 | 状态 |
| --- | --- |
| 第一阶段实现及确定性验收 | 完成：Controller 174/174、Desktop 70/70、Electron 57/57 |
| FPSArena 第一次真实建档 | 已按独立授权完成唯一真实 Run：CC 2、Codex 1、返工 0，Controller 通过，CC verdict=pass |
| FPSArena 文档交付与目标启用 | 已生成正式 Delivery Preview，未批准、未应用，源项目尚未启用 |

契约和决策始终按 `proposed` 加载。确认绑定、approvals 目录、强制模块边界、Hash 失效归责属于第二阶段；原生读取和 token 使用统计属于第三阶段，本次没有实现。

## 2. Git 基线与原现场保护

用户明确批准的治理回退提交已存在，且再次核对仅包含三份文件：AGENTS.md、CLAUDE.md、docs/PERSONALAGENT_DEVELOPMENT_GOVERNANCE_V1.md。

- Commit：`be878bdc5e606a1461ef7085e4b1daa197147084`。
- 提交说明：`docs: preserve PersonalAgent development governance V1`。
- Git tree：`1f57d67b7d1f292da68ddf6c96221bedc18f46a4`。
- 父提交：`0e213eb1d6624f708ea36c2b014a8fa53a74b5b2`。
- 原始文件、暂存清单、敏感内容核查及排除清单证据：`D:/PersonalAgent-backups/project-context-v11-governance-20261009-0649c9ad-a706-400e-add9-91f0f143bd60/`。

| 分支 | Worktree | HEAD | 状态 |
| --- | --- | --- | --- |
| main | D:/PersonalAgent | be878bdc5e606a1461ef7085e4b1daa197147084 | 已跟踪文件干净，暂存为空；5466 个未跟踪 Git 条目逐项与备份排除清单相同 |
| dev | D:/PersonalAgent-worktrees/dev | be878bdc5e606a1461ef7085e4b1daa197147084 | 干净；仅建立 Git 基础，未建立第二套运行环境 |
| feature/project-context-v11-phase1 | D:/PersonalAgent-worktrees/tasks/project-context-v11-phase1 | be878bdc5e606a1461ef7085e4b1daa197147084 | 第一阶段改动未暂存、未提交 |

main/dev 初始 HEAD 和 Git tree 完全一致。133 个跟踪文件内容等价；38 个文件因 Git checkout 的 LF/CRLF 策略存在磁盘原始字节差异，不能将其表述为逐字节完全相同。源码语义未变。

全部源码修改、构建和依赖安装仅发生在 feature Worktree。没有切换原目录分支、回退代码、reset --hard、强制覆盖、清理、push、整合 dev 或发布 main。已有历史项目、运行数据、备份、Worktree 均保留。

## 3. 实现范围与拟交付文件

| 文件 | 实际作用 |
| --- | --- |
| src/project-context.ts（新增） | 四类文档解析、固定字段/章节/长度/引用校验、安全路径、actual-bytes SHA256 原子盖章 |
| src/context-navigation.ts（新增） | 每次现场解析、直接关联及一跳依赖导航、有界目录/文件树、每次 manifest 和实际装配收据 |
| src/context-onboarding.ts（新增） | 建档隔离要求及三角色调用后的 docs-only 产物检查；新流程启用锁存 |
| src/real-agents.ts | Plan/Execute/Review 实际调用入口接入轻量导航，保留原生工具、模型默认值和 Review 验收证据 |
| src/controller.ts、src/workspace.ts | 现有 Run 增加 purpose，强制 isolated 建档，原顺序调度、恢复、预算、独立验收继续使用 |
| src/delivery.ts | 建档完成证明接入现有预览/批准/应用检查，无第二套审批或 UI |
| src/cli.ts | context-start、context-check、独立 context-stamp 命令 |
| src/adapters.ts | 明确标注的本地 Mock 建档夹具，使用正式 Controller 与程序盖章 |
| src/schema.ts、src/store.ts | 可选 task.moduleIds、Run purpose/projectContextEnabled；旧配置及状态继续兼容 |
| schemas/plan.schema.json、schemas/state.schema.json | 对应源码自动导出 Schema |
| package.json、package-lock.json | 精确增加 yaml 2.9.1；沿用已有依赖 |
| test/project-context.test.ts（新增） | 15 项有真实失败条件的解析、盖章、原生装配、隔离和交付测试 |
| desktop/validate-project-context-electron.mjs（新增） | 当前 Electron 现有建档交付流程验证，明确标注 Mock 原生对话框替身 |
| 本记录、FPSARENA_CONTEXT_ONBOARDING_EXECUTION_REQUEST.md（新增） | 验收证据与真实执行前可审阅的调用方案 |

上述为拟交付清单，不表示已经正式提交或交付。排除 node_modules、dist、desktop/out、缓存、临时文件、.validation、desktop/validation-v03e 的日志/截图/结果以及所有本地夹具；保留这些证据和数据，不批量 git add。其余生成 Schema 仅恢复 checkout 换行约定，无语义差异。

## 4. 文档与 CLI 契约

约定目录：`docs/project-context/overview.md`、`modules/<id>.md`、`contracts/<id>.md`、`decisions/<id>.md`。

| 类型 | 全文行数上限 | YAML 字段 | 固定章节 |
| --- | --- | --- | --- |
| overview | 60 | schema: 1、kind、project_id UUID、name | 项目目标、范围、非目标、总体结构 |
| module | 100 | schema: 1、kind、id、name、paths、depends_on、checked_files | 职责、边界、入口与测试 |
| contract | 80 | schema: 1、kind、id、title、modules、status: proposed、basis；可选 supersedes | 约束、检查方式 |
| decision | 80 | 同 contract；kind: decision | 决定、原因、未采用方案 |

每行最多 300 字符，frontmatter 和空行计入总行数。模块 paths 使用精确相对文件或 `/` 结尾目录前缀，不使用 glob；depends_on 仅直接模块 ID。checked_files 最多 20 项，不由模型编造。basis 使用 `{kind,ref}` 或其列表，code/test/document 引用须真实存在；没有生成虚假用户确认。

有效 overview 是唯一启用条件。普通未建档项目保留旧流程；文档损坏明确报错；Run 一旦进入新流程，后续 overview 缺失也报错，不静默降级。

```powershell
node D:/PersonalAgent-worktrees/tasks/project-context-v11-phase1/dist/src/cli.js context-check --workspace D:/TARGET
node D:/PersonalAgent-worktrees/tasks/project-context-v11-phase1/dist/src/cli.js context-stamp --workspace D:/TARGET --module core --file src/core/main.ts --file src/core/second.ts
```

context-stamp 不需要 --config；先验证全部参数、模块归属和文件安全性，再用真实字节计算 SHA256，只更新 checked_files。保留其他字段、引号、注释、BOM、正文与换行；原子替换前校验完整候选文档及原文件未被并发修改。缺失文件、非成员、重复参数、越界路径、链接、超过 20 项或盖章后超长等失败不会部分更新。

Hash 在第一阶段只做程序盖章和格式校验；没有实现后续代码变更的自动失效或契约确认机制。

## 5. 三处原生提示词的实际变化

| 调用 | 原实际行为 | 本次新流程行为 |
| --- | --- | --- |
| CC Plan | repositoryContext 自动装入文件内容包 | 用户目标、overview、现场模块目录、受限文件树、工作目录/版本、可信测试与任务阶段 |
| Codex Execute | repositoryContext 自动装入文件内容包 | 当前任务与验收、overview、任务模块/相关提议的实际路径、必要失败反馈与证据 |
| CC Review | 原本已无独立 repository 内容包，使用 reviewEvidence | 保留任务、前置、原始 Diff、测试输出/退出码和安全 issues，增加现场相关文档路径及修改文件信息 |

真实 RealAgents.plan/execute/review 函数被调用，底层传输使用明确标注的本地替身，不访问付费服务。测试覆盖已有 Claude/Codex 会话恢复、native/proposal 兼容分支；三处新提示词均不含夹具源码标记，Review 独立失败证据完整保留。普通未建档项目仍验证自动源码包的旧行为。

实际装配样本位于 `.validation/project-context-v11/prompt-samples/`：Plan 4075 bytes、Execute 4688 bytes、Review 4178 bytes（本地夹具，不是费用或真实用量统计）。每份收据包含实际完整装配 JSON 及 hash/bytes，完整现场目录、文档 hash/bytes、选择原因、目标工作区和版本。

每次调用重新解析，不建缓存索引。Plan 自动目录最多 100 项，文件树最多 3 层/300 节点，自动导航最多 24 KiB UTF-8；省略项数量和原因显式记录，完整目录仍留 manifest。只附路径的文档单独作为文档库存记录，不谎称全文已注入或已读取。manifest 不能证明 Agent 已读取或理解；没有读取审计和 token 统计。

## 6. 测试与原有回归

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| Controller 初始基线 | 159 项，157 通过，2 项 Windows Git 长路径失败 | .validation/project-context-v11/baseline-controller.log |
| Desktop 初始基线 | 70/70 | .validation/project-context-v11/baseline-desktop.log |
| 第一阶段专项 | 15/15；最终全量继续覆盖 | test/project-context.test.ts、.validation/project-context-v11/context-tests.log |
| Controller 首轮全量 | 174/174 | .validation/project-context-v11/final-controller-before-stamp-validation.log |
| Controller 最终全量 | 174/174，无跳过，耗时 245610 ms | .validation/project-context-v11/final-controller.log |
| Desktop check/build/test | 70/70 | .validation/project-context-v11/final-desktop.log |
| Electron V0.3E 会话/UI/预算/缩放 | 9/9 | desktop/validation-v03e/latest-electron.json |
| Electron unified | 14/14 | desktop/validation-v03e/validate-unified-electron.mjs.log |
| Electron legacy-flow | 17/17 | desktop/validation-v03e/validate-legacy-flow-electron.mjs.log |
| Electron legacy | 13/13 | desktop/validation-v03e/validate-legacy-electron.mjs.log |
| Electron 建档流程专项 | 4/4，Renderer 错误 0，真实调用 0 | .validation/project-context-v11/electron-onboarding.json |

没有删除断言、跳过失败或削弱验收。初始两项失败来自任务长路径加 UUID 夹具的 Git 环境限制；全量测试使用新建短 D 盘目录 `D:/pv11-29652e`，dist/node_modules 指向任务构建，保持原测试与断言。最终小修复补强了候选文档验证与 BOM 保留，此后专项 Electron 和 Controller 全量均重跑通过。其余 Electron 回归及 Desktop 单测在此前构建执行，最后修改只涉及盖章的候选文档校验与 BOM 保留，专项/全量继续覆盖该最终源码；没有把未执行的真实模型审查写成 PASS。

拟交付 19 个文件，暂存为空；逐项核查未发现密钥或认证凭据。文件清单及内容 SHA256：`.validation/project-context-v11/change-manifest.json`。Git 状态复核：`.validation/project-context-v11/git-final.json`。

Electron 使用当前任务构建及同版本 Electron 44.7.0 二进制；复用原目录验证依赖和二进制只读链接，未修改原库。真实 Electron 窗口、Renderer/IPC/Controller 现有管线被执行；原生文件选择、明确接受/取消是仅针对新建 Mock 夹具的替身，不是用户对真实文档的批准。首次任务缺少 Electron 二进制，启动失败；复用同版本二进制后验证通过，失败夹具保留。

## 7. 隔离建档与原交付流程证据

purpose 使用既有 Run 状态中的可选 `context-onboarding`。即使入口指定 direct，也强制 isolated/native；不使用另一个 Run 模型、状态机、审批库或预览界面。

三角色任何一次调用修改范围超出约定文档（或删除文件）均被拒绝；拒绝的隔离副本保留，原项目不改。普通目录不自动 git init，脏 Git 项目继续使用现有文件快照机制。验证使用新夹具，没有测试真实历史 Run。

最新 Electron Mock Run：`e8f507b0-75f2-4e5f-8d68-058e9310bd62`。

- 原项目：`D:/PersonalAgent-validation/project-context-v11/56b1dd0a/source`。
- 工作副本：`D:/PersonalAgent-validation/project-context-v11/56b1dd0a/runtime/runs/e8f507b0-75f2-4e5f-8d68-058e9310bd62/workspace`。
- 预览仅含 overview.md 和 modules/fixture.md；此时原项目无 overview。
- 输入准确摘要并明确批准后，原项目仍无 overview。
- 单独受控应用后，仅增加批准文档，原 src/main.ts、README.md 字节不变，没有 Git 初始化；有效 overview 使该 Mock 目标启用。
- 预览或工作副本变更使批准失效；应用拒绝不覆盖原项目。

截图：`D:/PersonalAgent-validation/project-context-v11/56b1dd0a/02-preview-documents.png`、`03-approved-not-applied.png`、`04-applied-enabled.png`。此处是 Mock 目标启用，不能据此称 FPSArena 已启用。文档交付批准也不接受其中的 proposed 提议。

## 8. FPSArena 真实执行前状态

只读检查对象固定为 `D:/PersonalAgent-projects/FPSArena`。普通文件夹，无 .git；现有快照规则排除 node_modules/.git 后共有 102 文件、16,880,872 bytes，满足原 100 MiB/20000 文件限制。代码、测试、脚本及主要资料共 30 文件、230,012 bytes；源快照摘要为 `4cfce4af5df5b297cf7c78611906955db64a84e94f9ece0fc0d6ae455f3865d7`。

尚无有效 overview；没有初始化 Git、修改游戏、调用模型、创建真实 Run 或复用旧 FPS 开发预算/审批。

用户最新答复：本次不用金额预算、不设置费用上限。不再要求提供价格或追加财务限制。原生 Controller 调用计数和恢复机制继续保留；真实启动授权另行确认，因为此前提问明确仅收集费用信息、尚不启动。

以上第 8 节记录的是正式启动授权前状态。真实执行前可审阅方案见 FPSARENA_CONTEXT_ONBOARDING_EXECUTION_REQUEST.md；随后用户正式批准仅执行一次真实建档并停在预览，该唯一 Run 已按授权完成。

## 9. 唯一真实建档结果更新

Run `38ea4c68-023b-429d-ab81-88b797b2fa63` 已 completed，实际 CC 规划 1/审查 1、Codex 1、返工 0。生成 13 份文档（overview 1、module 8、contract 3、decision 1），共 22935 bytes；33 个文件哈希均由程序盖章并核对。

正式 Delivery ID `762b5c66-be7d-474d-ad2d-c58242ac8678`，摘要 `4785a6311e58e7d199617e3db1652255b2040b961565c52859627aa860f6e796`。状态为 preview，approval=null、written=[]；已停止，无 approve/apply、额外 Run 或功能修改。

源 FPSArena 102 个既有文件快照未变，原项目仍未启用。CC 审查为 pass，但明确未直接核对 Codex 中文报告；实际报告已在 native-result-1.json 保存，此限制不隐去。

完整文档清单、真实模块划分、Controller/CC 原始结果、盖章细节、正式 Preview 路径及保护证据见 [FPSARENA_CONTEXT_ONBOARDING_REAL_VALIDATION.md](FPSARENA_CONTEXT_ONBOARDING_REAL_VALIDATION.md)。
