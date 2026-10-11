# 原生多模态与附件预览

本次继续在 `codex/chat-workbench-p0-p1` 任务工作区开发，未合并、推送或替换运行版。本文更新前一份复查报告中“原生多模态未完成”的状态。

## 交付链路

1. 用户通过左下角加号、粘贴或拖放添加图片及 UTF-8 文本。每张图片可单独移除；没有清空按钮。
2. Session 校验文件类型、完整内容、字节数和摘要，保存实际字节。重试同时核对文字和附件摘要。
3. 启动 Run 前将附件复制到该 Run 的 `user-attachments` 目录，持久化名称、类型、字节数、相对路径和 SHA-256。附件不写入用户项目，不依赖聊天窗口内存。
4. 规划、执行、审查及恢复调用前重新验证文件内容与摘要。文件缺失、路径越界、链接、内容被修改均报错，不静默退回文件名提示。
5. 各后端使用原生输入：
   - Claude Code：`--input-format stream-json`；用户消息中的 `image` / base64 内容块。带附件时使用 stream-json 输出，即使普通文字流式输出被关闭。
   - Codex：SDK `Input` 数组中的 `local_image`，同时适用于决策与执行。SDK 将它转换成 CLI 图片参数，恢复同一 Thread 时仍携带附件。
   - OpenCode：SDK `parts` 中的 `file`、MIME 和内联 data URL，覆盖决策和执行。模型必须声明图片输入能力，否则在发送 prompt 前明确拒绝。
   - 文本附件：作为完整文本 part 传入，保留文件名并标注为用户材料，不提升为系统指令。

旧 Run 没有新增字段仍可读取。旧 Session 附件若没有内容哈希，则要求重新添加，避免把未经完整性记录的文件冒充原图。

## 界面

- 添加入口为输入框左下角圆形“＋”，无大按钮和常驻长提示；读取时原位显示加载图标。
- 图片卡片采用完整比例缩略图、透明底棋盘格、文件名与独立移除按钮。
- 点击缩略图打开预览；支持适应窗口、原始尺寸、图片尺寸显示、Esc / 关闭按钮 / 背景关闭。使用原生 dialog 管理焦点。
- 发送历史中的附件目前仍展示名称和大小；完整历史图片预览接口不属于本轮改动。

## 验证方式及边界

Desktop 全套串行回归通过：97 项通过，0 失败，0 跳过；日志 `.v3c3/multimodal-desktop-final.tap`。最新隔离 UI 验证通过，覆盖左下角加号、图片增删、预览与发送状态。

最终后端相关回归：`node --test --test-concurrency=1 dist/test/multimodal.test.js dist/test/native-agent.test.js dist/test/codex-decision-agent.test.js dist/test/decision-agent.test.js dist/test/opencode-execution-agent.test.js dist/test/decision-discussion.test.js`，94 项通过，0 失败；日志 `.v3c3/multimodal-final.tap`。Controller 构建、Desktop 类型检查与生产构建均通过。

- 新增 Run 保存/重启/篡改/路径越界测试，Claude adapter 输入边界测试，以及 Codex 决策和执行输入测试。
- 使用已安装的 Codex SDK 配合本地模拟 CLI，验证真实 SDK 参数序列化、JSONL 和恢复协议；不启动模型服务。
- 使用已安装的 OpenCode SDK 配合本地 HTTP 服务，检查 Plan、Execute、Review 三次请求中的图片字节，并验证不支持图片的模型不会收到 prompt。
- Desktop Session 集成测试验证先绑定附件后启动 Controller，以及重启后清单不变。
- UI 使用真实 React 组件、独立数据目录和不可见 Electron offscreen 窗口。覆盖加号位置、图片粘贴追加、移除、纯附件发送、放大关闭、提交状态及窄屏布局。
- 图片与 UI 结果位于 `.v3c3/workbench-preview/`。示例内容在截图内注明，不冒充真实 Agent 任务。
- 此轮验证传输逻辑，不代表已测过每个服务商、中转站或模型的真实识图表现。没有调用真实付费模型，没有改动用户鼠标键盘、系统剪贴板、Work/Idle 策略或 Hook。
- 单图 2 MiB、文本 200 KB、每条消息 8 个附件的既有保护继续保留。Claude 序列化输入超过 9 MiB 时明确报错，以避免超过 CLI stdin 容量；不会静默删图。模型/服务商仍可能施加自己的格式、像素、容量限制。

## 协议依据

- [Claude 官方 Streaming Input 文档](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)：原生用户消息中的图片内容块。
- [Claude CLI 参数参考](https://code.claude.com/docs/en/cli-reference)：stream-json 输入/输出参数。
- 本地 `@openai/codex-sdk@0.161.0` 类型定义及真实参数序列化测试：`Input`、`UserInput.local_image`。
- 本地 `@opencode-ai/sdk@1.18.35` 类型定义与 [OpenCode SDK 文档](https://docs.opencode.ai/docs/sdk/)：`FilePartInput`、模型图片能力与原生 prompt parts。
