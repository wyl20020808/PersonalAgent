# Claude 中断后切换 OpenCode 执行恢复被误拒绝

状态：已解决。真实 DEV 复现后修复，并在同一小地图 Run 完成跨后端恢复验证；小地图功能本身仍在开发。

执行方：外部 Codex。基线 TEST `3aa7e5a59066f5af7fdc65e1ff3a97cb2ea38099`。任务分支 `fix/opencode-claude-recovery-20261012`，独立 Worktree `D:/PersonalAgent-worktrees/tasks/opencode-claude-recovery-20261012`。

已获用户批准将完整 TEST 候选 `5c03edd` 更新 DEV，并切换校园决策者、小地图执行者为 OpenCode 6.1 Sol / medium。DEV 安全更新、构建、类型检查和四项恢复回归通过。校园的真实 OpenCode Review 成功调用并读取交接/工作树记录，之后因 t05 正式资产 Owner 授权停点暂停。小地图正式切换已保存，但 Execute 在启动服务之前被 `Unknown or failed Execute status requires explicit human recovery` 拦截，没有 OpenCode 执行写入。

根因：OpenCode 执行恢复检查只定位 `opencode-execute-dispatch`，找不到旧 Claude 的 `claude-execute-dispatch`，即使 Controller 已保存合法 human-decision 仍拒绝恢复。Claude 的对称检查已支持两类记录。

修复：OpenCode 同样定位两类真实执行派发记录。保留同 loop 拒绝、失败后显式 human-decision/正式 guidance 恢复要求，不伪造审计、不改 Run 状态、不删除旧 attempt，不把模型切换当作自动重放授权。新增回归模拟 Claude 的失败派发，正式切换后验证无人工恢复事件仍在零 Prompt 处拒绝；添加测试中的明确用户恢复后才执行，并核对原 Run 和部分文件保留。

验证：根构建与 5 项针对性恢复/拒绝保护测试通过。用户批准完整 TEST 后续候选 `5d257797131266a7542cdb8f9d3d73c0b94a90b6`，DEV 再次保存两个暂停 Run 检查点、正常关闭窗口、快进、构建及安全重启，四项 DEV 恢复检查通过。2026-10-12 13:09:41（Asia/Shanghai）原小地图 Run 从 t01 正式派发真实 OpenCode Execute，workspace 为原独立工作树，新原生 Session 为 `ses_ed17bbec7ffea3kt4FHkD2KePw`。实际工具已读取任务树地图导出脚本，phase=executing、active=true，配置为 hgapi-openai/gpt-6.1-sol variant medium。原 r01 完成项、Run、Writer 和审计保留，没有新建替代 Run或回放已完成任务。证据在 `D:/PersonalAgent-data/project-parallel-dev-update-20261012/evidence/`。

校园也已使用真实 OpenCode 完成一次 Review，但 t05 正式资产工作区/Owner 发布授权需求仍等待用户决定；此停点与软件恢复缺陷分别处理，外部会话没有代替 Owner 批准发布。两次安全更新都未推送 MAIN、未修改全局策略/Hook、未强杀写入进程。
