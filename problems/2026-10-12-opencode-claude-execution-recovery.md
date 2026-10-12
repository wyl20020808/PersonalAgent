# Claude 中断后切换 OpenCode 执行恢复被误拒绝

状态：处理中。真实 DEV 复现，源码修复与原 Run 恢复验收分别记录。

执行方：外部 Codex。基线 TEST `3aa7e5a59066f5af7fdc65e1ff3a97cb2ea38099`。任务分支 `fix/opencode-claude-recovery-20261012`，独立 Worktree `D:/PersonalAgent-worktrees/tasks/opencode-claude-recovery-20261012`。

已获用户批准将完整 TEST 候选 `5c03edd` 更新 DEV，并切换校园决策者、小地图执行者为 OpenCode 6.1 Sol / medium。DEV 安全更新、构建、类型检查和四项恢复回归通过。校园的真实 OpenCode Review 成功调用并读取交接/工作树记录，之后因 t05 正式资产 Owner 授权停点暂停。小地图正式切换已保存，但 Execute 在启动服务之前被 `Unknown or failed Execute status requires explicit human recovery` 拦截，没有 OpenCode 执行写入。

根因：OpenCode 执行恢复检查只定位 `opencode-execute-dispatch`，找不到旧 Claude 的 `claude-execute-dispatch`，即使 Controller 已保存合法 human-decision 仍拒绝恢复。Claude 的对称检查已支持两类记录。

修复：OpenCode 同样定位两类真实执行派发记录。保留同 loop 拒绝、失败后显式 human-decision/正式 guidance 恢复要求，不伪造审计、不改 Run 状态、不删除旧 attempt，不把模型切换当作自动重放授权。新增回归模拟 Claude 的失败派发，正式切换后验证无人工恢复事件仍在零 Prompt 处拒绝；添加测试中的明确用户恢复后才执行，并核对原 Run 和部分文件保留。

生产验证仍需从 TEST 整合完整候选并获批安全更新 DEV，随后通过正式 resume 续接原小地图 Run `fbd7645c-e909-47e6-86f1-ad4bca135515`。两个任务当前均在暂停安全节点。校园的资产授权需求与本软件恢复缺陷分开处理，外部会话不得代替 Owner 批准发布。
