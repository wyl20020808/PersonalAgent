# 大型项目快照固定上限阻断开发

- 归属：PersonalAgent，项目准备、快照、轮次基线与变更验收。
- 状态：取消强制 Snapshot 与 P2A 已在获批整合分支组合验证通过，等待本次正式 DEV 快进及启动核验。以下原记录作为历史证据保留。未调用真实付费 Agent，也未对 OpenWorld 做全项目快照或端到端验收。
- 现象：用户反馈真实项目出现 `Project snapshot limit exceeded (100 MiB / 20000 files)`，无法开始正常开发。
- 影响：Unreal Engine 源项目和资源目录即使只修改少量源码，也被项目总容量或文件数量阻断。

## 证据与原因

开发基线为 dev `039a2fd10623d09e2aac66c9fa201edcde2697b4`。该版本 `src/project-files.ts` 的 `projectFiles` 累加文件容量，超过 100 MiB 或 20000 文件立即抛出同一错误；`readProject` 随后把全部文件转为 Base64。`src/incremental.ts` 的轮次基线另有限制 50 MiB。上述原因由源码核实；原始错误来自用户反馈，本次没有读取历史 Run 日志。

2026-10-10 对 `D:\OpenWorld` 只读统计，跳过既有 `.git`、`node_modules` 和链接：435587 个普通文件，118807819344 字节，另发现 7 个链接。该统计不是完整内容安全证明。TestBuild 有 34103 文件、9122141473 字节；新 CLI `project-scan --repo D:\OpenWorld\TestBuild` 实际运行得到相同数量和容量，退出码 0，没有创建 Run、备份或写入目标项目。

## 修复与边界

快照清单改为 SHA-256 指纹，内容按块读取。写入型任务将原始字节存放在 Run 的 `snapshot-objects`，后续基线只增加新内容对象；差异只按需读取变更内容。复制隔离工作区和恢复使用文件复制，不再依赖全量 Base64。旧格式基线仍可读取。

资源分类仅用于诊断和验收边界，不按扩展名忽略文件。uasset、umap、TestBuild 等仍有完整内容指纹。资源或大文件发生变化时记录前后 SHA-256，暂停自动审查与交付，明确要求人工内容核验，不能把哈希变化记录当作内容验收 PASS。

文件数量和清单容量保护分别报告触发值与路径。链接、备份损坏、备份写入失败及覆盖不完整明确阻断。只读 `project-scan` 仅做目录统计，支持诊断扫描限额，不生成恢复备份。

首次写入型任务仍需要足够磁盘空间保存独有内容；isolated 还需要工作区副本。完整内容检查仍有全项目读取开销，没有声称已实现文件系统权限沙箱、任意链接支持或 Blueprint 二进制自动交付。应选择实际项目根目录，避免把整个素材与工具工作盘作为源项目。

## 验证与下一步

最终 8 项专项回归全部通过：20001 文件、101 MiB 文件、去重备份、同尺寸且恢复 mtime 的修改检测、损坏备份拒绝、旧格式读取、Git/非 Git 与 direct/isolated 生命周期，以及资源和未知扩展名二进制变更暂停、交付拒绝与明确批准后的恢复。较早全量回归 278/278 通过；备份安全补强后 64/64 通过；最终代码专项、项目模式及跨模块回归 55/55 通过。全部是当前 Codex 会话自主测试和注入本地适配器，未冒充独立真实 Agent 审查。完整阶段说明见 `docs/LARGE_PROJECT_SNAPSHOT_V1_VALIDATION.md`。

2026-10-10 用户正式批准合入 DEV。重新核对 DEV 为 `039a2fd10623d09e2aac66c9fa201edcde2697b4`，是修复提交的直接祖先；既有未跟踪文件全部保留。确认 DEV 仅有一个已失败 Run、没有活跃 Run 锁或 Controller 子进程后，正常关闭 DEV 窗口，执行 `git merge --ff-only b02e655`。MAIN 保持 `aff80240342176ec196fedb2028905f489afced9`，未关闭、重启或修改 MAIN。

本次兼容性回归：Snapshot、Project Context、Controller 审查、direct Delivery 与 OpenCode 环境适配共 62/62 通过。桌面专项发现旧准备失败夹具仍使用 101 MiB 触发已移除的限制；保留原失败审计断言，改为不安全硬链接触发，并新增大型项目准备成功及 Run Runtime 来源绑定测试。修正后 Run Routing、OpenCode 选择持久化、实例隔离和 Delivery 边界专项 9/9 通过。此处只修改确定性夹具，没有改动生产适配器、Routing 或 Controller 规则。

