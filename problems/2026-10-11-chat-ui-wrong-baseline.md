# 聊天区改动使用了旧 MAIN 基线

状态：待处理（已有修改保留，修复另在 DEV 基线开发）。

现象：本对话前序修改落在 `D:/PersonalAgent` 的 main 工作区。当前 main 为 `aff8024`，DEV 为 `32ec301`。main 有大量混合的未提交修改，头像组件、资源及 Agent capabilities 文件为未跟踪文件。DEV 已有官方头像和决策/执行身份投影；不能用旧 MAIN 的组件缺失推断 DEV 删除了头像。

影响：在旧基线上补 UI 会遗漏多决策者和 OpenCode 执行者上下文；混合修改不能整体覆盖、重置或直接交付。

处理：本次从 DEV `32ec301e59868db120904c873ca123f6fc9b7743` 建立 `fix/chat-ui-audit-20261011`，只修改独立工作区。官方资源沿用 DEV 的 `AgentLogo.tsx` 与 `assets/agents`，未重新下载或替换品牌。

后续：MAIN 原有混合修改需要单独按任务归属梳理；正式集成需检查 `chat-first-ui` 和 `chat-workbench-p0-p1` 的重叠修改。本次不回滚其他任务，不改运行数据，不提交、合并或发布。
