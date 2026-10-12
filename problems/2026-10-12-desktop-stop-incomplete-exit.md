# 停止任务并关闭未保证 Controller 已退出

- 归属：PersonalAgent。状态：待处理。优先级：P2。来源：外部审查 A14。
- 证据：TEST `desktop/src/service.ts:355` 的 `stopOwned()` 写 stop.request，等待 children 清空或 5 秒计时器先完成；`desktop/src/main.ts:110` 随后调用 app.quit，没有对剩余 children 做退出确认或报告。
- 场景：Controller 卡在无法及时读取停止标记的 IO、终止或模型调用路径，超过等待时限。
- 影响：界面关闭时可能仍有 Controller/Agent 子进程活动，继续占锁或写 runtime。Windows 子进程实际存活与写入行为未实测，不声称每次关闭都留下孤儿。
- 下一步：明确安全停止与等待超时的区别；确认剩余进程身份，选择有界终止或告知仍在停止中。不能在未确认退出时解锁或启动新的 Writer。
- 验证：静态确认；没有关闭真实窗口或停止用户任务。关联 [进程终止问题](2026-10-12-process-termination-unbounded-wait.md)。
