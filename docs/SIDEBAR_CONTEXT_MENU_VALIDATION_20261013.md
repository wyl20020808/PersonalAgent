# 侧栏项目与会话右键菜单

执行方：外部 Codex 开发会话。规则：PersonalAgent V2.1（含 2026-10-12 补充）。

基线：本地 TEST `f1262b97be7dbabaa503aab37eb48a0806b16de4`。
任务分支：`feature/sidebar-context-menu-20261013`。
工作树：`D:/PersonalAgent-worktrees/tasks/sidebar-context-menu-20261013`。

项目菜单提供新建会话、新建并行会话、重命名、打开项目文件夹、复制项目路径、删除项目。会话菜单提供打开会话、重命名、打开项目文件夹、复制项目路径、删除会话。右键、会话省略号及 Shift+F10 可打开菜单；支持方向键、Tab、Escape、点击外部关闭。

项目重命名修改显示名称，不移动磁盘文件夹；并行会话更新所属项目名称，执行目录不变。删除需要界面确认，只移除侧栏记录并保留原始会话、项目文件和 Run 数据。软删除记录继续占有 Run 的导入关联，防止轮询或重启重新导入已删除会话。删除当前会话后回到新会话。项目删除先检查整个会话组，运行中、消息处理中、待处理消息和历史状态不可用时拒绝删除。

## 自测

- 根目录 `rtk npm run build`：退出码 0。
- desktop `rtk npm run check`：退出码 0。
- desktop `rtk npm run build`：退出码 0；现有打包体积及 lucide-react 指令警告，不影响构建。
- desktop `rtk npm test`：退出码 0，173/173 通过。包括新增的三组侧栏持久化、Run 保留、并行归组、原子预检、运行锁及待处理消息检查。
- desktop `rtk node test/validate-sidebar-menu.mjs`：退出码 0。使用隔离 headless Chromium、实际构建的 App 与显式 IPC 夹具，验证项目/会话右键、会话省略号、键盘菜单、重命名、路径/目录请求、删除取消与确认。
- 清理旧内联重命名入口后重跑类型检查、桌面构建和上述 headless 菜单验收，均退出码 0。

## 验收边界

全局策略读取为 idle，未修改策略。仅使用隔离 headless 浏览器，没有控制用户浏览器或桌面。Serena 激活了任务工作树，但无可用语言服务，使用限定文本搜索。

真实 Electron 右键界面、资源管理器打开目录及系统剪贴板效果：pending/manual-required。Headless 验证只确认对应 IPC 请求，不冒充原生操作验收。

未启动或替换运行实例，未迁移真实数据；DEV/MAIN 不更新，未推送或发布。运行构建提交未核验，本任务不改变现有运行版本。自测不等于 Controller 独立验收；没有创建真实 Agent Run。
