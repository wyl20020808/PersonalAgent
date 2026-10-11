# V0.3C 统一执行契约

**默认开发规则（2026-10-11 补充）：PersonalAgent 自身的新开发任务，用户未明确指定基线时，默认从最新 `test` 的明确提交创建独立任务分支和 Worktree，完成后先按审批整合回 `test`。** 不根据当前目录、当前检出分支或发起软件版本改用 DEV/MAIN，也不直接在 TEST 集成工作区改源码。TEST 不可用时报告并核对，不静默回退 DEV/MAIN。仅明确的 DEV 紧急修复从 DEV 创建，MAIN 紧急 hotfix 从 MAIN 创建；用户明确指定的其他基线另行记录。此默认仅适用于 PersonalAgent 自身，其他项目遵循其自身分支规则。

实现与验收来源见 `V03C_UNIFIED_VALIDATION.md`。两份契约文件采用相同定义。

PersonalAgent 自身开发另须全文遵循 [三分支治理规则 V2](docs/PERSONALAGENT_DEVELOPMENT_GOVERNANCE_V1.md)：MAIN 暂留稳定版本，DEV 执行真实任务，TEST 持续集成和试用。新功能和普通修复从 TEST 创建独立任务 Worktree，先交付 TEST；完整候选验收和正式审批后在安全节点更新 DEV。DEV 紧急修复从 DEV 创建并同步 TEST；MAIN hotfix 从 MAIN 创建并同步必要修复到 DEV、TEST。当前可由外部 Codex 承接，不要求 MAIN 发起。此规则不表示 TEST 启动或三实例隔离已经实现，也不改变其他项目自身的分支规则及以下执行模式契约。

- `mode: mock | real` 选择 Agent 来源；`executionMode: native | proposal` 选择执行协议；`projectMode: direct | isolated` 选择工作目录，三个维度分别处理。
- `projectMode` 是规范字段。旧 `workspaceMode` 可读入并迁移；两个字段同时出现且不同必须拒绝。持久化只写 `projectMode`。
- 直接开发必须使用 native，持有匹配真实项目路径的 `directAuthorization: { projectPath, acknowledgedAt }`。修改即时发生；最终交付确认不重复写源目录。
- 2026-10-10 起新 Run 不建立强制 Project Snapshot，不全量备份、哈希或扫描项目。普通开发使用经明确授权的 native/direct，Git 和非 Git 均可进入 Plan/Execute/Review；省略模式的旧 clean-Git 配置仍走 Git 克隆隔离。显式 isolated 仅支持已有提交的 clean Git 克隆；非 Git、Dirty Git 和自动建档隔离副本暂不可用，须显式选择并授权 direct，不能静默切换写入模式。
- `allowedRepositories` 表示授权项目目录，不要求 Git。Controller 运行数据存入项目外的 D 盘 `runtimeDir`。原生 Shell 的权限不是目录技术沙箱。
- 配置 tests 仅作为决策者可选用的验证命令。Controller 不执行这些命令判定成果。执行者提交后由决策者验收，再由用户绑定当前成果确认；无 tests 不阻断审查，多任务逐项确认。用户确认不等于测试已执行，交付仍需独立的明确授权。
- 原生 CC/Codex 保留本机完整工具、Shell、测试、调试、公开事件与默认模型配置。Controller 保留 Session/Run、调用审计、审查和配置测试。新 Run 的 Git Diff 为辅助证据，包含已有修改；未跟踪、忽略、非 Git 文件及二进制内容不提供完整变化保证，明确标注未验证范围。Project Context 保留模块、契约及 checked_files 定点检查。最终阶段重跑全部配置测试。
- GUI 保留文件夹选择、自动配置、最近项目、三人群聊和详细活动；高级入口保留配置导入与旧 Mock 场景。
- GUI 普通项目默认 Mock、native、direct。直接修改授权与付费调用确认分开记录。
- 本次仅使用新建本地 Mock/进程夹具，不调用付费 Agent、不批准既有交付、不合并 main。

## 2026-10-10 Snapshot 政策变更

用户正式取消 Project Snapshot 作为开发任务的强制前置机制。本次由独立 Codex Desktop 在 fix 分支开发，用户明确授权仅提交该分支；不经 PersonalAgent 付费 Run，不合入 dev/main，不推送。

新 Run 使用 snapshotPolicy: none；兼容字段 snapshotDigest 仅绑定有限 Git/Context 观察，不是全项目内容指纹。Direct Delivery 继续要求显式批准，只确认现有成果且不复制文件；无快照 isolated Run 不允许自动 Apply。全项目 restore 不可用，恢复执行保留现有文件并重跑验收及审查，不复用新 Run 的旧 Review 回执。历史状态、快照、Delivery 和读取逻辑保留，不迁移、不清理。旧记录的历史实现说明只适用于旧 Run。


## 决策者验收、用户确认（2026-10-11）

本次按用户明确要求修订验收职责：执行者提交实际成果与自测记录，配置的决策者（双决策模式为主决策者）自行判断验收方法、运行必要验证并给出结论，再交用户最终确认。Controller 只负责信息传递、上下文保护、顺序调度、运行恢复、审计及权限/授权记录；不执行一套固定测试替决策者或用户判定成果成功或失败，也不以 tests 为空、程序检查结果、Diff 告警或 Context 报告自动否决决策者结论。观察记录原样交给决策者及用户。

决策者 pass 后保持暂停等待用户；human 交用户决定；rework 才调度执行者返工；fail 原样记录决策者终止意见。用户可在聊天明确发送“验收通过”确认当前成果；“继续”不代表批准。确认绑定当前 Run、任务、轮次、审查结论和已观察成果摘要，变化后重新审查，不重放已完成执行。测试未执行时保持 passed=false，不虚报测试通过。用户确认与正式交付批准分别记录；锁、路径权限、进程异常和证据有效性约束仍保留，运行异常不得冒充成果验收失败。历史 independent-check 审计保留原事实；旧验收顺序不再指导新流程。

本任务由外部 Codex 在独立 Worktree 开发，显式采用用户提供的 V2.1 条件式本地 TEST 集成授权；不依据此 Worktree 的旧 V2 摘要要求重复审批。DEV/MAIN 更新、实例替换、推送和发布仍须对应授权。
