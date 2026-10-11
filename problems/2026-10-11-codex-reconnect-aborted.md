# Codex 重连通知被封装提前中断

状态：独立修复及 DEV 组合验收通过；用户批准后已整合 DEV，合并提交 `0c90301`。真实远端断线恢复仍未实测。

现象：真实执行显示 `Reconnecting... 1/5` 后 worker 退出 1，Run 暂停并要求人工决策。决策者存在相同事件处理。

证据：dev Run `7c35390b-704c-4ce7-97e2-6a021a1af9c6` 的 audit.jsonl 在 2026-10-11 04:38:18.385 UTC 记录重连通知，04:38:18.428 UTC 记录 worker 退出。native-agent.ts 与 codex-decision-turn.ts 遇到每个 error 事件即 throw；安装 SDK 0.161.0 在流关闭时清理并终止 CLI。不能将该日志解释为五次重试耗尽。

处理：继续消费非终态错误通知；真正连接失败后沿用原 Session，最多额外恢复三次，默认等待 5/15/30 秒并加入随机抖动。恢复计数单独持久化，不增加业务 loops/reworks，每次模型调用仍记录用量。工具结果未知或进程中断不自动重放；OpenCode 服务端 prompt 状态未知保留原恢复流程。

验证结果：最终相关回归 84/84、聚焦测试 16/16、Claude 相关回归 8/8。安装 SDK 子进程夹具证明重连通知后不会提前退出；真实正常 Run `cb2a189c-4bc1-4fff-b02f-692cfcc5119c` 完成 Plan/Execute/独立验收/Review。真实远程断网未人为复现，故障分支为明确标注的本地注入。真实 Claude Code 审查发现的问题已修复，最终增量确认 verdict=pass（基于提供的增量说明）；完整证据及限制见 `validation/transport-recovery-20261011/VALIDATION.md`。修复尚未集成运行中的 dev/main。
