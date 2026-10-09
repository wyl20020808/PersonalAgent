# FPSArena 首次建档知识定向修订报告

本次仅完成开发会话的离线修订及确定性验证。修订副本不是原 Codex 执行结果，也没有经过新的正式 CC Review；不能使用原审批摘要批准这些内容。

## 修订成果

检查全部 13 份文档，修订 8 份中的 14 处描述：删除仅适用于首次建档的执行限制；把测试和浏览器脚本限制改为客观的输出副作用、历史证据有效范围；保留真实架构、模块职责、接口约束及 proposed 状态。

| 文档 | 修改处数 |
| --- | ---: |
| overview.md | 3 |
| modules/browser-validation.md | 2 |
| modules/game-app.md | 1 |
| modules/unit-tests.md | 2 |
| contracts/debug-isolation.md | 1 |
| contracts/round-lifecycle.md | 1 |
| contracts/shared-geometry.md | 2 |
| decisions/simulation-presentation.md | 2 |

另外 5 份模块说明未修改。没有重新划分模块，没有新增契约、决策或架构事实。文档 frontmatter 全部保持原值，包括项目 UUID、模块 ID、职责路径、直接依赖、依据引用及 33 项 checked_files。

独立副本：[docs/project-context](D:/PersonalAgent-validation/project-context-v11-revision/6867a593/workspace/docs/project-context)。

逐项修改及验证：[offline-validation.json](D:/PersonalAgent-validation/project-context-v11-revision/6867a593/offline-validation.json)。

人工修订 Diff：[revision.diff.patch](D:/PersonalAgent-validation/project-context-v11-revision/6867a593/revision.diff.patch)。此 Diff 不是正式 Delivery。

## project_id 实际生命周期

首次尚无有效总览时，导航以随机生成的 Run UUID 作为 projectId 初始值；原建档按此值生成总览，所以项目 UUID 与首次 Run UUID 相同。

代码证据：[context-navigation.ts](D:/PersonalAgent-worktrees/tasks/project-context-v11-phase1/src/context-navigation.ts:63) 和 manifest 的第 84 行均优先使用 `context.overview.metadata.project_id`，仅缺少总览时回退到 `state.id`；[controller.ts](D:/PersonalAgent-worktrees/tasks/project-context-v11-phase1/src/controller.ts:25) 创建 Run 时生成随机 UUID。项目 UUID 没有绑定 Run 的完成或删除生命周期。

有效总览持久存在后，换 Run、Session、进程重启仍读取同一 UUID。复制含总览的工作区继承同一逻辑项目身份；执行、文件读取和交付目标依靠具体 workspace 路径及独立 Run Store 隔离，不以 project_id 查找其他分支的文档。不同分支内容仍由各自现场目录决定。

限制须明确：当前没有独立项目身份注册表。如果源目录尚未应用总览，或总览被删除，另一次独立建档会产生新的初始 UUID。当前 FPSArena 原目录未启用 Project Context，因此不能声称其已经拥有跨建档持久身份。保留现有 UUID `38ea4c68-023b-429d-ab81-88b797b2fa63`，在文档正式应用后由总览持久保存；不为避免字面相同而更换身份。

发现一处实际错误：Mock 建档直接调用 `mockContextDocuments(state.id, file)`，重新建档会覆盖已有 UUID。已最小修复 [adapters.ts](D:/PersonalAgent-worktrees/tasks/project-context-v11-phase1/src/adapters.ts:28)，改为优先读取已有总览 UUID，再传入 Mock 文档生成器。未调整 Native 初始生成逻辑、注册表、模块设计或第二阶段机制。

新增 [project-context.test.ts](D:/PersonalAgent-worktrees/tasks/project-context-v11-phase1/test/project-context.test.ts:116) 回归覆盖首次生成、正式应用到自建 Mock 夹具、同项目资料更新后重新建档、不同 Session、独立进程重启、复制目录和不同项目隔离。修复前复现 UUID 被替换：[identity-before-fix.log](D:/PersonalAgent-validation/project-context-v11-revision/6867a593/identity-before-fix.log)。初版回归夹具无内容变化而正常暂停，随后补入资料更新，保留完整完成与身份断言；相关失败记录留存，没有削弱 Controller 验收。

