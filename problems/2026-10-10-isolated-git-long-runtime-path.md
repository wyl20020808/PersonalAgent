# 长 Runtime 路径导致 Git isolated 克隆失败

- 归属：PersonalAgent 的 Windows Git isolated 准备流程。
- 状态：待处理；不阻断本次授权 Direct 与 P2A 整合。
- 现象：在整合 Worktree 下运行 Desktop sessions 隔离回归，Git clone 失败，stderr 为 `fatal: '$GIT_DIR' too big`，随后 `fatal: fetch-pack: invalid index-pack output`。Run 正确保存为 failed，未派发 Agent。
- 证据：`D:/PersonalAgent-data/snapshot-p2a-integration-v1/desktop-final.log` 的较早失败已被后续同名最终通过日志替代；原始 durable Run 完整保留在 `D:/PersonalAgent-worktrees/tasks/personalagent-snapshot-p2a-v1/.v03e-tests/b7609cd0-de07-4643-9e85-62d238b44e36/projects/1022fe4960a8eb7e428684401dd28f1e/runtimes/b995c0fb5f5b4895/runs/65b03013-ef21-43a7-9ed9-b5a756cfd843/state.json`。Git 工作目录为 221 字符，克隆目标更长。
- 已确认：失败发生在本机 Git 的 clone/index-pack 路径；使用独立短路径测试数据目录 `D:/pa-si/<id>` 后可以继续验证。尚未确认所有 Git 版本和不同路径长度的触发阈值，不将现象推断为固定阈值。
- 影响：较深的 isolated Runtime 可能无法启动；Direct 不进行此克隆。取消 Snapshot 没有提供非 Git 项目自动隔离复制，也没有提供无内容基线的自动 Apply。
- 本次处理：只缩短该隔离回归的测试目录，保留失败审计与数据，不更改生产流程、不静默降级为 Direct。
- 下一步：独立评估短 Runtime 布局或准备阶段路径预检；继续保持明确失败和人工处理。
