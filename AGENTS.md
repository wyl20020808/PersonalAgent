# PersonalAgent 开发规则

遵循 [统一 Agent 工作规则](AGENT_WORK_RULES.md)。

本机开发时遵循 `C:\Users\WYL20\.codex\RTK.md`；默认加载并持续使用 `caveman` 技能，除非用户明确停用。报告、验证文档使用正常中文。

## PersonalAgent 操作方式

默认通过脚本、CLI、API 或已有 Controller/服务接口操作 PersonalAgent，包括创建项目、配置预算、启动真实 Agent Run、查询进度、恢复执行及验收。不要使用鼠标、键盘或 GUI 自动化来完成这些操作，除非用户明确要求。

GUI 可用于显示真实运行过程；展示 GUI 不代表必须通过 GUI 操作。用户已明确授权的目录、调用预算和执行方式应直接用于脚本调用，不要重复要求 GUI 确认。未获授权的预算扩大、推送、发布及正式成果审批仍须遵守原有规则。

游戏等项目必须由 PersonalAgent 的真实 Claude Code、Codex 和 Controller 流程完成。脚本应调用正式实现，不得绕过调用计数、恢复机制或验收规则，也不得由当前开发会话代写全部成果冒充双 Agent 产出。
