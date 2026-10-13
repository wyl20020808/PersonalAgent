# Claude 决策首调失败保留未确认 Session ID

- 归属：PersonalAgent。状态：待处理。优先级：P1，恢复路径缺陷。复核基线：TEST `53da0a495d2ff40bc1a5373059f9e12ced3223e1`。
- 证据：`src/claude-code-decision-agent.ts:67-70` 预留 UUID，finally 的 `139` 仅在新调用且未确认、未完成，并且 transport/execute/aborted 条件成立时清理。决策首调的 authentication、budget 或 validation 失败不满足最后条件，未确认 UUID 被保留；后续因 resumed=true 又不能进入该清理分支。
- 最小验证：独立工作树 `.validation/verify-third.mjs` 用真实 RealAgents 代码与注入的本地 runner，返回不含 session_id 的 `401 authentication failed` 结果。首调失败后 claudeSessionId 非空、decisionSession 未建立；下一次参数为 --resume。退出码 0。没有调用真实模型或删除 CLI 会话。
- 影响：错误保留的 ID 可能导致之后一直尝试恢复尚未确认的会话。真实 CLI 是否已在无 init 输出时建立磁盘 Session 未验证，不能把每个未确认 ID 都认定为绝不存在，也不能说 Run 必须废弃。正式换决策身份仍有交接出口。
- 下一步：区分“已确认会话”“仅预留 ID”“调用结果不确定”；补充 pre-init auth/budget/schema/timeout/spawn 错误与已有 Session 的对照。仅调整未确认首调的恢复，不清理已确认 Session，不重放未知工具操作。finally 前的 CallObservation/recorder 初始化异常也需检查。
- 关联：[已确认会话丢失风险](2026-10-12-claude-existing-session-recovery.md) 根因不同，不能用本问题代替已确认 Session 的恢复设计。
