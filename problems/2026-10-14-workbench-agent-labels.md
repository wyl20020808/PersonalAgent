# 工作台和运行详情仍使用固定 Agent 名称

- 状态：待处理；归属 PersonalAgent，2026-10-14 Mac GUI 实机验收自行发现。
- 场景：真实 Run `632a1853-c2fb-4e46-805a-2fdf7ec80365` 的决策者为 Codex（gpt-6.1-sol），执行者为 Codex。
- 现象：工作台协作栏仍显示 Claude Code 规划/审查，调用统计使用 CC 标签；运行详情对 Codex 决策者也回退成 Claude Code。聊天实际事件与项目预览的决策者身份正确。
- 已确认原因：`desktop/src/App.tsx` 的 dashboard Agent 数组硬编码 Claude Code/Codex；run 协作状态仅对 OpenCode 作分支，未处理 Codex。`GroupWorkspace.tsx` 的流式能力说明仍固定 CC 文案。
- 影响：误导用户对实际角色、调用次数和能力的判断；本次真实规划、执行、暂停恢复和验收使用正确后端，未发现路由错误。此项显示验收不通过，不阻断继续试用。
- 下一步：根据 Run 中的决策/执行配置统一生成角色名称及统计标签，覆盖三后端组合，并实机复测工作台、详情和预览一致性。不要改写既有调用审计。
