# 聊天图片记录与预览

执行方为外部 Codex 开发会话。基线为 TEST `cb2a41e5b6fc0792ddc2f9f97abc968e3e0ee573`，任务分支 `feature/chat-image-receipts-20261012`，独立工作树 `D:/PersonalAgent-worktrees/tasks/chat-image-receipts-20261012`。本任务不升级 DEV，不改校园或小地图的业务源码、模型和决策规则。

聊天工具记录识别 PNG、JPEG、GIF、WebP 的本地路径。操作列表折叠时仍展示图片名称和入口，成功查看的图片按路径去重计数；处理中、失败和写入图片分别显示实际状态，不把生成、读取中或失败记录冒充查看成功。点击图片名称复用只读文件预览，支持刷新和展开。公开输出里的本地 Markdown 图片展示缩略图，也可点击预览；远程图片与非文件协议不会自动加载。文件删除、读取失败或超出既有预览限制时保留实际错误提示。

OpenCode 原生 read 与 Claude Code 的 Read 图片输入均可展示。Claude Code 的工具结果按同一调用 scope 和 tool_use_id 关联原始路径，更新完成状态并保留最新原始审计入口。Codex MCP 的图片路径及公开 view_image 字面量可识别；不执行输入中的代码，不从任意输出文本猜测图片路径。

真实检查发现 SDK 0.161 未输出原生 ImageView 事件。补充读取当前绑定 Codex Thread 的原生日志：核对 Session ID、工作目录、当前调用开始时间和事件 Thread ID，只转发公开的已完成 ImageView。增量、分块读取，跳过过大的行，处理半行与 UTF-8 边界；不向聊天转发其他消息、推理或图片字节。缺失、不明、不同工作目录及旧调用事件不推断为图片回执。此辅助观察不改变 Controller 成败判定、预算、任务恢复或验收结论。

图片读取沿用原有事件成员校验与本地只读预览；本地 file:// URI 和 Windows 路径规范化后仍须出现在该条事件中，不增加任意文件读取入口。预览展示当前文件内容，不声称是不可变的历史截图，也不把用户查看图片当作正式验收。

验证：根构建、桌面构建、桌面类型检查通过。核心原生事件/图片观察 23 项、与重试及 Codex 决策组合 43 项、桌面线程与文件预览组合 44 项通过；最终图片路径和解析复验通过。隔离 headless 真实 React 组件在 1280/480px 验证折叠图片入口、查看数量、点击解码、删除提示、生成图片缩略图、远程图片不加载及无横向溢出。浏览器使用独立上下文和任务专属 Vite 缓存，不操作用户浏览器或桌面。可见 Electron 整窗验收未执行，不冒充该项通过。

真实 Codex `gpt-6.1-sol / medium` 调用共两次。首次暴露 SDK 事件缺口，第二次 Run `f35b22a5-b466-4cfe-8df9-0e2de3c775b6` 成功捕获原生查看记录；实际 DesktopService 从该条回执读取了同一 PNG 的 8228 字节。原生审计保存在 `.validation/native-image-1791794525076/`，预览结果为 `.validation/native-image-preview-result.json`。Claude/OpenCode 图片故障场景使用明确标注的确定性回执夹具，不冒充真实上游故障或全后端远程验收。

其他证据：`.validation/image-native-final-tests.log`、`.validation/image-recovery-combination.log`、`.validation/image-final-ipc-tests.log`、`.validation/image-file-final-tests.log`，以及 `desktop/.validation/chat-images/result.json` 和两种宽度的界面截图。既有真实业务任务和 DEV 运行版本保留。
