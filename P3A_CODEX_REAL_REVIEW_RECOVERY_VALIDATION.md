# P3A Codex 真实 Review 恢复验收

日期：2026-10-10。结果：**指定兼容配置下，真实只读读取、Thread 恢复及 Controller Review 技术验收通过；OpenWorld 审查结果为 rework，游戏未通过交付验收。** 本轮没有重新开发游戏。

## 1. 已证实原因与未查明部分

原 SDK/CLI 0.161.0 继承用户的 Windows elevated 沙箱配置。工具启动时，helper 尝试打开 Desktop 已加载的 C 盘 node_repl.exe 以刷新运行时读/执行 ACL，发生 Windows sharing violation（os error 32），最终产生 helper_unknown_error: setup refresh had errors。本轮无模型本地探针在原配置下再次复现。

Windows Restart Manager 对该精确文件的查询确认 14 个 node_repl.exe 使用者；多数父进程为 Codex Desktop codex.exe（PID 3064）或其 node 子进程。仅查询资源使用者，没有关闭/重启 API、终止进程、管理员执行或全局安全变更。实际 SDK 子进程路径是任务工作树 node_modules 内的 CLI 0.161.0；Desktop 环境为 0.162.0-alpha.2，不能混为同一程序。

仍未定位 Codex 内部运行时根收集规则、ACL helper 的具体访问掩码及上游修复方式。进程级 MCP 关闭、空表/notify 覆盖和前轮运行时复制均未解决 elevated 兼容故障。本轮采用官方支持的沙箱兼容实现恢复调用，没有修改 Codex 上游 ACL 代码。

## 2. 实际修复与使用配置

新增 src/codex-decision-runtime.ts，由正式 SDK worker 使用。只有显式设置以下环境变量时，才通过官方 SDK config override 在 Windows 决策子进程选择实现：

```powershell
$env:PERSONAL_AGENT_CODEX_DECISION_WINDOWS_SANDBOX = 'unelevated'
```

仅接受 elevated/unelevated，非法或不受限值拒绝；未设置时沿用既有配置，非 Windows 不覆盖。没有修改用户全局 config.toml、认证、CODEX_HOME 或正式 MAIN/DEV。本轮全局配置内容哈希前后一致。

原 sandboxMode=read-only、approvalPolicy=never、networkAccessEnabled=false、webSearchMode=disabled 保持。实际最小及原决策 Thread 上下文均记录 read-only/never。没有 workspace-write、danger-full-access 或权限提升。

官方 unelevated 使用受限 Windows 令牌与 ACL 文件边界；网络隔离弱于 elevated，不等同于独立离线用户防火墙隔离，也不支持 denied read paths。此限制必须随候选一起交付。本轮原策略是全局可读、只读文件系统，没有新增 denied read path 要求。依据：[官方 Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox)、[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)。

## 3. 最小真实验证

所有业务临时文件在 D:/PA-P3A-OpenWorld/20261010/recovery；认证和真实会话按已授权例外使用既有 C 盘 Codex 目录，没有复制凭据。

1. 无模型本地原 elevated 探针失败；unelevated + :read-only 读取 known.cpp 退出 0。
2. 写入负例：Set-Content 被 UnauthorizedAccessException 拒绝，文件未变。另一次 .NET 方法尝试先被 PowerShell ConstrainedLanguage 拒绝，随后改用上述 cmdlet 明确验证文件权限边界。
3. 正式 SDK worker 建立独立最小 Thread `01a1246f-6bb4-7452-8a82-a3da087c1298`。真实 Start-Sleep 工具启动后，父进程中断仅本次拥有的 worker；返回 Stopped。
4. 续接同一最小 Thread，真实 shell 读出随机源码 token `30250bef7a7d40e9f6d2724f` 与函数返回值 `49690876`。这些内容未提供在模型请求中；工具输出与原文件相符、exit_code=0，不能由提示猜测替代。
5. 标准结构化 Review 返回 pass，经原严格 Review Schema 校验。文件 SHA-256 前后均为 `010edd9912dd7753c15d1479c4fcad86ace1fd707841b7672daf959529a20633`。

上述独立最小测试不是原 Run 的替代验收。只有它通过后才恢复原 Run。真实工具事件、Thread、调用和文件哈希保留于 minimal-events.jsonl/minimal-evidence.json。

## 4. 原 Run 与真实源码审查

Run `f957b797-feed-43ef-80dd-20e1fd714f4f`；原决策 Thread `01a12444-d1c1-7253-866c-9bf9a3c0b34c`；原执行 Thread `01a12449-56bd-73a3-8fd7-9f3945d93159`。通过正式 Controller drive、RealAgents、Store 恢复，只附加禁止重复 Plan/Execute 的外层安全限制，不修改审查结果、计数或 Controller 状态规则。

真实 Review 调用 `e447d535-02aa-4d80-a2ae-e2d0af3e0267`，worker 退出 0，结构化输出经 Controller 校验。审查实读门、交互、生成、顾客入口/导航源码、新生产策略、C++ 回归和 runner、执行者报告、Writer 与清理审计。证据包含 16 个成功命令的完整工具输出；4 个命令失败也保留，其中 Python 嵌套引号错误通过后续读取纠正。原 helper_unknown_error 未再次阻断本次 Review。

