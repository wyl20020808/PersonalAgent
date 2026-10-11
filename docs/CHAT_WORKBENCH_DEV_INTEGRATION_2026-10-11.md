# 聊天工作台 DEV 集成验证

日期：2026-10-11。

用户明确要求“把这些全部都合进到 DEV 里面去”。本次以此作为本会话成果的提交和 DEV 合并授权；不扩大到 MAIN、远程推送或其他任务分支。

## 来源与组合

- DEV 基线：`e893925c1335c66ad6af31bd37699774d1f737f2`。
- 本会话功能提交：`4cac7f4`，来源 `codex/chat-workbench-p0-p1`。
- 集成工作区：`D:/PersonalAgent-worktrees/tasks/chat-workbench-dev-integration-20261011`。
- 集成分支：`fix/chat-workbench-dev-integration-20261011`。
- MAIN 保持 `aff80240342176ec196fedb2028905f489afced9`。

组合保留 DEV 的协议解析、真实工具状态、角色分边、官方图标及证据入口；加入本会话的原生多模态、附件预览、统一聊天派发、后台刷新、文件侧栏、复制操作、加载反馈和精简消息展示。命令默认折叠，卡片按内容收缩且最大为聊天内容区的一半，其他页面不再提供独立新任务入口。

`desktop/build.mjs` 和 `GroupWorkspace.tsx` 冲突逐项合并，未整体取舍任一方。组合后的生产 CSS 和真实 React/Electron 离屏测试使用一致加载顺序。

## 实际验证

命令均经 `rtk proxy` 执行，全部在独立集成目录中运行。

- `npm run build`：通过。
- `npm --prefix desktop run check`、`npm --prefix desktop run build`：通过。
- `npm --prefix desktop test` 对应的五个测试文件串行执行：101/101 通过。
- 后端 multimodal、codex-decision-agent、opencode-execution-agent：43/43 通过。
- 后端 native-agent、decision-agent、agent-capabilities、process-stream：45/45 通过。
- `npm --prefix desktop run test:workbench-ui`：通过。检查附件粘贴/移除/发送、预览、加载反馈、文件预览竞态、角色左右位置、半宽卡片、命令折叠、统一发送和六个页面的任务入口。
- `node desktop/test/validate-chat-audit.mjs`：5 个解析测试、8 项 headless UI 检查通过。
- `git diff --cached --check`：通过。

桌面首轮 100/101；失败在原 DEV 同样复现：旧事件夹具遗漏 `source: codex-sdk-runStreamed`。修正夹具后全套重跑 101/101，未放宽生产状态识别规则。

本次证据保存在集成目录 `.v3c3/integration/`，离屏截图在 `.v3c3/workbench-preview/`。现有 DEV 审计截图没有覆盖；新组合截图单独保存。

这些结果是开发集成自测，含本地模拟服务和真实本地 Controller 测试路径，不是本次成果的独立 Controller 验收或 CC 审查。没有制造 Run 或交付审批记录，没有绕过产品内正式成果批准。未运行全库回归、真实远端模型多模态验收、可见桌面验收或重启后历史任务恢复验收。

## 安全更新

更新前检查 DEV 进程与 Git 状态，无相关运行进程且追踪文件干净才执行快进合并。既有未跟踪文件保留；源码和桌面产物完成构建即可供下次启动使用，不自动启动窗口。会话、配置和共享交互策略用 SHA-256 前后核对；不修改这些数据。
