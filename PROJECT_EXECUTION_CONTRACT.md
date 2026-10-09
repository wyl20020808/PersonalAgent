# V0.3C 统一执行契约

实现与验收来源见 `V03C_UNIFIED_VALIDATION.md`。两份契约文件采用相同定义。

- `mode: mock | real` 选择 Agent 来源；`executionMode: native | proposal` 选择执行协议；`projectMode: direct | isolated` 选择工作目录，三个维度分别处理。
- `projectMode` 是规范字段。旧 `workspaceMode` 可读入并迁移；两个字段同时出现且不同必须拒绝。持久化只写 `projectMode`。
- 直接开发必须使用 native，持有匹配真实项目路径的 `directAuthorization: { projectPath, acknowledgedAt }`。修改即时发生；最终交付确认不重复写源目录。
- 2026-10-10 起新 Run 不建立强制 Project Snapshot，不全量备份、哈希或扫描项目。普通开发使用经明确授权的 native/direct，Git 和非 Git 均可进入 Plan/Execute/Review；省略模式的旧 clean-Git 配置仍走 Git 克隆隔离。显式 isolated 仅支持已有提交的 clean Git 克隆；非 Git、Dirty Git 和自动建档隔离副本暂不可用，须显式选择并授权 direct，不能静默切换写入模式。
- `allowedRepositories` 表示授权项目目录，不要求 Git。Controller 运行数据存入项目外的 D 盘 `runtimeDir`。原生 Shell 的权限不是目录技术沙箱。
- `tests: []` 可开发；独立验收记为未通过，进入绑定当前证据摘要的人工验收节点。人工观察完成任务不等于自动测试通过，不能据此自动交付。多任务必须逐项人工验收。
- 原生 CC/Codex 保留本机完整工具、Shell、测试、调试、公开事件与默认模型配置。Controller 保留 Session/Run、调用审计、审查和配置测试。新 Run 的 Git Diff 为辅助证据，包含已有修改；未跟踪、忽略、非 Git 文件及二进制内容不提供完整变化保证，明确标注未验证范围。Project Context 保留模块、契约及 checked_files 定点检查。最终阶段重跑全部配置测试。
- GUI 保留文件夹选择、自动配置、最近项目、三人群聊和详细活动；高级入口保留配置导入与旧 Mock 场景。
- GUI 普通项目默认 Mock、native、direct。直接修改授权与付费调用确认分开记录。
- 本次仅使用新建本地 Mock/进程夹具，不调用付费 Agent、不批准既有交付、不合并 main。

## 2026-10-10 Snapshot 政策变更

用户正式取消 Project Snapshot 作为开发任务的强制前置机制。本次由独立 Codex Desktop 在 fix 分支开发，用户明确授权仅提交该分支；不经 PersonalAgent 付费 Run，不合入 dev/main，不推送。

新 Run 使用 snapshotPolicy: none；兼容字段 snapshotDigest 仅绑定有限 Git/Context 观察，不是全项目内容指纹。Direct Delivery 继续要求显式批准，只确认现有成果且不复制文件；无快照 isolated Run 不允许自动 Apply。全项目 restore 不可用，恢复执行保留现有文件并重跑验收及审查，不复用新 Run 的旧 Review 回执。历史状态、快照、Delivery 和读取逻辑保留，不迁移、不清理。旧记录的历史实现说明只适用于旧 Run。