审查重放原 EXE：229 checks，0 failures，退出 0；不是重编译或 UE 现场测试。Controller 独立验收仍仅 git diff --check，不能据此声称功能全面通过。

## 5. Controller 最终结果

真实 verdict：**rework**。具体发现：CustomerCharacterNavigation.cpp 先解析门口 EntryWaypoint；CustomerNavigation.cpp 因关闭门扇占用返回 GoalOccupied，尚未发出 MoveTo。如果顾客在自动开门范围外，便不能靠近触发开门，可能持续重试并退出。现有纯策略回归未覆盖这项接入组合。审查要求最小修复闭门接近/开门协调，并补回归，保留正常碰撞及正门路线。

这是正常源码审查发现的 OpenWorld 问题，不是读取环境再次失败。没有把 rework 改成 pass，也没有在本轮修改游戏代码。原返工上限已达，Controller 保持：

- phase=paused；nextPhase=execute；reason=Rework limit reached。
- loops=3、reworks=2 保持；决策调用数从 5 正常增加至 6。
- 原 Plan、已完成 Execute、两条原 Thread、失败审计与审批历史保留。
- 未重置预算/返工限制，未再次 Plan/Execute，未批准 Delivery。

## 6. 游戏成果保持与人工事项

OpenWorld 工作树 `D:/OpenWorld-Worktrees/p3a-cafe-entry-20261010`；分支 `agent/p3a-cafe-entry-20261010-20261010-132005-7d2503`；HEAD `f34216b2ca1dd899f85744349c069813df643308`。恢复前后 15 个原修改/新增文件内容哈希全部一致；本轮未提交或合并游戏成果。忽略目录内工具统计可能更新，不冒称整个磁盘完全未写入。

游戏还需处理本次 rework，不能仅等待 UE 现场即视为合格。UE 适配层未编译；实际门碰撞/动画、玩家与多人通过、Blueprint 覆盖、Spawn/入口坐标、NavMesh/楼层连接、有效坡道及限定区域 CityMain 集成仍待人工现场验收。本轮没有启动编辑器、游戏、GUI 自动化、Cook、大型构建或压力测试。

## 7. 可集成候选与测试

原 P3A `fff5dcc940d7eff0c259126776fcf5d42f51bc62` 的全部 30 个文件已核对存在。相对原 P3A，仅决策传输/worker 及对应测试有必要修改，另增加运行时配置、新回归、问题记录与本报告。完整主体包括 Codex 决策适配、P2A 双决策组合、UI 选择、审计/恢复、严格校验，未仅保留 Windows 修复。

Schema 仍保留原始本地严格规则：wire uniqueItems 移除、可选项 nullable/required 适配后，回传恢复缺省项，再验证原 Schema，重复依赖仍拒绝。原 Controller Review Guard 和 Delivery 人工审批未修改。

构建：npm run build，通过。串行轻量专项：node --test --test-concurrency=1 dist/test/codex-decision-agent.test.js dist/test/codex-output-schema.test.js dist/test/codex-decision-runtime.test.js，**24/24 通过**。包含单/双决策组合、失败恢复与 Thread 归属、Review Guard、Schema 及运行时选择；本地替身通过不冒充新的远端双决策验收。前轮 3000ms 超时历史保留，本轮未复现，未扩大测试超时。

技术验收结论：在本报告明确的 opt-in 官方兼容配置下，已具备真实结构化 Plan 成功证据、独立 Execute 成功证据、实际只读源码读取、真实 Review 返回/Controller 校验以及中断续接证据，**本轮读取恢复技术范围 PASS**。默认 elevated 原始兼容缺陷未修复，不能宣称所有 Windows 配置均已通过；游戏结果仍为 rework。

## 8. 提交、问题记录及收尾

任务分支 fix/codex-decision-schema-real-v1，基线 `ddb098aedff7a40dc4a161f2e8eda8722bf32598`。本轮用户明确授权提交完整候选，覆盖前轮禁止提交的限制；不合入 PersonalAgent DEV/MAIN，不 push，不批准游戏 Delivery。

本报告纳入候选提交。Git 提交无法在自身文件中包含自己的最终 SHA；提交后精确 SHA、文件清单与绑定记录写入 `D:/PA-P3A-OpenWorld/20261010/recovery/commit-receipt.json`，外部同名报告也写入该 SHA。

重要更新：problems/2026-10-10-codex-decision-remote-schema.md（已观察真实场景稳定，本轮专项通过）；problems/2026-10-10-codex-decision-windows-readonly-tools.md（本任务读取恢复，原 elevated 缺陷及网络边界保留）。最新游戏 rework 理由保存于原 Run 与本报告，不混淆问题归属。

本轮清理审查：未新增大型运行时副本、UE/资产缓存；SDK 自有 schema 临时目录按其机制清理。D 盘探针、恢复脚本、事件、审计、源文件哈希与测试结果保留供人工复核，缓存/依赖和有效构建保留供候选验收。本轮没有手动删除共享 C 盘数据，新增最小真实 Thread 会话保留作中断恢复证据，原两会话也保留；全局认证/配置未变。任务 Writer 两项保留，不释放其他任务锁。全部本轮模型、测试调用结束后停止，等待人工验收；不留继续开发的后台任务。
