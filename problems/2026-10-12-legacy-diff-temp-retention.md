# 旧快照 Diff 中间文件缺少清理

- 归属：PersonalAgent。状态：待处理。优先级：P3。来源：外部审查 A9。
- 证据：TEST `src/incremental.ts:21-60` 的 `baselineDiff` 在旧快照路径创建 `diff-${name}` 目录及 before/after 文件，返回后没有 finally 清理；baseline 名称可按 Agent 调用生成。
- 影响：旧模式长期运行可能保留额外内容副本和磁盘占用。同名目录内文件可覆盖，不是每次调用都必然新增无限文件。
- 边界：`snapshotPolicy==='none'` 直接走 `gitReviewDelta`，当前默认新 Run 不进入此路径。基线、Diff 和审计中哪些属于必要历史证据需先确认。
- 下一步：明确中间文件与持久证据的保留边界，对非证据临时文件在异常和成功路径安全清理；不删除真实历史。
- 验证：静态确认，未构造大量文件。
