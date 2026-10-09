# 大型项目 Snapshot 阻断修复验证

## 任务与授权

- 任务：large-project-snapshot-v1。
- 发起软件：独立 Codex Desktop 开发会话，没有通过 PersonalAgent MAIN/DEV 内部 Agent Run。
- Git 基线：实际核对 dev 为 `039a2fd10623d09e2aac66c9fa201edcde2697b4`，与用户提供值一致。
- 分支：`fix/large-project-snapshot-v1`。
- Worktree：`D:\PersonalAgent-worktrees\tasks\large-project-snapshot-v1`。
- 权限衔接：仓库统一规则与治理 V1 默认要求 Agent 不自行提交；本次用户明确要求独立 Desktop 直接开发并“完成后提交独立 fix 分支”，因此只授权提交该任务分支。未授权合入 dev、更新 main、push 或发布，均不执行。
- 未启动真实付费 Agent。所有 Run 相关回归均使用本地夹具或注入适配器；自主测试不等同于真实 Agent 独立验收。

## 实现

原有 100 MiB、20000 文件、50 MiB 轮次基线限制与全量 Base64 备份共同造成阻断。本次改为版本 2 指纹清单、分块 SHA-256、外置内容对象去重、仅对变更文件生成内容差异。新保护针对清单元数据容量与数量，而不是原始文件总字节；默认清单估算容量 64 MiB，数量保护 1000000 文件。扫描失败明确报告原因、触发值、路径与后续建议。

`project-scan --repo DIRECTORY` 是只读目录诊断命令，无须 config 或 Agent。可用 `--scan-max-files N`、`--scan-max-manifest-bytes N` 限制诊断扫描。它不读取全部文件内容、不创建 Run、不备份项目，也不构成安全 PASS。开发仍保留完整内容指纹与备份，不依据目录分类默默排除资源。

Project Context 规划与任务基线使用指纹比较，checked_files 仍核对真实 SHA-256，跨模块变化和重命名保留。Run 审计记录覆盖范围和分类。Delivery 的来源冲突检查、工作区绑定、独立验收和人工审批保留。原工作区 fingerprint 字节算法保持一致，仅把文件内容读取改为分块，以兼容恢复检查。

## 验证记录

1. `rtk proxy npm ci --ignore-scripts`：成功，仅安装本 Worktree 依赖。
2. `rtk proxy npm run build`：通过。
3. `rtk proxy node --test dist/test/project-modes.test.js dist/test/project-context-phase2.test.js dist/test/direct-project.test.js`：57/57 通过。
4. `rtk proxy node --test dist/test/large-project-snapshot.test.js`：初版 7/7 通过；最终新增未知扩展名二进制检查，共 8 项，包含在下述最终回归中。
5. `rtk proxy node dist/src/cli.js project-scan --repo D:\OpenWorld\TestBuild`：退出码 0，34103 文件、9122141473 字节，明确标注仅目录统计；OpenWorld 未写入。
6. `rtk git diff --check`：通过。
7. `rtk proxy node --test dist/test/*.test.js`：278/278 通过，随后补强原子备份落盘、准备期间基线一致性以及未知扩展名二进制检测。
8. 补强备份与准备检查后，Controller、Recovery、项目模式与大型项目回归共 64/64 通过。
9. 最终代码执行 `rtk proxy node --test dist/test/large-project-snapshot.test.js dist/test/project-modes.test.js dist/test/project-context-phase2.test.js`：55/55 通过，包含最终 8 项专项回归。日志保留于本 Worktree 的 `.validation/large-snapshot-final-code-tests.log`；64 项回归日志为 `.validation/large-snapshot-final-tests.log`。没有把较早的全量回归称为最终增强后的全量回归。

专项回归覆盖超过旧上限的清单与二进制文件、去重、损坏备份拒绝、mtime 恢复后内容变化、旧格式兼容、四种项目模式、大资源不进入文本上下文、正常源码开发完成与审批预览、资源与未知扩展名二进制变化暂停且不能交付、明确批准后的资源恢复。新内容对象先复制到临时文件，校验 SHA-256 并 fsync 后才进入正式对象路径，写入失败不会留下看似可用的正式对象。

## 限制与交付

首次备份仍占用独有文件内容的磁盘空间；isolated 工作区另占副本空间。各安全检查仍读取全项目内容，保证可靠性而非用 mtime 缓存冒充完整检查。链接和未支持的文件系统条目仍拒绝；二进制资源变化需要人工内容核验，当前自动交付流程不支持通过 hash-only 证据验收它们。

没有对 OpenWorld 执行完整内容快照、源码修改、引擎构建或付费 Agent Run。真实目录统计与本地大文件生命周期回归分别记录，不能混为真实大型项目端到端交付验收。

问题记录：`problems/2026-10-10-large-project-snapshot-limit.md`。交付仅限独立 fix 分支，等待用户决定是否整合 dev。
