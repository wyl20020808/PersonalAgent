# 消息布局依赖品牌，验收卡片缺少可读层次

状态：修复完成，自测通过，待正式验收与集成。

证据：DEV `group.css` 末尾把 Claude Code 和 OpenCode 消息统一设为右侧；Codex 也默认右侧。用户要求按任务角色区分，而同一品牌能同时承担决策和执行。Controller 卡片受旧样式叠加影响，内容、验收命令和 Diff 层次不清。

处理：新增按角色计算的消息布局；决策左、执行右、用户居中。分组增加角色边界，避免同品牌跨角色混组。保留既有官方图标。使用独立消息样式修复内边距、对比度、窄屏换行和工具折叠；保留原始审计证据。

验证：`desktop/test/validate-chat-audit.mjs` 用真实 React 消息组件和隔离 Mock 数据，在 headless Chromium 检查左右位置、用户中心、三种图标成功加载、卡片内边距、失败输出、分组展开和 480px 无横向溢出。截图在 `desktop/validation-chat-audit/`。不代表实际 Electron 或真实模型验收。
