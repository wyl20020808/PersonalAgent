# Codex Decision SDK 的读取与实际模型观测边界

- 归属：PersonalAgent Codex Decision 审计与上游 SDK 能力边界。
- 状态：暂缓扩展；当前实现已明确保留未知值，不伪造读取或模型证据。
- 现象：SDK 0.161.0 提供命令、MCP、回合用量和 Thread 事件，没有独立原生 Read 事件、实际模型标识、模型目录或内部请求总数。
- 证据：正式安装包 `node_modules/@openai/codex-sdk/dist/index.d.ts` 的 ThreadOptions、ThreadEvent、ThreadItem 与 Usage 定义；现有 `src/call-observation.ts` 同样明确该边界。P3A 测试保留 `type core.js` 命令证据，同时断言没有推断 `confirmed-read`。
- 影响：可以追溯配置模型、传入的 Context、原生命令、用量与调用/Thread/实例归属；不能仅凭路径、Shell 命令或模型配置声称文件全文已读、Context 被正确理解或服务实际使用该模型。SDK 没有模型发现接口，模型可用性在真实调用时验证。
- 本次处理：决策调用复用 Context manifest、reads、usage；配置模型写入独立调用审计，实际模型及内部请求数保持未知。无结构化结果或无可验证 Thread/调用归属时明确失败。没有调用付费模型补齐证据。
- 下一步：人工验收真实 Codex Plan/Review/Discussion 的读取及恢复；只有上游暴露可验证事件后才扩展逐文件读取和实际模型审计，不用合成消息填补。
