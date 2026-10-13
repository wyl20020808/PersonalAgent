# PersonalAgent — Agent 临时文件与工作区清理规则 V1

版本：V1。制定日期：2026-10-13。来源：按用户明确要求，将 OpenWorld 项目的《AI 临时文件与工作区清理规则》移植到 PersonalAgent，并加严为任务收尾的强制门禁。

适用范围分两层，两层都必须遵守：

1. **开发 PersonalAgent 自身的 Agent**（外部 Codex / Claude Code / OpenCode 会话，以及由 PersonalAgent 正式流程调度来开发自身的 Agent）。
2. **PersonalAgent 调度去开发其他目标项目的决策者与执行者**。Controller 通过 `src/decision-guidance.ts` 的 `workspaceCleanupGuidance` 把本规则的要点随 `agentRules` 注入每一次 Agent 调用；目标项目自带清理规则时（例如 OpenWorld 的 `Docs/AI_WORKSPACE_CLEANUP_RULES.md`），目标路径、保护列表和阈值以该项目规则为准，本规则的收尾门禁和报告要求仍然生效。

目标：每个任务结束时把无关紧要的临时文件、一次性脚本、过程日志、重复副本和可再生缓存清掉，释放磁盘空间；同时保证源码、正式文档、验收证据、Run/Session 历史和其他任务的成果不被误删。

## 1. 收尾门禁（硬性要求）

- **清理是“任务完成”定义的一部分。** 没有执行第 4 节的收尾流程并在报告中写出第 5 节的清理报告，任务不得报告为完成，不得请求验收，不得执行条件式自主合并到 `test`。
- 门禁适用于每一种结束方式：PASS、PARTIAL、FAIL、BLOCKED、取消、中断、暂停、合并收尾、交付收尾。任务失败或被打断不免除清理，只改变“保留什么”。
- 清理不需要用户提醒，也不需要另行申请许可：删除本任务自己产生、且通过第 6 节检查的临时产物，属于已授权目标内的常规操作。
- 无法完成清理时（文件被占用、归属不明、需要用户确认的大体积内容），必须在清理报告里逐项列出路径、大小和原因；不得静默跳过，也不得写“已清理”。
- 决策者验收时核对清理报告与工作区实际状态。缺少清理报告，或仓库里留有本任务的散落临时文件，按未满足验收标准处理：决策者自行清掉，或退回执行者返工，不给 pass。

## 2. 产生文件前先定归属

创建任何文件前先分清三类，并从创建时起记住本任务产生了什么，收尾时按这份清单处理，不靠事后猜测：

