# OpenCode 长任务在约五分钟后出现 fetch failed

状态：待处理；日志调查和本地复现完成。未修改生产通信代码，未合并、重启或恢复真实 Run。

## 现象与影响

用户报告最近三小时开发频繁中断。核查窗口为 2026-10-10 14:03:34 至 17:03:34（Asia/Shanghai）。OpenWorld 两个 Run 共发现五次执行请求报 `fetch failed`，随后 Controller 暂停，未得到已确认的终态结果。会话中已有工作不等于任务已验收。

| Run 前缀 / 执行模型 | 请求开始 | 请求报错 | 持续秒数 |
| --- | --- | --- | --- |
| fc6a4e00 / deepseek-v4.1-flash | 15:11:01.237 | 15:16:06.499 | 305.262 |
| fc6a4e00 / deepseek-v4.1-flash | 15:17:57.729 | 15:23:02.654 | 304.925 |
| ea04a572 / gpt-6.1-sol | 16:13:52.096 | 16:18:57.348 | 305.252 |
| ea04a572 / gpt-6.1-sol | 16:23:54.285 | 16:28:59.861 | 305.576 |
| ea04a572 / gpt-6.1-sol | 16:30:48.337 | 16:35:54.582 | 306.245 |

以上时间均为当日北京时间。两 Run 的配置 `timeoutMs=600000`。五次 `opencode-execute-error` 的 `interrupted=false`，表示记录时 Controller 的组合取消信号未中止。ea04a572 第四次执行 16:38:37.794 至 16:41:05.825 成功，约 148 秒；之后因未配置独立测试暂停，是另一个已登记的验收问题。

## 已核实的软件行为

`src/opencode-decision-agent.ts:63` 的共享启动器向 SDK 注入 Node 原生 `fetch`，未显式配置等待响应头的时限。执行适配器 `src/opencode-execution-agent.ts:127` 使用同步 `session.prompt`，整个任务完成前请求保持等待；旁路事件流的活动不会延长该请求等待响应头的时限。规划/审查适配器也使用同步请求，但本次五个实例均为执行。

实际 Node v22.20.0、内置 Undici 6.21.2 的运行时源代码，默认 `headersTimeout` 与 `bodyTimeout` 均为 `3e5` 毫秒。Controller 的 600000 毫秒 AbortSignal 不会自动覆盖传输层这个默认值。

执行适配器捕获请求异常后调用 `session.abort`，再记录错误。只读查询两个 Run 的 OpenCode SQLite 消息，五次对应的最终助手消息均为 `MessageAbortedError / Aborted`，与上述时间吻合。GPT 三次中断日志未发现对应上游 API 报错；原审计仅保留 `error.message`，没有保存 `error.cause.code`，故不能事后从原日志逐次证明底层错误码。

## 另有渠道异常

DeepSeek 执行日志在北京时间 15:21:30.404 和 15:22:34.055 记录 `AI_APICallError: Cannot connect to API: The socket connection was closed unexpectedly.`。这是 OpenCode 至模型 API 连接异常的证据；现有日志不足以区分中转站服务端与网络路径故障，不应直接称为 PersonalAgent 崩溃。它与本地请求五分钟限制可以同时存在。

日志根目录：`D:/PersonalAgent-data/instances/dev/projects/8e385b4ba92e9d229e7a7c17e4f23856/runtimes/`。对应 runtime 为 `3cfba7af98ae415b`（ea04a572）与 `d890fc0b992d4f01`（fc6a4e00）；Run 完整 ID 为 `ea04a572-ff03-4b47-9d4f-fdf5c276ae64`、`fc6a4e00-b92f-4408-b619-7f7b6c446a12`。证据来自 Run 审计、state.json、execution/data/opencode.db 和 execution/data/opencode/log/opencode.log。未读取或输出渠道密钥。

## 本地复现与下一步

隔离本地 HTTP 服务仅监听 127.0.0.1，延迟 320 秒返回响应头；客户端使用同形态 Node fetch 与 600 秒取消信号。不访问模型渠道，不启动真实 Agent，不修改 Run。脚本 `.validation/fetch-timeout-probe.mjs`，结果 `.validation/node-fetch-timeout-probe.json`。

实际复现结果：304425 毫秒后失败，顶层 `fetch failed`，底层 `HeadersTimeoutError / Headers Timeout Error / UND_ERR_HEADERS_TIMEOUT`。服务与测试进程已正常退出。该结果确认当前软件使用的传输方式存在约五分钟默认限制，且无需中转站即可复现同类中断。五个历史实例的时长与之吻合，强烈支持本地传输超时解释；由于历史审计丢失底层错误码，仍不把五次历史错误逐次宣称为已直接证明同一错误码。

同时核查运行 dev 的构建产物 `dist/src/opencode-decision-agent.js:79` 与 `dist/src/opencode-execution-agent.js:173,206`，确认也是相同 fetch 注入、同步派发与异常后 abort 行为，并非仅候选工作区具有该逻辑。本地复现是通信机制验证，不是 Controller 正式交付验收。

应修复 OpenCode 长任务的通信等待机制，使其遵守 Controller 时限，并保留底层错误分类。可评估异步派发加事件/终态确认，或对本地客户端显式配置传输时限；必须保留 Session、workspace、模型与任务结果绑定，避免自动重发造成重复执行。验证应覆盖长任务、真实超时、停止、事件断开和终态确认。

用户仅授权“确认不是软件问题且无需修复后合并”；当前已发现软件通信缺陷，因此不满足合并条件，前一决策返工修复继续保留在独立工作区。

## 2026-10-10 后续修复

用户已明确授权取消长任务运行时长限制。候选修复完成：本地 OpenCode 专用通信连接池取消响应头/内容固定等待时限，配置 0 表示不限时；真实桌面新任务默认 0，旧任务通过正式恢复入口更新并审计。适配器读取持久化配置，停止和归属验证保留。未替换运行版本，因此生产问题尚不能标为已解决。

实际本地长请求等待响应头 320035 毫秒、内容 320036 毫秒均成功。停止、配置恢复和适配器回归通过；扩大回归存在 6 项基线也失败的旧快照夹具问题，详见另一个问题记录。最终范围、验证与候选哈希见 LONG_TASK_COMMUNICATION_VALIDATION.md。尚未合并或调用真实渠道验收。