## 验证与历史保护

- V1.1 正式解析器通过全部 13 份文档的 YAML、固定章节、字段、引用、行数和行长检查。
- 复用正式 CLI `context-check` 和 Controller 的 `assertOnboardingScope`，离线副本格式、提议状态及文档产物范围均通过；未调用旧 Run 的写入或审计入口。
- 全部元数据与原文相同；33 项文件哈希同时与修订副本及 FPSArena 目标源码一致。
- 只修改 8 份知识文档，未增加或删除文件，未修改任何 FPSArena 业务文件。
- 不再出现本次、本轮、后续获准等建档专属描述；保留命令副作用及历史测试记录的适用范围。
- 3 份契约和 1 份决策仍为 proposed。
- 原 Run 目录全部 253 个文件逐字节哈希及文件列表不变，涵盖原文档、审计、Review、Preview 和执行证据。
- FPSArena 原目录仍未启用 Project Context，102 文件快照不变：`4cfce4af5df5b297cf7c78611906955db64a84e94f9ece0fc0d6ae455f3865d7`。
- main/dev 均无跟踪文件修改，HEAD 同为 `be878bdc5e606a1461ef7085e4b1daa197147084`，tree 同为 `1f57d67b7d1f292da68ddf6c96221bedc18f46a4`。

构建通过，Project Context 专项 16/16、Controller 全量 175/175 全部通过。专项日志：[context-final.log](D:/PersonalAgent-validation/project-context-v11-revision/6867a593/context-final.log)；Controller 全量日志：[controller-final.log](D:/PersonalAgent-validation/project-context-v11-revision/6867a593/controller-final.log)。当前修改只影响 Mock 建档身份及其回归，未修改 Desktop/Electron 或真实 Native 调用实现。

保护核对：[preservation-after.json](D:/PersonalAgent-validation/project-context-v11-revision/6867a593/preservation-after.json)。本次新增真实 CC/Codex 调用为 0；没有批准、应用、提交、合并或 push。

## 正式流程边界与所需授权

[controller.ts](D:/PersonalAgent-worktrees/tasks/project-context-v11-phase1/src/controller.ts:85) 对 completed Run 直接返回，未提供正式重新开启、修订或重新 Review 入口。[delivery.ts](D:/PersonalAgent-worktrees/tasks/project-context-v11-phase1/src/delivery.ts:106) 要求当前工作区与完成验收的快照一致，否则拒绝交付。直接修改旧工作区或状态会破坏原验收证明。

因此本次没有生成新的可信 Delivery Preview，没有新的 Delivery ID 或审批摘要。原 Delivery `762b5c66-be7d-474d-ad2d-c58242ac8678` 仍为 Preview、approval 为 null、written 为空；原摘要保持 `4785a6311e58e7d199617e3db1652255b2040b961565c52859627aa860f6e796`。

若要正式交付本次修订，需用户另行授权一次新的隔离 Native 修订 Run。建议复用现有流程，不开发重新审查系统：

1. 目标仍为 `D:/PersonalAgent-projects/FPSArena`，采用当前 feature 构建、独立 runtime 和 isolated/native。
2. 将本报告、原始证据及独立修订副本作为明确标注的人工修订输入；要求保留既有项目 UUID、8 个模块和全部事实引用，成果限于 13 份上下文文档。
3. CC 规划 1 次、Codex 执行 1 次、Controller 独立验收、CC 审查实际最终文件 1 次。上限沿用 CC 4 次、Codex 2 次、返工 1 次、单次超时 20 分钟；不自动耗尽额外额度，不设金额上限。
4. 重新核对源码快照及 33 项哈希，生成独立的新 Preview 和新摘要；立即停止，仍不批准、不应用。

以上只是后续执行方案，未创建或启动任何新的真实 Run。当前停在离线准备完成，等待用户明确授权。
