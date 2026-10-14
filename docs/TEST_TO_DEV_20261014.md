# TEST 批次交付 DEV（2026-10-14）

用户授权将当前 TEST 合并到 DEV 并统计新增功能。由外部 Codex 执行，不冒充 PersonalAgent 业务 Run 或独立决策者验收。

## 批次与新增内容

- 冻结 TEST：`410229ee226203dd7f4c48efae253f860838fad0`。
- 更新前 DEV：`a7bcaa4f3631496330eabab4c740b8a3ddc6b48c`。
- TEST 相对旧 DEV 有 5 个未包含提交：2 个实际代码提交、1 个问题记录提交、2 个合并提交。正常 merge 保留两侧历史，未删除 DEV 独有交付文档。
- TEST 批次实际合并差异：14 个文件，新增 296 行、删除 15 行。另同步构建发现遗漏的 `schemas/state.schema.json`，新增 54 行，使持久化 State Schema 与运行时一致；此修正提交为 `4dccdf9`。
- 候选分支：`fix/test-to-dev-20261014`。通过验证后快进 DEV；MAIN 和 TEST 保持原提交，不推送或发布。

按用户可感知行为归并为 4 项，包含 1 项新能力、1 项修复、2 项行为约束改进：

1. **验收通过后追加任务。** 决策者可以在 `pass` 中给出可选 `followUpTasks`，最多 20 项；Controller 校验依赖后追加并继续执行。已有任务 ID 跳过，无效依赖写审计且不加入计划。无需为了追加工作故意返工三次。
2. **渲染器持续恢复。** 将应用生命周期内最多两次恢复，改为十分钟滚动窗口限速；密集崩溃进入冷却后继续重试。仅重载界面，保留主进程和 Controller；增加“恢复界面（保留运行任务）”菜单和 `Ctrl+Shift+R`。work 模式延后界面加载。底层 Chromium 崩溃原因仍未解决。
3. **执行者必须实施并验证。** 提示词明确要求本次调用完成实施和验证，不能仅交规划；只有超出权限的决策可以提前停止。这是提示词约束，没有新增程序强制门禁。
4. **清理遭策略拒绝时正确收尾。** 如实列出未能清理的路径与拒绝原因，不重试、不绕过，不再仅因此反复返工或转人工。其余清理要求保留。

## 验证与限制

- 候选根目录 `rtk npm run build`、桌面 `rtk npm run check` 和 `rtk npm run build`：退出码 0。
- Controller 相关六个测试文件串行回归：60 项，58 通过、2 失败。新增追加任务的 3 项测试全部通过。
- 失败均为 `recovery.test` 中 `explicit rework at missing-tests pause executes current task and retains sessions` 的 proposal/native 两项，期望 `paused`，实际 `completed`。旧 DEV 独立基线筛选回归为 9 项、7 通过、同样 2 项失败，确认非本批次新增。
- 桌面恢复、窗口位置、交互策略和监督四个测试文件：退出码 0，失败数 0。构建仍有既有依赖指令及大包警告。
- State Schema 与运行时对象一致性断言通过，`git diff --check` 通过。
- 复核已提交恢复报告及原隔离 Electron 三次崩溃恢复证据。本轮未重复注入业务 Run 崩溃，未做完整可见 GUI 验收、长时间稳定性验收或真实模型追加任务验收。
- 验证日志：`D:/PersonalAgent-validation/test-to-dev-20261014/`。

## 安全更新与恢复边界

DEV 主进程 PID 10872、窗口身份 `PersonalAgent DEV`；更新前未发现 Controller 或模型任务子进程。DEV 项目内历史 Run 均处于 completed、paused、failed 等状态。历史锁中存在 PID 被其他程序复用的情况，未删除或接管这些锁。

正常关闭 DEV 返回成功并等待主进程退出，未强杀或停止业务 Run。备份 55 个运行配置/状态/审计文件和 54 个既有未跟踪文件，保存在 `D:/PersonalAgent-backups/test-to-dev-20261014/`，含逐文件 SHA256 清单。持有本任务 DEV 集成锁期间重新核对分支基线，更新完成后核对状态及未跟踪文件哈希。运行数据未迁移，原 Run/Session 不重建，不重放任务。

## 清理报告

- 已保留：本报告、代码及 Schema 修正、最终验证日志、回滚备份；用于追溯和恢复。
- 待本批次合并后删除：本任务候选及基线 Worktree、依赖和构建缓存、测试夹具、`D:/PersonalAgent-tmp/test-to-dev-20261014/` 中的一次性备份脚本。
- 最终删除数量、释放空间、进程及锁核查，记录在 `D:/PersonalAgent-validation/test-to-dev-20261014/cleanup.json`。此处不将尚未执行的清理写成完成。
- 历史 Worktree、DEV 既有未跟踪文件、用户运行数据及其他任务的锁不属于本任务，保留原状。
