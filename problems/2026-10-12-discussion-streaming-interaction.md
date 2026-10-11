# 讨论发送阻塞及决策者输出过于冗长

状态：源码修复完成；TEST 集成待核对；活跃 DEV 尚未更新。

用户在 OpenWorld 的真实 Discuss 会话反馈：发送及继续讨论一直显示“正在提交”，直到 Claude 完整响应后才进入对话；决策者工具记录、字符计数占据大块卡片，回复表格未渲染。

已确认原因：Session.send 等待完整讨论调用，前端完成调用后才打开会话和清空输入。原生工具活动已有审计，但讨论会话未投影到线程。Markdown 未启用 GFM 和公式插件。桌面内调用的 Hook 默认使用 Electron process.execPath，新增调用改用已配置 Node，保留原 Hook 和交互策略。

修复：消息先持久化并快速返回，模型后台运行；连续消息有序排队，保留编辑、取消、失败后人工重试及关闭时取消语义。只向界面推送公开文本及真实工具事件；方案校验和明确开始执行边界保留。决策者与执行者共用简洁操作组，默认隐藏字符计数和原生调用元数据，详细模式保留。共享 Markdown 支持 GFM 表格及美元符号 LaTeX，禁用 HTML 和可信公式指令。

开发：外部 Codex；基线 TEST 3753a5083c8d2ba1aaa6cd4ebdf94c93a6327cf3；工作树 D:/PersonalAgent-worktrees/tasks/discuss-async-send-20261011；分支 fix/discuss-async-send-20261011。

验证：桌面全套回归 142/142；后续变更相关线程/会话回归 83/83 及新增针对性用例；核心公开流/讨论约束 6/6；原生决策适配器回归 38/38；根构建、桌面类型检查与构建通过。隐藏隔离 Electron 实际界面检查验证即时确认、清空输入、连续讨论排队、完成前草稿、紧凑工具、表格及行内/块公式和代码块。此界面检查使用 Mock，不等于真实提供商 GUI 验收。

真实 Claude Sonnet 验证：独立项目只读 user.txt；消息确认 196ms，工具首次投影 5452ms，公开草稿 6771ms，回复完成 8888ms；未派发开发、源文件保持原样。证据 .v3c3/discussion-native-75cf2deb-8472-402f-ab39-56c83019d830/result.json。真实 Codex/OpenCode Discuss 调用未在本次重新付费验证，适配器回归及公开流解析用例已通过。

独立 Claude 只读代码审查指出增量事件消耗 proposal 活动限额；修正为流式快照不占普通工具额度，新增回归，保留原普通活动限额。复审指出排队停止后的假转圈、工具/回复顺序、讨论记录异常和多消息 JSON 草稿问题，均修正并新增用例；最终相关桌面 10/10、核心 6/6 与隐藏界面复验通过。核心最终只读复审 PASS，桌面修复以此前审查问题逐项复验，不声称最终复审读取了桌面全部代码。Codex/OpenCode 原有公开文本事件已实时记录，新增原生消息 ID 合并累计快照。DEV 真实任务持续运行，未覆盖源码、构建、会话、Run 或恢复任务。

TEST 独立桌面依赖已从任务依赖复制；原指向 DEV 的 junction 保存在 D:/PersonalAgent-data/dependency-backups/test-desktop-node_modules-discuss-20261012，DEV 依赖未修改。真实调用修正后复验仍通过：确认 190ms、完成 8847ms，证据 .v3c3/discussion-native-b7b5a7cc-b744-44f5-99d3-46eb6709c3f2/result.json。未启动或重启用户实例，未推送或更新 MAIN。
