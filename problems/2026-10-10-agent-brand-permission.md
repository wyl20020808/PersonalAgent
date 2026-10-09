# Agent 品牌素材的公开分发许可仍需确认

- 现象：第一阶段引入官方本地 SVG；Anthropic 官方商标指南要求特定许可及使用材料预先批准，公开 Press Kit 没有开源许可文本。
- 场景：PersonalAgent Agent 卡片、群聊头像和身份展示；属于 PersonalAgent 的分发治理问题。
- 影响：官方素材来源可追溯，但不能宣称已取得自由再分发或品牌合作授权。本机 UI 验证不等于公开发行授权。
- 证据：[Anthropic Trademark Guidelines](https://www.anthropic.com/legal/trademark-guidelines)，以及 `desktop/src/assets/agents/README.md` 中的下载来源、哈希与使用边界。
- 已确认：本次没有联系厂商、取得额外许可，也没有发布产品。OpenCode MIT 许可已保留；OpenAI 使用条件已核对。
- 状态：待处理。公开分发前需解决 Anthropic 素材许可，必要时改用许可明确的官方资源。
- 下一步：由后续发布负责人确认适用授权或取得批准，不由 Agent 自动发送授权申请。
