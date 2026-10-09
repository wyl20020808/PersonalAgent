# 大型项目快照固定上限阻断开发

- 归属：PersonalAgent，项目准备、快照、轮次基线与变更验收。
- 状态：已解决固定上限阻断，已正式合入本机 DEV；待真实大型项目使用验证。未进行真实付费 Agent 或 OpenWorld 大型项目端到端验收。
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
