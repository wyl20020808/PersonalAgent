# PersonalAgent 开发规则

**默认开发规则（2026-10-11 补充）：PersonalAgent 自身的新开发任务，用户未明确指定基线时，默认从最新 `test` 的明确提交创建独立任务分支和 Worktree，完成后先按审批整合回 `test`。** 不根据当前目录、当前检出分支或发起软件版本改用 DEV/MAIN，也不直接在 TEST 集成工作区改源码。TEST 不可用时报告并核对，不静默回退 DEV/MAIN。仅明确的 DEV 紧急修复从 DEV 创建，MAIN 紧急 hotfix 从 MAIN 创建；用户明确指定的其他基线另行记录。此默认仅适用于 PersonalAgent 自身，其他项目遵循其自身分支规则。

遵循 @AGENT_WORK_RULES.md。

PersonalAgent 三分支开发与使用治理规则 V2（沿用 V1 路径）：@docs/PERSONALAGENT_DEVELOPMENT_GOVERNANCE_V1.md

MAIN 暂留稳定版本；DEV 执行真实任务并固定运行版本；TEST 持续集成和试用。当前可由外部 Codex 开发会话迭代，不要求 MAIN 发起。新功能和普通修复从最新 TEST 明确提交创建独立 feature/fix Worktree，先交付 TEST；完整候选批次验收并获正式交付审批后，在安全节点更新 DEV。DEV 紧急 fix 从 DEV 创建，验收交付后同步 TEST。MAIN hotfix 从 MAIN 创建，必要修复同步 DEV 和 TEST。正式发布 MAIN 仍须用户明确批准。

持续实战改进与问题反馈规则：@problems/README.md

首次参与任务，以及执行分支操作、修改源码、创建 Worktree、集成或发布前，必须读取上述治理规则全文，并读取 AGENTS.md 中的项目约定；不得仅依赖摘要或链接自动加载。规则冲突须列出并处理，不得自行弱化已有约束。

Claude Code 主要负责规划、审查和指导，也可以使用原生工具直接修复必要的小问题。角色分工不限制工具能力。
