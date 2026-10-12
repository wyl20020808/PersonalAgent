# Controller 夹具等待窗口修正

执行方：外部 Codex。基线：TEST `aa52a965e0855dcda40566228b8286cd3732e4a4`；独立分支 `fix/controller-fixture-wait-20261012`。

完整 TEST 与 DEV 的组合验收中，thread.test 的 Mock Run 在首个用例等待结束时仍处于 review，随后真实 Controller 正常完成。一次独立复验的原始审计显示约 34 秒后达到 completed；原夹具仅提供 150 次 100 ms 等待。后续共享夹具用例过早修改仍活动的测试 Run，出现 Run still active 连带失败。原始证据保留在 `D:/PersonalAgent-worktrees/tasks/dev-full-test-20261012-2024/.validation/`，不把失败结果抹掉。

仅将完成等待改为 600 次 100 ms、重大决策暂停等待改为 900 次 50 ms。查询本身耗时另计；仍要求正确终态和 Controller 进程退出，保留全部状态、计数、授权、会话、验收断言。未修改生产超时、恢复或验收规则。

根构建、桌面构建和类型检查通过；完整 thread.test 31/31 通过，退出码 0，输出 `thread-validation.tap`。按 V2.1 条件式授权先整合本地 TEST，再由已授权的完整候选更新任务纳入 DEV。本轮发现并已解决的夹具问题没有额外待办，不新增自省问题记录。