| 类别 | 内容 | 位置 | 收尾处置 |
| --- | --- | --- | --- |
| 正式内容 | 源码、测试、Schema、正式脚本、规则与设计文档 | 仓库正式目录（`src/`、`test/`、`scripts/`、`schemas/`、`desktop/`、`docs/`、`problems/`） | 提交 |
| 验收证据 | 验证报告、最终截图、结论性日志摘录 | 结论写入 `docs/` 的任务报告；确需入库的小体积原始证据放 `docs/evidence/<TASK_ID>/`；不入库的原始输出放 `D:\PersonalAgent-validation\<TASK_ID>\` | 只留最终结论集，并在报告登记路径 |
| 纯中间产物 | 草稿脚本、探针、试错副本、过程日志、临时夹具、下载件 | `D:\PersonalAgent-tmp\<TASK_ID>\` | 任务结束整目录删除 |

禁止事项：

- 禁止把临时文件散落在仓库根目录或 `src/`、`test/`、`scripts/`、`desktop/` 里。典型反例：`hello.txt`、`done.txt`、`mock-result-*.txt`、`.native-*-edit.py`、根目录下的一次性 `.log` / `.json` / `.png`。
- 禁止为了保住临时文件去改 `.gitignore`；临时文件应当放在仓库外的任务临时目录。
- 一次性脚本不放进 `scripts/`。确实需要长期复用的脚本才迁入 `scripts/` 并随任务提交，同时在报告中说明用途。
- 新建、下载、生成、缓存和编译产物一律落在 D 盘。测试用 `os.tmpdir()` 创建的会话级临时目录是唯一例外，且创建它的测试或脚本必须在结束时（包括失败路径）自行删除。
- “以后可能有用”不是保留理由：要么登记为证据，要么删除。

## 3. 目录约定

| 用途 | 位置 | 说明 |
| --- | --- | --- |
| 任务临时目录 | `D:\PersonalAgent-tmp\<TASK_ID>\` | 脚本、副本、日志集中于此；不在 `D:\PersonalAgent-tmp\` 根目录放散文件 |
| 不入库的原始证据 | `D:\PersonalAgent-validation\<TASK_ID>\` | 只留最终结论集；路径写进任务报告 |
| 任务 Worktree | `D:\PersonalAgent-worktrees\tasks\<TASK_ID>` | 生命周期见第 7 节 |
| 候选/合并测试副本 | `D:\PersonalAgent-worktrees\candidates\`、`D:\PersonalAgent-merge-tests\`、`D:\PersonalAgent-verify\` | 创建它的任务负责回收 |
| 依赖与构建产物 | 各 Worktree 内的 `node_modules/`、`dist/`、`desktop/out/`、`.cache/` | 可再生，不是证据，不进仓库 |
| Controller 运行数据 | 配置的 `runtimeDir`、`D:\PersonalAgent-data\` | 受保护，见第 8 节 |

目标项目内执行任务时：按目标项目的约定选临时目录；项目没有约定时，使用 Controller 为该 Run 提供的项目外 D 盘运行目录下的任务子目录，不往目标项目源码目录里散放。

## 4. 任务收尾清理流程（每次必做）

1. **列清单。** 列出本任务新建或修改的文件与目录：脚本、日志、JSON、截图、副本、导出件、测试夹具、临时 Worktree、候选副本、启动的进程。
2. **停进程。** 结束本任务启动的 Node、Electron、OpenCode/Codex 服务、监视器和其他子进程，只按本任务记录的 PID 或命令行结束；禁止按进程名批量结束，禁止关闭用户或其他任务的实例。调用结束前不得留下后台写入进程。
3. **逐项处置。**
   - 正式内容：核对后提交，只提交本任务文件。
   - 证据：只保留最终结论集（最终截图帧、最终报告、结论性日志摘录）。过程帧、连拍序列、同一命令的编号重复日志（`*2.log`、`*-retry-*.log`、`*-backup-*.log`）只留最后一份。
   - 大体积证据（单文件超过 50 MB 或目录超过 500 MB）：压缩或裁剪后再保留，并说明取舍；单文件超过 100 MB 的原始抓取默认不留。
   - 纯中间产物：删除，包括整个 `D:\PersonalAgent-tmp\<TASK_ID>\`、探针脚本、`.copy` 副本、临时夹具项目、下载的安装包和解压目录。
   - 可再生缓存：见第 7 节。
4. **查残留。** 在任务 Worktree 运行 `git status --short --ignored`，确认没有本任务遗留的未跟踪文件；检查仓库根目录、`D:\PersonalAgent-tmp\` 根目录和系统临时目录里本任务创建的条目。
5. **写清理报告。** 按第 5 节格式写入任务报告。
6. **拿不准就保留。** 不确定能否删除的文件保留原处，在报告中记录路径和保留原因。

## 5. 清理报告（任务报告的固定小节）

每份任务报告、验收请求和合并记录必须包含“清理报告”小节，至少写明：

- **已删除**：类别与路径（可按目录归并），以及估算释放的空间。
- **已保留**：证据和正式产物的路径，每项一句保留原因。
- **未能清理**：路径、大小、原因、需要谁处理。没有则写“无”。
- **进程**：本任务启动的进程是否全部结束。
- **Worktree 处置**：已移除、保留（原因）或待合并后移除。

没有产生任何临时文件的任务也要写一句“本任务未产生临时文件”，不能省略该小节。不得把没执行的清理写成已执行。

## 6. 删除前检查

删除任何文件或目录前逐项确认，任一命中即停止或升级处理：

1. 是否由本任务创建？不是，或归属不明：不删。
2. 是否位于第 8 节保护列表？是：不删。
3. 是否被 `docs/`、`problems/`、验证报告、`scripts/` 或测试引用？先搜索引用路径；有引用则先迁移并更新引用，再删除，不留断链。
4. 是否是仅有的副本且不可再生？是：保留并记录。
5. 路径上是否含 junction、symlink 或其他 reparse point？按下方链接规则处理。
6. 是否正被进程占用，或属于正在运行的实例？是：不删。
7. 批量删除超过 20 个文件或总计超过 1 GB，且不在本任务自己的临时目录、任务 Worktree 或可再生缓存内：先列清单，经用户确认后再执行。

链接规则：删除目录前先用 `Get-ChildItem <path> -Force -Attributes ReparsePoint` 检查。`Remove-Item -Recurse` 会跟进 junction/symlink 删除目标内容，必须先单独删除链接本身（不带 `-Recurse`，或 `cmd /c rmdir <link>`），再独立判断目标目录。`robocopy /MIR` 之类镜像命令必须加 `/XJ`。

删除命令使用绝对路径，执行前核对解析后的真实路径仍在预期目录内；不使用未经展开核对的通配符删除仓库外目录。

## 7. 任务 Worktree 与可再生缓存的生命周期

任务 Worktree 及其 `node_modules/`、`dist/` 是磁盘占用的主要来源，任务结束必须回收：

- **任务成果已合并进 `test`（或对应目标分支）后**：确认 Worktree 干净、证据已迁出、没有本任务持有的锁，使用 `git worktree remove <path>`（不带 `--force`）移除本任务自己的 Worktree。任务分支默认保留，提交仍可从分支恢复。命令因未提交或未跟踪文件而拒绝时，先处置这些文件，不用 `--force` 绕过。
- **任务未合并而结束或暂停（PARTIAL / FAIL / BLOCKED）**：保留 Worktree 和未合并的提交，但仍要删除任务临时目录和过程产物。预计短期内不续接时，同时删除该 Worktree 的 `node_modules/`、`dist/`、`desktop/out/`、`.cache/`，并在报告中注明续接前需要重新安装和构建。
- **候选、合并测试和基线对照 Worktree**（`candidates/`、`*-baseline-*`、`D:\PersonalAgent-merge-tests\`、`D:\PersonalAgent-verify\` 下由本任务创建的目录）：验证结论写入报告后即移除，不等到下一个任务。
- **只回收自己的**：只移除有明确任务归属且属于本任务的 Worktree。`dev`、`test`、MAIN 目录、其他任务的 Worktree、归属不明的目录一律不动。
- 不执行 `git worktree prune`、`git gc --prune`、`git clean -fdx`、`git reset --hard` 之类会波及其他任务的命令来“腾空间”。
- 集成工作区（`test`、`dev`）不得因本任务留下未跟踪文件；合并后检查失败时保留现场属于证据，按治理规则报告，不算临时文件。

## 8. 保护列表（不得删除）

- 仓库正式内容：`src/`、`test/`、`scripts/`、`schemas/`、`desktop/` 源码、`docs/`、`problems/`、各规则与契约文件、已提交的验证报告。
- 运行与审计数据：Controller `runtimeDir`、`D:\PersonalAgent-data\`（含 `global-interaction-policy.json`）、Run、Session/Thread、调用审计、用量记录、Delivery 记录、检查点。清理临时文件不得改写或删除任何历史 Run 与审计。
- `D:\PersonalAgent-backups\`、`D:\PersonalAgent-projects\` 及任何目标项目的正式内容与用户文件。
- 正在运行的 MAIN / DEV / TEST 实例的源码、构建产物和状态目录（`.runtime/`、`.desktop-data/`、Electron 状态与单实例锁）。
- 其他任务的 Worktree、分支、锁（包括 Git common directory 中的 `personalagent-test-integration.lock` 和 `.delivery-locks/`）、临时目录和证据。
- 凭据、认证配置、登录状态。
- 用户放入或显式交付的文件。
- 共享缓存（全局 npm 缓存、模型目录缓存等）：整体清空前须用户确认。

## 9. 历史欠账与定期审计

- 触发时机：长任务收尾、跨天会话开始、磁盘紧张，或发现根目录、`D:\PersonalAgent-tmp\` 再次出现散落文件时。
- 检查项：`D:\PersonalAgent-tmp\` 根目录散文件；`D:\PersonalAgent-worktrees\tasks\` 中已合并却未移除的 Worktree 及其 `node_modules/`；`candidates/`、`D:\PersonalAgent-merge-tests\`、`D:\PersonalAgent-verify\`、`D:\PersonalAgent-validation\` 中的过期副本；各目录内超过 100 MB 的文件；同前缀编号日志。
- **现状（2026-10-13）**：仓库登记了一百多个历史任务 Worktree，MAIN 与 DEV 工作区根目录存在历史散落文件（如 `hello.txt`、`done.txt`、`mock-result-*.txt`、`.native-*-edit.py`、各类 `*-validation/` 目录）。这些属于历史欠账，归属与引用关系未经核对。
- 历史欠账不属于任何当前任务的“自己的产物”：首次集中清理必须先产出清单（路径、大小、所属任务、是否已合并、是否被引用），经用户确认后执行，禁止静默批量删除。本规则生效后新任务不得再增加欠账。

## 10. 与其他规则的关系

- 本文件是 PersonalAgent 清理规则的唯一详细来源；`AGENTS.md`、`CLAUDE.md`、`AGENT_WORK_RULES.md` 和三分支治理规则只保留入口与摘要。治理规则第三节所说的“批准清理流程”即本文件。
- 本规则不扩大任何授权：不授权推送、发布、更新 DEV/MAIN、替换运行实例或修改无关项目；全局工作/空闲策略、写入锁、证据真实性和恢复机制继续生效。
- 清理中发现的规则缺口或反复出现的残留来源，按 `problems/README.md` 登记为自省发现。
- 修改本规则须记录版本、日期、原因，并同步 `src/decision-guidance.ts` 中的 `workspaceCleanupGuidance`，保证文档与注入给 Agent 的文本一致。
