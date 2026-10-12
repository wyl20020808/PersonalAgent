# 全部 AI 回复增量显示与讨论提示分类

## 任务与边界

用户要求：已完成任务后的讨论不再把正常启动提示当成工具失败；所有来源的公开 AI 回复实时呈现，同时减少刷新、磁盘与 Token 开销。

执行方为外部 Codex；从本地 TEST 明确提交 `59883a881d6b9555d233cd59b80eff2c5b0fc0d4` 创建 `feature/all-ai-streaming-20261012`，工作树 `D:/PersonalAgent-worktrees/tasks/all-ai-streaming-20261012`。按 V2.1 条件式授权仅整合本地 TEST，不更新 DEV/MAIN，不重启实例，不推送。DEV 核对提交仍为 `4bb49dbeca19d4397256cc9859d3244c48353174`。依赖分别安装在任务根目录与 desktop 的独立真实目录，没有复用 DEV 可写 node_modules。

Serena 已激活任务目录，本次没有可用语言服务器，采用限定文本搜索与精确源码读取。

## 全部回复入口核对

| 入口 | 实际调用链 | 展示方式 |
| --- | --- | --- |
| 新会话、已完成会话的只读讨论、后续讨论 | SessionStore.discuss → conversationDiscussion → 三种 DecisionAgent | 根 reply 字符串增量进入同一草稿；最终成功替换草稿，异常保留已收到的尾段 |
| 规划、重规划、上下文建档 | RealAgents.plan → 配置的 DecisionAgent | 普通公开文字、humanDecision、tasks[].instruction 增量显示；任务草稿不代表已校验或开始执行 |
| 双决策草案、互评、汇总 | 同一 DecisionAgent 适配层，独立参与者与 Session | summary 等公开字段增量显示，保留参与者及调用归属 |
| 审查 | RealAgents.review → 配置的 DecisionAgent | reason 增量显示，verdict 仍由完整结果验证后处理 |
| Codex 原生执行 | codex-worker → App Server → native-agent | 复用 TEST 已有真实 agentMessage.delta 链路，合并正文审计写入 |
| OpenCode 原生执行与决策 | 原生 Session / SSE → OpenCodePublicStream | 支持累积 part 与独立 message.part.delta；后者现在同时进入讨论草稿；排除 synthetic/ignored 文本 |
| Claude Code 执行与决策 | CLI stream-json → DiscussionStream | 公开文字与 StructuredOutput 的允许字段增量显示；旧 claudeStreaming:false 配置的新调用也请求流式，历史配置与单 envelope 仍可读取 |

固定 Controller 通知及 Mock 回包没有远端文字流，不用人工打字动画伪装模型生成。没有输出隐藏思维链或普通工具参数，没有增加 schema 字段、提示词、模型调用或模型轮询。

## 修复与开销控制

仅完整匹配 Codex 实验功能配置横幅的非终态 item.error 改为“Codex 配置提示”。历史审计不改写，仅在投影时修正这类旧消息的展示。认证、额度、工具失败及 turn.failed 均保留失败状态；附带其他错误的横幅不会被忽略。没有改用户 Codex 配置来隐藏提示。

公开正文以约 100 ms 为间隔合并快照，首段直接写入，工具/错误到达时立即刷出待写正文，调用 finally 刷出完整尾段。只保留每个流的最新待写片段，没有后台写入定时器或跨任务尾写；任务 ID 与 loop 在派发时固定。完整审计证据文件及哈希仍使用独立快照，不能覆盖旧证据。

Claude 的纯内容片段不再触发用量文件重写；真实用量变化及结束仍持久化。DiscussionStream 同时合并解析与草稿通知，SessionStore 跳过相同内容写入。讨论审计按文件 size/mtime/ctime 与状态 ID 缓存，最多 20 个会话，追加或改写使缓存失效。聊天刷新不重叠，持续通知最多约 10 次读取/秒；讨论界面保留 400 ms 轮询兜底。未改变现有草稿长度限制、完整结果与证据查看机制。

确定性检查将 1000 个文字片段分布在模拟 1 秒内，正文审计为 11 次，最终 1000 字准确保留；重复终态不重复写入。另验证 1000 个 Claude 文字片段不改变用量文件时间与审计大小。这是限定夹具的操作计数，不是整机性能 benchmark。

## 验证证据与限制

任务 `.validation/` 保留实际命令输出与真实调用记录：

- 根构建、desktop 构建、desktop 类型检查及 diff 检查通过。
- 三种来源的原生执行、决策、重连及归属检查分别见 `all-ai-core.tap`（69 项）与 `provider-execution-final.tap`（27 项）。
- 新增公开流/提示分类 4 项，DiscussionStream 5 项，用量及读取证据 11 项通过；旧配置流式升级、最终 Schema、取消、权限、附件等最终组合见 `matched-final.tap`。
- 完整桌面回归 `desktop/.validation/all-ai-desktop-final.tap` 160 项通过；之后服务 capability 的最终组合复验 `service-stream-final.tap` 115 项通过。
- 使用真实 React GroupWorkspace 与实际消息投影的独立 headless 浏览器，1280/480 两种宽度验证开发正文和已完成会话讨论：最终完成前可见文字增长、同一气泡更新、重载保留最终回复、配置提示不呈现为失败、无横向溢出。见两个 `desktop/.validation/*-stream/result.json`。不是运行中 DEV 或真实 Electron IPC 验收。
- 一次真实 Codex 6.1 Sol / medium 只读讨论调用通过正式 conversationDiscussion：11 次渐进正文通知、13 个公开正文审计事件；调用次数为 1，input 26390 / output 119 tokens，原生系统上下文包含在输入报告中，不把提示词字节当成 Token。项目夹具未变化。见 `real-discussion-result.json`。本次没有新增真实 Claude/OpenCode 付费调用，其新增协议分支由本地原生 HTTP/CLI 适配器夹具验证。

扩展检查发现 6 个已有基线失败：call-observation 的 T1/T2/T3 与版本核对共 4 项仍要求旧的 paused/user acceptance；interaction-policy 的 1 项仍要求机器检查否决；v03c 的 1 项仍匹配旧提示文案。全部在未修改的 `59883a8` 工作树复现，见 `baseline-call-observation.tap` 与 `baseline-extra.tap`。保留原测试与真实失败记录，不改生产验收政策迁就旧断言；最终匹配回归显式排除这些已确认基线用例，不称为完整核心套件全部通过。

最初刷新测试按 30 ms 期待再次读取，已按新的 100 ms 合并窗口更新，并补充持续通知的请求上限检查。一次桌面测试的 Node 启动进程异常退出随后复验通过，没有因此修改用户依赖或运行实例。真实 Electron/用户视觉验收仍待 TEST 试用，本次不能据此直接交付 DEV。
