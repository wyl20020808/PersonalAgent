# Claude 已确认会话丢失后的恢复路径需明确

- 归属：PersonalAgent。状态：待处理，真实会话失效待验证。优先级：P2，条件性恢复风险。来源：第二份外部审查 F5。
- 场景：已确认的 Claude CLI Session 记录被删除或无法再由 CLI 恢复，普通继续再次使用原 Session ID。
- 证据：TEST `a39215ed` 的 `src/claude-code-decision-agent.ts:60-63,116-133` 对有 Session 的调用使用 --resume；非零退出保留 Provider 错误并分类，finally 清理规则只覆盖尚未确认的新 Session，不清理已 resumed 的 Session。未看到针对“已确认 Session 不存在”的独立处理。
- 影响：如果 CLI 持续拒绝原 ID，普通继续可能反复失败。此情形依赖真实 CLI 行为，尚未复现；OAuth 过期后修复认证成功不能证明 Session 本身已经失效。
- 现有出口：单决策者可通过正式切换不同决策身份交接并开启新 Session（`src/decision-switch.ts:7-28`）；执行者也有显式模型/后端切换入口。多决策模式有切换限制。同身份选择为 no-op，不是明确的 Session 重建接口。因此“全部 Run 永久无任何出口”不成立。
- 下一步：先取得精确的会话不存在诊断；设计显式重建同身份 Session 的交接路径，保留 Run、Writer、完成项、原审计与未知工具结果核查。不能对 auth/transport 等所有错误自动清 ID、新建会话或重放任务。
- 验证：静态确认恢复边界，未删除真实 CLI 会话、未调用付费模型。此前 [跨后端执行恢复修复](【已解决】2026-10-12-opencode-claude-execution-recovery.md) 的派发审计兼容根因不同，保留其已解决状态，不重新打开。
