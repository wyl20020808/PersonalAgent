# 决策卡片占用聊天下方且预览无法多开

- 归属：PersonalAgent Desktop。
- 现象：用户截图中，“需要你参与的节点”位于聊天输入框下方；项目文件预览只有一个选中项，截图使用弹窗，无法在同一右栏切换多个预览。
- 影响：查看决策需要离开聊天视区；比较文件、截图需要反复打开。
- 已确认原因：`GroupWorkspace.tsx` 在 `conversation-row` 外渲染决策与截图，`ProjectExplorer.tsx` 仅保存一个 `selected` 文件。
- 当前状态：独立任务分支实现完成，自测通过；尚未整合到 dev，Controller 独立验收、CC 审查、真实 Electron 与人工验收待完成。
- 修复：右栏加入可切换、关闭、键盘选择的标签；项目文件与可信截图分别打开，重复打开复用标签；暂停节点自动打开决策标签；窄窗口使用右侧抽屉。
- 证据：`desktop/validation-sidebar/result.json`、`desktop.png`、`1000.png`、`700.png`。这些属于隔离 UI 夹具测试，不代表真实 Run 的视觉验收。
- 下一步：按正式流程审查、验收与批准后整合 dev。
- 用户视觉反馈：初版标签字号小、布局碎片化，重复工具栏不符合 Codex 浏览器标签的参考风格。已优化为圆角宽标签、类型图标、新标签页入口、路径栏与分区内容；视觉认可仍待用户检查。新截图见 `refined-sidebar.png` 和 `refined-new-tab.png`。
