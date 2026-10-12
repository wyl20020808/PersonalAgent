# 流式输出末尾无换行时不投递 onLine

- 归属：PersonalAgent。状态：待处理。优先级：P3。来源：第二份外部审查 F10。
- 证据：TEST `a39215ed` 的 `src/process.ts:15-72` 在 stdout data 中只提取换行结束的记录，child close 时未处理残留 pending。
- 确定性复现：抽取实际 runProcess 函数体，注入内存 child，输出 `{"tail":1}` 后 close(0)。结果 stdout 保留完整字符串，但 `onLineCount=0`；本地验证退出码 0，没有启动 OS 子进程。
- 影响：只依赖 onLine 的消费方漏掉末条事件。返回 stdout 的调用方仍可自行解析兜底，不能称整个进程输出被丢弃；本轮没有逐一证明所有调用方都有兜底，也没有复现真实 Provider 因此失败。
- 下一步：定义 EOF 残行语义，在退出完成前投递合法残行；处理回调异常与既有 failure 时不得误标成功。覆盖完整行、无换行尾行、空尾部及异常退出，保持工具终态与恢复证据正确。
- 验证：模拟 child 确认；真实 CLI 协议验收未运行。结果在 `D:/PersonalAgent-data/audit-second-problem-records-20261012/verification.json`。
