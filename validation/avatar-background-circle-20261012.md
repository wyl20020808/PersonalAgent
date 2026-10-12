# 聊天头像背景圆框修复

执行方：外部 Codex。任务分支：`fix/avatar-background-circle-20261012`。
基线：TEST `6e70029f1e61bc8d79a281e17a309e9bbd9a5e5f`。
独立工作区：`D:/PersonalAgent-worktrees/tasks/avatar-background-circle-20261012`。

聊天内层 `.agent-logo` 继承通用样式的白色背景、1px 边框和 5px 内边距，头像图片放大后露出小圆框。修复仅清除聊天内层 Logo 的背景、边框、内边距与阴影，保留其他位置的 Logo 样式。

验证结果：

- `node .validation/avatar-check.mjs`：通过。旧基线复现边框与内边距；OpenCode、Codex、Claude 三种头像加载正常，在 800px 和 480px 视口均无背景装饰；侧栏 Logo 样式保持。截图已查看。
- `npm run build`：通过。
- `npm --prefix desktop run build`：通过。首次桌面构建因独立工作区缺少根项目 dist 失败；先构建根项目后复验通过。
- `git diff --check`：通过。

本地无头验证脚本、结果和前后截图保存在任务工作区 `.validation/`。这是 CSS 场景自测，不等同于实际 Electron 窗口验收。实际运行窗口验收尚未执行；未启动或替换运行实例。
合入本地 TEST 时持有 Git common directory 中的 `personalagent-test-integration.lock`，核对目标干净与基线未变化，合并后重新运行无头头像检查。合并前后提交和检查结果记录到 common directory 的任务集成 JSON。DEV、MAIN 不变，不推送远程。
