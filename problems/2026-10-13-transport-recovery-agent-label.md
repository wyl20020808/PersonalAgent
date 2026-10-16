# OpenCode 决策的连接恢复活动被标为 Claude

- 归属：PersonalAgent。状态：待处理。优先级：P3，审计展示归属。复核基线：TEST `53da0a4`。
- 证据：`src/transport-recovery.ts:24-25` 使用 execute 或 Codex decision 选 codex，其余选 claude，遗漏 OpenCode。执行侧也未按 executionAgent 后端区分，不能只修决策一处。
- 最小验证：`.validation/verify-third.mjs` 将 state.decisionAgent 设为 opencode，调用实际 recoverTransport，本地注入首次 transport 失败、下一次成功及零等待。transport scope 的 agent-activity.agent 为 claude。退出码 0，无网络或真实模型。
- 影响：连接恢复的角色展示与审计归属失真，不代表模型真的被换成 Claude，未证明用量统计错误。
- 下一步：按当前角色、执行/决策配置及 scoped participant 解析后端，并使用 PublicActivity 的实际 agent 枚举；补三后端及多决策参与者回归。
