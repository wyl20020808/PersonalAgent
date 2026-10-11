# 运行中任务缺少旋转状态提示

- 现象：侧栏运行中的会话只有蓝色静态点，用户期望类似 Codex 的旋转加载圈。
- 场景及影响：任务执行期间，静态点无法直观表达持续工作状态。
- 证据：用户提供截图；`desktop/src/App.tsx` 的 `sessionRow` 对活跃阶段使用 `session-state`，原 CSS 为 7px 蓝色实心点。
- 原因：原图标为静态元素，没有旋转动画。
- 状态：任务分支已解决；尚未正式交付或整合 DEV。
- 验证：类型检查、构建、独立 headless 页面及隔离 Electron 44.7.0 的旋转、选中会话、状态切换检查通过；已查看 Electron 截图，详见 `TASK_RUNNING_SPINNER_VALIDATION.md`。
- 下一步：待 DEV 当前任务安全结束，再按正式交付流程整合。
