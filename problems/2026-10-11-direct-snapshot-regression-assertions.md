# Direct 模式四项历史快照断言与当前 DEV 不一致

- 状态：待处理。本次消息引导开发不扩大到旧夹具迁移。
- 场景：串行运行 `dist/test/direct-project.test.js`，任务工作区与干净 DEV 基线均 6/10，通过项和失败项一致。
- 现象：非 Git 证据期望 SHA256 但返回 no-git；期望任务 Diff 排除已有修改；期望非 Git 文件修改使批准失效；期望 Direct 交付清单包含 README 完整变化。
- 证据：基线 `d2fe3e67ee911c816070afca5010fcc6f76213a9`，对照工作区 `D:/PersonalAgent-worktrees/tasks/chat-message-steering-baseline-20261011`；日志见 `.validation/steering-baseline-direct.log` 和 `.validation/steering-focused-final.log`。
- 已确认：四项失败不是本次引导新增回归；当前新 Run 的 snapshotPolicy=none 只提供有限观察，以上断言仍要求旧内容快照语义。未为了测试恢复全项目扫描、备份或篡改历史记录。
- 影响：不能宣称 Direct 回归全通过，原有批准和变化观察的覆盖边界需明确。
- 下一步：另行迁移历史快照夹具或明确新策略断言，同时保留批准、文件完整性、恢复及有限观察边界测试。
