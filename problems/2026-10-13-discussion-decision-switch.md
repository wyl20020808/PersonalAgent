# 切换决策者后旧讨论状态与新配置不兼容

- 归属：PersonalAgent。状态：待处理。优先级：P2。复核基线：TEST `53da0a4`。
- 场景：会话曾经 /discuss，随后进入开发并通过正式恢复入口切换决策身份；再次 /discuss。
- 证据：`desktop/src/sessions.ts:41` switchDecision 更新 settings.decisionAgent 并删除 profileId，但保留 discussionStateId；`233-240` discuss 用新 settings 构造 config，同时传旧 discussionStateId。`src/conversation-discussion.ts:21-22` 要求保存配置与当前配置 JSON 完全相等，不匹配立即拒绝。
- 最小验证：`.validation/verify-third.mjs` 用实际 conversationDiscussion 创建 Mock 讨论，再用原 stateId 和不同 model 调用，模型派发前以“讨论 Session 的项目或决策者配置已变化”拒绝。退出码 0。桌面 switchDecision 未实际调用，完整 UI 链路尚未验收；配置比较拒绝是已验证事实。
- 影响：保留同一讨论状态继续调用失败，不等于所有会话永久失效；新建会话可避开。旧讨论状态不应直接删除以丢失历史。
- 下一步：正式切换时保存历史讨论与候选方案，建立新身份对应的讨论状态或显式交接；禁止静默复用不同模型/后端的原 Session。补充 discuss→develop→switch→discuss、同身份切换、失败后重试及历史可读回归。
