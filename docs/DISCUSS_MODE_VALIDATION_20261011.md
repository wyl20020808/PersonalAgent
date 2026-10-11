# 讨论模式验证记录

任务：discuss-mode-20261011。执行方：外部 Codex 开发会话。基线：本地 TEST `791af1740ed222212b38a90b828fcd3ce09a1dd0`。任务分支：`feature/discuss-mode-20261011`。独立 Worktree：`D:/PersonalAgent-worktrees/tasks/discuss-mode-20261011`。

本任务显式采用用户提供的治理规则 V2.1 和条件式本地 TEST 集成授权，优先于基线工作区中的旧 V2 摘要。没有替换运行实例、更新 DEV/MAIN、推送或发布。开发过程中全局策略读取为 idle；没有操作用户桌面或用户浏览器。

## 行为

- 新会话输入框旁的“工作方式”下拉新增“先讨论 · Discuss”；同一输入框支持 `/discuss` 或 `/discuss 问题`，大小写不敏感。
- 讨论仅调用所选决策者，双决策配置使用主决策者；不派发执行者，不创建开发 Run，不修改项目文件。讨论阶段不申请直接开发写入授权。
- Claude 的讨论调用仅提供 Read/Glob/Grep，关闭该次调用的外部 MCP；OpenCode 的讨论 Session 默认拒绝工具，只允许只读检索工具；Codex 沿用现有只读沙箱及关闭网络/网页搜索的决策适配器。项目权限约定和这些调用配置不等于整个机器的权限隔离。
- 回复、候选方案、讨论状态和原生 Decision Session 持久化；真实调用及用量沿用现有审计记录，讨论元数据拥有独立 purpose，Controller 拒绝将其当作开发 Run 调度。
- 用户查看当前候选方案，选择直接或隔离开发，点击“开始执行”才创建新的正式开发 Run；同一会话保留讨论记录。首次直接开发沿用原有目录授权。
- 讨论中的“继续”“开始执行”等自然语言仍然只讨论；运行中或未结束的开发任务不会被 `/discuss` 中断、恢复或隐式排队。重复点击相同消息 ID 不重复派单。讨论失败及未完成消息阻止执行旧方案。

## 自测

以下为开发者自测，不是 Controller 独立验收。

- 根目录 `npm test`：461/461，通过，退出码 0；包含讨论元数据所有权、只读请求、禁止 drive 调度、原有决策/执行适配器及恢复回归。
- `desktop/npm test`：138/138，通过，退出码 0。随后审查修正了回复角色映射、模式通知和执行失败恢复；最终 `node --import ../scripts/regression-policy.mjs --test --test-name-pattern "Discuss|discussion|/discuss" out/sessions.test.js out/workbench.test.js`：5/5，通过，退出码 0。
- 根目录 `npm run build`、`desktop/npm run check`、`desktop/npm run build`：通过。构建保留既有体积及第三方 use-client 提示，不作为功能失败。
- `desktop/node_modules/.bin/electron.cmd discuss-ui-check.cjs`：通过，退出码 0。独立 userData、隐藏窗口，实际 React/Electron 测试渲染器验证下拉、讨论标记、决策者回复、方案预览、执行方式和一次派单；窗口始终不可见，未操作用户鼠标/键盘/浏览器。

## 真实调用

通过生产 DesktopService/SessionStore 接口，在独立临时项目中真实调用 Claude Code 两轮：先讨论问候按钮，再将按钮文字改为“你好”。第二轮更新完整候选方案，持有同一原生 Decision Session。两轮实际回复成功，`claudeCalls=2`、`loops=0`、开发 Run 数为 0，项目 `user.txt` 保持原内容；重新创建 DesktopService 后 `chatMode=discuss`。

证据：`D:/PersonalAgent-data/validation/discuss-mode-ce6e95f2-103f-4583-b3d8-a6fe56291105/evidence.json`。这是实际决策者会话测试，没有冒充完整开发或执行验收。Codex/OpenCode 的本次聊天讨论未进行真实服务端验收，现有适配器回归通过。

## 边界与集成

用户可见的实际 PersonalAgent 窗口验收尚未进行。隐藏测试渲染器和真实 Claude 会话分别验证 UI 流程与原生讨论，不能代替用户桌面试用。

本地 TEST 集成使用 Git common directory 中的 `personalagent-test-integration.lock`。整合前核对目标干净、无进行中的 Git 操作和基线变化；持锁完成提交与正常 Git 合并，整合后核查 source tree 与任务最终内容一致，并在独立任务 Worktree 复验最终组合。TEST 运行产物、用户真实数据和活跃实例不在本任务替换范围。
