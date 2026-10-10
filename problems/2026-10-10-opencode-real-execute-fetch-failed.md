# OpenCode 真实 Execute 中途 fetch failed

归属：PersonalAgent P3C 的 OpenCode Execute 调用链。状态：暂缓根因诊断；原 Run 已成功恢复并完成，传输问题仍未确认原因。

## 现象与影响

2026-10-10 使用 P3C `d3fafa98a43d610833d32b9d8f223fc94fa57efc`、真实 `hgapi-openai/gpt-6.1-sol` 开发 OpenWorld 顾客需求 UI。Plan 已通过；首次 Execute 原生修改 `CustomerNeedWidget.cpp` 后，测试脚本的 `apply_patch` 尚处于 pending 时，调用返回 `fetch failed`。Controller 正确暂停并保留修改，没有进入 Review 或生成交付。

## 可核实证据

- Run：`97b43d12-8a50-4451-8570-c064418c93b2`。
- Decision Session：`ses_edbbec6ceffeNGGljn5oAIYOwo`。
- Execution Session：`ses_edbbd7a4cffetpr1ZEKWJDgkGT`。
- 审计：`D:\PersonalAgent-data\p3c-openworld-demand\runtime\runs\97b43d12-8a50-4451-8570-c064418c93b2\audit.jsonl`。
- `2026-10-10T05:26:47.589Z` 的 `opencode-execute-error` 为 `fetch failed`；首次 Execute `durationMs=311588`，`agent-finish.changed=true`。
- 随后的 `execution-interrupted`、`phase=paused` 及 recoverable error 均已持久化。
- 已按用户授权续接原 Run、原 Session，未更换模型或清空调用记录。

## 原因与下一步

已确认的是客户端调用失败和不完整终态。尚不能由简化错误消息判断服务商、loopback 服务、SDK transport 或具体超时原因。应保留原始诊断、检查长调用的传输超时及服务生命周期，不把 pending 工具或已发生的部分修改视为完成。当前任务不修改 P3C Controller 源码。

第二次 Execute 也以 `fetch failed` 暂停，保留了测试和报告。经正式 limits 接口将任务自设恢复上限从 1 增至 2 后，第三次 Execute 在同一 Session 成功返回。实际只创建一个 Run，未清空调用历史。

Controller 独立验收与真实 Review 通过。另经用户明确授权修正交付验收路径后，再次验收和真实 Review 通过，Delivery 最终为 `preview`、`approval=null`。最终结果在 `D:\PersonalAgent-data\p3c-openworld-demand\receipt.json`；完整工具文本、哈希及归属核验在 `verified-evidence.json`。恢复成功不表示 `fetch failed` 根因已经修复。
