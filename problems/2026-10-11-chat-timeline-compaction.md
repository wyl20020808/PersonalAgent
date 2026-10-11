# 聊天文件列表和执行事件过长

状态：源码修复与自测通过；真实运行界面试用待验收。TEST 活跃实例阻碍本轮集成，已提交任务成果，待安全停止 TEST 后合并。

用户提供的截图显示大量文件卡片及执行事件挤占聊天空间。TEST 基线中的文件列表已经默认整体折叠，但没有用户要求的前三项预览；执行事件仅在 category 完全一致且审计连续时合并，命令和文件操作交替时会拆分。原分组也可能合并连续正文，工具输出为空时仍展示“无输出”栏目。

本轮修改：文件默认显示前三项，其余显示剩余数量并可展开、收起。简洁模式将同执行者、同 Run/任务/轮次/调用的连续工具记录合并为可展开摘要；单条工具也默认折叠。公开正文保留为分隔点。失败、阶段和身份边界保持独立；不合并跨越不可见审计事件的记录。空执行输出从简洁视图隐藏，详细模式保留；空命令输出栏目移除。原始审计和文件预览接口不变。

执行方：外部 Codex 开发会话，无 PersonalAgent 真实 Agent Run。本任务显式接入用户提供及主目录完整读取的 V2.1；TEST 中仍有 V2 旧审批文字，按本次用户指令中的持续授权执行，不夹带规则文件修改。

基线：test `a5d83a9fb01f6547bb32ad729f5f03f8d9b67f42`。
任务分支：`fix/chat-timeline-compaction-20261011`。
工作目录：`D:/PersonalAgent-worktrees/tasks/chat-timeline-compaction-20261011`。

验证（2026-10-11）：

- 根目录 `rtk npm run build`：退出码 0。
- desktop `rtk npm run check`、`rtk npm run build`：退出码 0。首次类型检查与根构建并行，因 dist 尚未生成失败；根构建完成后复验成功。构建保留既有包体积和 lucide 指令警告。
- desktop `rtk proxy node --import ../scripts/regression-policy.mjs --test --test-concurrency=1 out/threadGrouping.test.js out/thread.test.js out/sessions.test.js out/fileChanges.test.js`：77/77，通过。
- 加入空 OpenCode receipt 用例后，重建并执行 `rtk proxy node --test out/threadGrouping.test.js`：4/4，通过。
- desktop `rtk proxy node test-chat-compaction.mjs`：退出码 0。隔离、隐藏、offscreen Electron 组件测试覆盖文件 3/5/3 展开收起、文件点击、事件摘要展开收起、公开正文、失败输出和空输出隐藏。没有操作用户桌面或浏览器，不是实际业务 Run 或 Controller 独立验收。
- `rtk git diff --check`：通过。

集成检查：原子独占创建 Git common directory 下的 `personalagent-test-integration.lock`，持锁重新核对 test 仍为基线提交且工作区干净。检测到 TEST 主进程 PID 43532，命令行为 `electron.exe D:/PersonalAgent-worktrees/test/desktop`。按 V2.1“不覆盖正在运行的软件源码、构建产物或状态文件”及“本次授权不包含迁移数据、启动或替换运行实例”，延后合并；只释放本任务锁。

实际运行构建未替换或重启。下一步：获授权安全停止 TEST 后合并并验证组合，在 TEST 试用真实聊天历史，确认长会话阅读体验；DEV/MAIN 交付遵循另行审批。
