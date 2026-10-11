# DEV 更新未等待关闭检查完成

- 状态：已补救；应改进更新操作的顺序校验。
- 现象：CloseMainWindow 返回 false，等待退出的 Shell 尚在运行，却继续了首次 DEV 合并和构建。不能将此步骤描述为安全关闭通过。
- 影响：空闲旧实例短暂保留已加载旧代码，磁盘已更新为新版；若存在执行中的 Controller，会产生更严重的版本混用风险。本次已确认没有活跃 Controller。
- 补救：核对精确进程归属和 Controller 状态，结束空闲旧 DEV 实例；退出后重新构建、重启新版。核验 56 个原文件和 17 项历史摘要未变，没有历史任务重放。
- 证据：`D:/PersonalAgent-data/chat-message-steering-integration-20261011` 的前后快照，以及本次 Shell 的 `DEV did not close safely` 错误。
- 下一步：DEV 更新必须将关闭命令完成结果作为后续 Git/构建的依赖，不能只等待工具返回 Session ID；关闭失败时先处理进程状态，再继续更新。
