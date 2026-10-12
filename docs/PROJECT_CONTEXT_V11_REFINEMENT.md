# Project Context V1.1 第一阶段修订

本次修订保持现有 Context、Run 状态和正式交付流程，不引入第二阶段架构。

## 模块导航和任务声明

- 模块 ID、名称和声明路径使用忽略大小写的完整词匹配。字母、数字、下划线、连字符和中文字符均参与边界判断，避免 `ai` 命中 `main`、`paint`，以及中文名称在连续正文中宽泛误命中。
- 无可靠匹配时不猜测模块。Plan、Execute、Review 均提供完整模块目录；导航上限为 24 KiB，必要时保留所有 ID/名称，完整路径目录保存在当前调用 manifest 中。
- Context 是可选导航；决策者可声明相关 `moduleIds`，也可省略或传空数组。显式引用不存在的模块时需修正引用；模块相关性由决策者结合源码判断。
- 原生探索可在返回计划前建立真实的新业务模块。建档任务、未建档项目和已经保存的历史任务计划保持兼容。
- 选中模块时提供实际模块、相关契约和决策路径；manifest 证明提示词装配，不冒充 Agent 的真实读取。

## 盖章和建档约束

- 导航的 `context-stamp` 示例包含实际 workspace、有效模块 ID 和已有源码文件。没有适合文件时提供选择模块和文件的说明，不生成空参数骨架或虚构路径。
- 决策者按需要选择 `checked_files` 和数量，可优先考虑关键源码、接口及验证文件。程序计算实际字节的 SHA256，完成校验后原子更新文档。
- 盖章接受决策者选择的模块内文件；仍核查真实路径、实际文件和受保护数据，拒绝路径越界、链接及不存在的文件。
- 模块组织由决策者根据项目职责决定；测试可归入业务模块，也可按实际需要独立组织。

## 受限文档删除交付

- 仅 isolated 建档 Run 的正式 `project-files` 交付允许删除 `docs/project-context/modules/`、`contracts/`、`decisions/` 中约定名称的 Markdown 文档。
- 不允许删除 overview、业务源码、运行数据、非标准文档或项目外文件。普通开发交付仍禁止删除。
- 删除使用 `after: null` 明确记录在 manifest、完整 Diff、Preview、Desktop 文件列表和审批摘要中。
- 用户批准指定摘要后才能 Apply。整体目标快照、交付内容和预览均重新校验；删除过程保留现有 intent/written 审计和恢复机制。未包含删除的旧交付预览文本保持兼容。
- Context 文档交付批准不代表接受契约或决策；`proposed` 不自动升级。

## 回归入口

Controller 全量测试包含 `test/project-context.test.ts` 的完整词匹配、声明校验、真实盖章命令、盖章对象、历史兼容，以及 ADD/MODIFY/DELETE、预览篡改、源冲突和删除范围负向回归。

Desktop 使用现有 build、check、test；Electron 使用 `desktop/validate-project-context-electron.mjs` 和 `desktop/validate-context-deletion-electron.mjs`。实窗夹具在独立目录中运行 Mock，审批回复仅适用于新建本地夹具，不产生付费 Agent 调用。

运行数据、缓存、凭据、构建产物、截图和临时脚本不纳入此源码提交。真实 FPSArena Context 与 HUD 交付保留在各自正式 runtime 中。
