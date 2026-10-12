# 进程树终止失败后缺少有界完成路径

- 归属：PersonalAgent。状态：待处理。优先级：P2。来源：外部审查 A6。
- 证据：TEST `src/process.ts:7-14` 的 `terminateTree` 在 taskkill 的 error/close 都 resolve，未检查退出码；`runProcess` 在超时或 abort 时请求终止，但主 Promise 依赖目标 child 的 close 才完成。
- 场景：taskkill 启动失败、权限拒绝或未能结束目标，目标进程继续存活。
- 影响：配置超时不保证调用实际结束，可能阻挡 Controller 后续调度。原报告“直到外部超时”不充分：此处自己的计时器只发终止请求，没有独立 settle 兜底。
- 边界：终止失败分支与等待结构已确认，真实失败未复现。不允许只 reject 就派发下一个 Agent，否则旧写入进程仍可能存活。
- 下一步：检查终止结果，增加有界退出确认；无法确认死亡时明确进入受阻恢复状态，保持 Writer 隔离并报告存活身份。
- 验证：静态调用链核对；未终止真实进程。
