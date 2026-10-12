# 全自动开发与崩溃恢复

## 任务与基线

本功能由外部 Codex 开发会话实现，不冒充 PersonalAgent 的真实开发 Run。

- 初始基线：`test@59883a881d6b9555d233cd59b80eff2c5b0fc0d4`。
- 任务分支：`feature/autonomous-supervision-20261012`。
- 工作区：`D:/PersonalAgent-worktrees/tasks/autonomous-supervision-20261012`。
- 治理：采用用户明确提供的 V2.1 条件式本地 TEST 集成规则；DEV、MAIN、运行实例更新、推送及发布另行授权。

## 使用方式

设置中打开“全自动开发模式”。设置按 MAIN、DEV、TEST 实例独立保存，默认关闭。开启时授予当前实例中的开发会话超时委托权限，不会立即处理积压任务：先等待十分钟。关闭后不再发起新的接管，已经开始的开发任务继续运行。

Electron 主进程每十分钟巡检一次，启动时还检查一次持久化状态。等待节点、最近用户消息或人工决策、设置开启时间及上次同问题接管时间均须超过十分钟。周期巡检意味着实际接管通常发生在等待满十至二十分钟之间。编辑消息、停止、暂缓以及巡检期间的新输入优先于自动接管。

后台只把问题委托回当前配置的决策者。Review 节点重新审查；规划或执行调度节点先由决策者检查已有成果、原 Session、当前任务及已完成任务，再安排剩余工作。已验收任务 ID 保留，不能作为新计划重复执行。双决策配置沿用既有主决策者恢复流程。

接管不代表已经恢复、验收通过或用户批准。聊天中单独显示“后台巡检 · 超时委托”和“全自动模式 · 决策者接管”。审计分别记录 `automatic-supervision-dispatch`、`automatic-decision` 和真实后续结果；不生成虚假的 `human-decision`。决策者仍可报告无法安全解决的事实或授权缺口。同一个问题最多接管三次，记录在原 Run 下，应用重启不清零；新的用户输入或任务进展重新形成问题身份。

## 崩溃后的软件重启

启动软件时创建一个独立 Node 守护进程，每五秒检查原 Electron 主进程是否存活。它使用原应用路径、实例身份和数据目录重启软件，不新建项目、Run 或 Session。

仅在全自动模式仍然开启、软件非正常退出且仍有运行中、等待决策或可恢复失败的开发任务时重启。正常退出记录在独立 owner 文件中，取消关闭不会被当作正常退出。没有未完成任务、只读历史配置、已停止任务、数据损坏或身份不匹配不构成重启授权。十分钟最多重启三次，超过限制停止，避免无限崩溃循环。

工作模式下，崩溃重启创建隐藏窗口，后台恢复不抢占桌面。用户再次正常打开应用时，通过既有单实例入口显示窗口。守护进程不设置 Windows 自启动，不修改系统服务；关机和整机重启后的自动启动不属于本功能。

重启后仍存活的 Controller 继续原任务，巡检通过进程和 Run 锁跳过它。已有持久化原生结果交由正式 Controller 恢复并重新审查。工具是否完成未知、未结束的 Agent 调用、没有持久化结果的 executing 节点继续保留现场，不自动重放。

## 保留的边界

- 用户停止/暂缓、未确认正式契约、提案应用中断、认证与额度问题、不可恢复或未知失败不会被自动批准或绕过。
- 明确的执行次数和返工次数限制保留；自动恢复不取消配置超时。
- 原 Run 锁、项目 Writer 锁、配置摘要、目录权限、原 Session 和工作/空闲策略继续生效。
- Claude/OpenCode 执行恢复仅承认记录了已结束、可恢复失败类型的自动委托；同一执行轮不可重复派发，未知工具结果仍拒绝自动恢复。
- 正式交付、稳定分支更新、对外发布及危险系统操作不因自动模式获得额外批准。

## 验证记录

开发者自测与实际 GUI/远端验收分开记录。独立 Node 守护进程的测试使用模拟应用，实际启动了模拟进程，验证它在 owner 进程退出后仅重启一次并保持数据目录；没有终止用户的 Electron 或真实 Agent。

实现阶段 Controller 构建、桌面构建和 `npm run check` 均通过。最终专项命令：

```powershell
node --import ./scripts/regression-policy.mjs --test --test-concurrency=1 --test-name-pattern="automatic|ten minute|external watchdog|crash watchdog|stale state" dist/test/automatic-supervision.test.js dist/test/claude-execution-agent.test.js dist/test/opencode-execution-agent.test.js
# 10/10，通过；包含两个原有自动恢复用例。
cd desktop
node --import ../scripts/regression-policy.mjs --test out/supervision.test.js
# 4/4，通过。
```

专项覆盖十分钟边界、关闭/重新开启、持久化次数保护、用户输入竞争、外部 Run 锁、手动暂缓、未知 Agent 结果、原 Session 和已验收 ID 保留、原生结果恢复不重放、Claude/OpenCode 已结束异常的自动委托，以及独立守护进程启动模拟应用。

扩大 Controller 回归在发现原有断言和短超时后停止，未完成。受影响核心模块串行组合 34/35，唯一 Mock 超时用例单独复测 1/1 通过；不得改写为一次 35/35。扩大桌面回归 155/162；原 TEST 独立副本复现六项 thread 失败，isolated rounds 的超时单独复测 1/1 通过。记录见 [历史回归问题](../problems/2026-10-12-legacy-acceptance-regression-waits.md)。没有删用例或修改生产验收语义来使测试通过。

实际 Electron 设置操作、进程崩溃后的真实 Electron 自动重启、远端模型接管仍为 pending。本轮没有启动、重启或替换用户的真实软件，也没有开启用户数据中的全自动模式。工作模式隐藏窗口的恢复入口已实现，真实窗口表现未冒充通过。

整合最新 TEST 的流式回复、证书恢复和 `b939c22` 等待夹具修正后，Controller 专项 10/10、桌面巡检与完整聊天回归组合 35/35 通过，日志分别为 `.validation/automatic-combined-feature.log`、`.validation/automatic-combined-desktop.log`。构建及桌面类型检查通过。随后强化重复问题保护：决策者仅改写问题措辞不能清零接管计数，用户重新开启模式会形成新的十分钟等待与委托周期。
