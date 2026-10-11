# PersonalAgent 开发规则

遵循 @AGENT_WORK_RULES.md。

PersonalAgent 三分支开发与使用治理规则 V2（沿用 V1 路径）：@docs/PERSONALAGENT_DEVELOPMENT_GOVERNANCE_V1.md

MAIN 暂留稳定版本；DEV 执行真实任务并固定运行版本；TEST 持续集成和试用。当前可由外部 Codex 开发会话迭代，不要求 MAIN 发起。新功能和普通修复从最新 TEST 明确提交创建独立 feature/fix Worktree，先交付 TEST；完整候选批次验收并获正式交付审批后，在安全节点更新 DEV。DEV 紧急 fix 从 DEV 创建，验收交付后同步 TEST。MAIN hotfix 从 MAIN 创建，必要修复同步 DEV 和 TEST。正式发布 MAIN 仍须用户明确批准。

持续实战改进与问题反馈规则：@problems/README.md

首次参与任务，以及执行分支操作、修改源码、创建 Worktree、集成或发布前，必须读取上述治理规则全文，并读取 AGENTS.md 中的项目约定；不得仅依赖摘要或链接自动加载。规则冲突须列出并处理，不得自行弱化已有约束。

Claude Code 主要负责规划、审查和指导，也可以使用原生工具直接修复必要的小问题。角色分工不限制工具能力。
