# PersonalAgent 开发规则

**默认开发规则（2026-10-11 补充）：PersonalAgent 自身的新开发任务，用户未明确指定基线时，默认从最新 `test` 的明确提交创建独立任务分支和 Worktree，完成后先按审批整合回 `test`。** 不根据当前目录、当前检出分支或发起软件版本改用 DEV/MAIN，也不直接在 TEST 集成工作区改源码。TEST 不可用时报告并核对，不静默回退 DEV/MAIN。仅明确的 DEV 紧急修复从 DEV 创建，MAIN 紧急 hotfix 从 MAIN 创建；用户明确指定的其他基线另行记录。此默认仅适用于 PersonalAgent 自身，其他项目遵循其自身分支规则。

遵循 [统一 Agent 工作规则](AGENT_WORK_RULES.md)。

真实模型调用及真实场景测试已获用户持续授权；遵循统一规则中的真实验收与 Token 节约条款，无须为正常验收重复请求付费调用确认。

所有参与 PersonalAgent 开发、执行、规划和审查的 Agent，必须读取并遵守 [持续实战改进与问题反馈规则 V1](problems/README.md)。

## 项目分支与自我迭代治理规则

所有参与 PersonalAgent 开发的 Agent，在执行分支操作、修改源码、创建 Worktree、集成或发布前，必须主动读取并遵循 [PersonalAgent 三分支开发治理规则 V2](docs/PERSONALAGENT_DEVELOPMENT_GOVERNANCE_V1.md) 全文；不能只读取本摘要或依赖 Markdown 超链接自动加载。首次参与任务时应先读取，续接任务时确认规则版本是否变化。文件路径沿用 V1，正文版本以 V2 为准。

`main` 暂时保留经用户认可的稳定版本，不要求参与日常开发；`dev` 是执行真实任务的干活版本，任务期间固定运行版本；`test` 是持续集成与新功能试用版本。当前可由外部 Codex 开发会话承接 PersonalAgent 自身迭代，不要求先运行 MAIN。新功能和普通修复从最新 `test` 的明确提交创建独立 `feature/*`、`fix/*` 分支及 Worktree，按验收和正式交付审批先整合到 `test`；TEST 完整候选批次验收后，在 DEV 安全更新节点按审批交付 `dev`，不得夹带未验收功能。DEV 紧急修复从当前 `dev` 创建独立 `fix/*`，验收和审批后更新 DEV，再同步回 TEST。`hotfix/*` 从 `main` 创建，获批准更新 MAIN 后同步必要修复到 DEV 和 TEST。发起软件版本不决定 Git 基线。只有用户明确批准，才可将达到稳定标准的 `dev` 发布到 `main`。

继续遵守统一规则中的 Controller 正式交付审批、Agent 不自行提交或合并、同一 Run 顺序调度及预算约束。跨任务并行须使用独立分支和 Worktree。发现文档冲突时，列出冲突和影响，在授权范围内处理；未解决前不得自行忽略或弱化现有约束。上述分支和目录是长期治理约定，不代表已经创建或实现自动管理。

本机开发时遵循 `C:\Users\WYL20\.codex\RTK.md`；默认加载并持续使用 `caveman` 技能，除非用户明确停用。报告、验证文档使用正常中文。

## PersonalAgent 操作方式

默认通过脚本、CLI、API 或已有 Controller/服务接口操作 PersonalAgent，包括创建项目、配置预算、启动真实 Agent Run、查询进度、恢复执行及验收。不要使用鼠标、键盘或 GUI 自动化来完成这些操作，除非用户明确要求。

GUI 可用于显示真实运行过程；展示 GUI 不代表必须通过 GUI 操作。用户已明确授权的目录、调用预算和执行方式应直接用于脚本调用，不要重复要求 GUI 确认。未获授权的预算扩大、推送、发布及正式成果审批仍须遵守原有规则。

游戏等项目必须由 PersonalAgent 的真实 Claude Code、Codex 和 Controller 流程完成。脚本应调用正式实现，不得绕过调用计数、恢复机制或验收规则，也不得由当前开发会话代写全部成果冒充双 Agent 产出。