DEV 核心 TypeScript 与正式 Desktop 构建通过。首次真实大型项目使用仍应选择正确项目根，并预留独有内容备份和 isolated 工作区空间；完整内容检查存在全项目读取开销。下一步在 DEV 正常使用时核验真实大型项目；本次不对 OpenWorld 做完整快照或资源修改测试，不推送或发布 MAIN。验证与启动证据目录：`D:\PersonalAgent-data\large-project-snapshot-dev-v1\2026-10-09T16-47-42-781Z`。

正式 `Start-DEV.ps1` 已恢复窗口，启动 stderr 为空。profiles、sessions 和原失败 Run 状态的 SHA-256 保持不变；旧的缺少 state.json 的历史目录仍显示不可用，未删除、修补或自动重跑。最终 DEV 桌面专项再次 9/9 通过。启动正常不代表真实大型项目端到端验收完成。

## 2026-10-10：取消强制机制

用户正式决定不再优化强制 Snapshot，而是取消其开发前置地位。独立 Codex Desktop 从最新 dev `86a5f91` 创建 `fix/remove-mandatory-project-snapshot-v1`；旧 `fix/large-project-snapshot-v1` 已包含在基线中，没有重复合并或覆盖。

新 Run 不创建 project-baseline、snapshot-objects、每轮内容基线或 Direct recovery 快照；不全量哈希、备份项目，不每轮 fsck。Direct 在已授权的项目目录使用原生工具，Git/非 Git 均可执行 Plan/Execute/Review。Project Context 只读取自己的文档和显式 checked_files；Session、Run、工具审计、配置测试、人工验收、契约确认和成果审批保留。历史 Run 和快照兼容代码保留，仅用于既有数据，不迁移或清理。

### 仍有的限制（暂缓）

- 没有全项目恢复备份，不再提供自动 project-restore；恢复执行保留当前文件，重跑配置测试和审查，不能证明非 Git 未观测文件在中断后未变化。
- Git Diff 仅辅助审查并含任务前已有修改；未跟踪、忽略文件、非 Git 和二进制内容不构成完整变化报告。超出 Git 输出限额时只提供摘要并注明内容未验证。不提供精确任务/轮次差异，也不复用新 Run 的 Review 回执。
- Clean Git isolated 仍可克隆；非 Git/Dirty Git 自动复制及独立建档隔离入口暂不可用。现有 Project Context 可在授权 Direct 中维护；不能静默改用 Direct。
- 无快照 isolated 成果不提供自动 Apply；用户审查后手动集成。Direct Delivery 仍显式审批，只确认已有成果，不重复写入文件；空 changes 表示没有完整清单，不表示没有修改。
- Git 克隆会执行 Git 的检出规则，可能使 checked_files 显示既有行尾差异，应按实际工作区核对；不保证复制原目录全部字节。

验证结果见 `docs/REMOVE_MANDATORY_PROJECT_SNAPSHOT_V1_VALIDATION.md`。这次不创建新的备份、缓存、监听或版本数据库。当前授权只提交独立 fix 分支，不合入 dev/main、不 push。下一步等待用户批准合入 dev，再实际使用验证。

收尾时并行任务已将 dev 更新到 `4ac263e`。本修复保持创建时最新 dev `86a5f91` 的基线，没有自行合并其他任务。后续合入应核对 `desktop/src/GroupWorkspace.tsx` 和 `desktop/src/thread.ts` 的重叠变化；本次独立分支测试不代表与更新后的 dev 组合验收通过。

## 2026-10-10：获批组合整合验证

独立 Codex Desktop 重新核对 DEV 为 `c3b37c63569d7e24a79129eaf85ba45487a44f8d`，创建 `integration/personalagent-snapshot-p2a-v1`，按顺序完整合并 Snapshot `363f8da`、P2A `b3fe515`，保留两项提交历史与已验收 P1。Controller/store/context-navigation 自动合并后确认无快照策略与讨论调度同时存在；桌面冲突逐段保留身份和未验证范围。

大型 Git/非 Git Direct、20,001 文件、512 MiB 资源、硬链接、Plan/Execute/Review、人工 Delivery 及恢复均经本地夹具验证。核心 65/65、Desktop 83/83、实际 Electron 8 组通过；P2A 没有重新引入强制内容 Snapshot、备份或每轮全库扫描/fsck。旧 13 项失败已处理，见 `2026-10-10-snapshot-era-regression-fixtures.md`。

上述无全量 Diff/自动恢复/isolated 自动 Apply 限制继续存在；较深 Windows Git isolated Runtime 可能报 `$GIT_DIR too big`，另有问题记录。付费调用 0；正式 DEV 更新与启动结果由本次整合报告收尾记录。本次未扫描、备份或执行 OpenWorld 项目。
