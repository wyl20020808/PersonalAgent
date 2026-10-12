# 聊天公开文字实时更新

## 范围与原因

外部 Codex 在独立任务分支 `feature/chat-text-streaming-20261012` 开发，基线 TEST `268bf7b2b1e564540b0679f79a0a00d355c9ed82`。根目录与桌面依赖均在本任务工作树独立安装，不共享 DEV 可写依赖。此次只先整合 TEST，不更新运行中的 DEV、MAIN 或远程仓库。

公开文字按 streamId 合并后，气泡 ID 保持不变；旧聊天游标仅查找 ID 后的消息，已经显示的气泡即使正文继续增长也不会再次返回。命令通常创建新事件，因此看起来能持续刷新。

真实 Codex SDK 对照探针只收到整段完成的 agent_message，没有逐字更新。单改前端无法提供 Codex 的实时文字，因此接入当前安装的官方 Codex App Server stdio 文本通知，沿用现有原生回合、校验和 Controller 接口。

## 改动

- 聊天游标同时记录已显示位置和审计版本。返回游标之前发生变化的气泡，并继续分页新消息；保持稳定气泡 ID，更新完整证据引用。每页最多 150 条，兼容旧游标，断线、重新打开和历史翻页不会重复累加文本。
- Codex 决策、执行工作进程拥有各自 App Server 子进程，接入真实 agentMessage delta；继续使用原 Thread、工作目录、模型、思考强度、只读/原生权限、结构化最终结果、工具观察和用量。结束或取消时退出整个自有进程树，不启动常驻后台服务，不在异常后自动改用新 Thread 或重放工具。
- 新原生事件明确标记 `codex-app-server`，投影为已有回合协议。命令、文件、MCP/原生工具、公开摘要、图片及协作工具保留可见事件；仅接收所属 Thread 和 turn。原始 reasoning content、reasoning text delta 不进入公开输出。
- OpenCode 同时支持累积 text part 和新版本独立 message.part.delta；独立增量必须匹配已知 text part 的 Session、message、part 和目录。工具输入及 reasoning 不作为公开文字。
- Claude 沿用已有 partial-message 公开文本采集，统一游标修复使其已有文字增量持续出现在聊天中。显式关闭 Claude streaming 的配置仍保留。
- JSON 回复只解码公开 reply/summary/reason 字符串；未完成的 JSON 外壳和不完整 Unicode 不出现在正文。文字只是进行中的显示，不替代最终 Schema 校验、决策或交付授权。

## 验证

核心、桌面构建和桌面 TypeScript 检查通过。核心组合 101 项、桌面完整组合 158 项、公开文字呈现 9 项通过；最终身份边界/协议调整复验 9 项通过。

真实探针证据保存在本工作树 `.validation/`：

1. `codex-events-result.json`：SDK 对照仅整段输出。
2. `codex-live-result.json`：App Server 续接同一个原 SDK Thread，公开文字从少量字符持续增长，完成前已有多次更新。
3. `real-decision-result.json`：正式 CodexDecisionAgent 创建独立真实 Run，收到 49 个公开活动和 45 次回复进度，最终结构化 reply 校验通过。
4. `opencode-text-result.json`：真实 OpenCode、gpt-6.1-sol/medium，34 次公开文字更新，正常 stop，工具禁止；记录实际返回用量。
5. `native-tools-result.json`：真实 Codex 原生工具在新建夹具目录写入并读取固定 proof.txt，6 条工具活动、55 条公开文字活动，文件内容核对通过。

共发起六次真实探针：上述五次正常完成，另一次 OpenCode 结构化只读回复样例在 60 秒超时，已取消并关闭自有服务；不将该样例算作成功，不据此猜测额度或权限根因。初期本地设置/类型/ESM 解析失败已修正，不把它们计为服务成功。Claude 使用确定性 CLI/适配器流夹具验证，没有新增真实 Claude 服务调用。

隔离 headless 的真实 React GroupWorkspace，通过正式 projectMessages/messagePage 后端投影验证 1280/480px：同一气泡在回合结束前增长；中途已有命令也能更新旧气泡；JSON 外壳隐藏；刷新仍显示最新正文；无重复气泡、横向溢出或 Renderer 异常。证据 `desktop/.validation/chat-text-stream/result.json` 与 `growing-*.png`。这是受控事件/IPC 桥夹具与真实组件验收，不冒充用户 Electron 窗口或实时模型直接驱动浏览器的验收。

既有输出长度上限、完整审计文件、工具未知结果保护、停止、恢复、五次安全重试及正式交付边界保留。源代码已验证后按共享 TEST 集成锁正常整合；若 TEST 在开发期间前进，在本任务工作树合并最新版本并复验最终组合。

开发期间 TEST 前进到 `913de5772caa4fd12d9b33f2ea0b0f179a6fd30a`（历史图片恢复）。已正常合并并保留双方功能，最终组合核心 28 项、桌面线程/文件/图片历史 40 项、构建和类型检查通过；文字流与图片 headless 均在 1280/480px 复验通过。未对历史图片提交进行摘取或覆盖。
