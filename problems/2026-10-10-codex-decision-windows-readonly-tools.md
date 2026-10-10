# Codex Decision 的 Windows 只读工具启动失败

- 归属：Codex Windows 沙箱运行环境；是否需要 PersonalAgent 适配仍待验证。
- 状态：本任务已通过显式官方兼容配置恢复真实读取和 Review；elevated 原始兼容故障仍未修复。
- 场景：OpenWorld 真实 Run `f957b797-feed-43ef-80dd-20e1fd714f4f`，修复 Schema 后第二次 Plan 调用 `25a03320-820c-4579-b949-366fe7b7d2bc`，决策 Thread `01a12444-d1c1-7253-866c-9bf9a3c0b34c`。
- 现象：两次 shell 命令均以 `exit_code=-1` 结束，`Failed to create unified exec process: helper_unknown_error: setup refresh had errors`。决策者诚实报告未核实文件并输出调查与修复计划，Controller 校验计划后派发独立执行 Thread。执行者的工具读取成功。
- 证据：Run 的 `audit.jsonl` 与 `context/25a03320-820c-4579-b949-366fe7b7d2bc.reads.jsonl`；`C:/Users/WYL20/.codex/.sandbox/setup_error.json`；`sandbox.2026-10-10.log` 在 UTC 05:28:05 记录运行时读/执行 ACL 校验针对 `node_repl.exe` 失败，Windows `os error 32`，并最终汇总 `setup refresh had errors`。
- 已确认事实：当时的沙箱初始化因运行时文件被其他进程使用，无法完成 ACL 更新。未证明这是 P3A 源码缺陷；没有关闭他人进程或修改共享 Codex 配置。
- 影响：真实结构化 Plan 成功不等于决策者已成功读取源码。不得将命令尝试写成全文已读，不能因此宣称读取能力验收通过。
- 下一步：真实 Review 复核工具能力；若持续失败，保留证据并标明读取/现场审查边界。任何修复应保留决策只读约束，不以 danger-full-access 规避问题。

## 真实 Review 与处理结果

- 三次 Review 调用分别为 `504a3f14-4a07-44c2-b9bc-2996534b77ce`、`bac4ae7b-72d0-4cba-b966-47443e116348`、`ccf97fd4-6f5c-4177-aafc-b5faa8493533`，均真实返回结构化结果，依次 rework、human、human；均无法真实读取新策略、测试及报告。不能将返回结果或 Controller 空白检查当作独立源码审查 PASS。
- 尝试按进程禁用 node_repl MCP，以及复制哈希一致的 node.exe/node_repl.exe 到任务专属 D 盘并覆盖运行时配置，均未解决问题。最新沙箱日志仍指向 C 盘原 node_repl.exe 的 ACL 刷新失败。已确认 Windows os error 32；配置覆盖未改变此刷新路径的具体原因仍未定位。
- 无效 worker 改动已全部撤回至原 P3A 内容，重新构建通过。未改共享认证、配置、只读沙箱策略，也未关闭桌面或其他任务进程。D 盘两份运行时副本已安全删除，回收逻辑 127,433,888 bytes，哈希与删除清单保留在 `D:/PA-P3A-OpenWorld/20261010/close-evidence.json`。
- Run 保持 paused，nextPhase=verify，保留原决策/执行 Thread、五次决策调用、三次执行调度（两次完成、一次中断）及恢复证据；未批准交付。
- 下一步需要修复本机 Codex 决策只读工具初始化环境，再由 Controller 续接同一 Run 完成真实读取与 Review。现有游戏逻辑不得因环境故障被无效返工。

## 2026-10-10 真实恢复验收

- Windows Restart Manager 仅查询指定运行时文件，确认 14 个 node_repl.exe 进程使用它，多数由 Codex Desktop 的 codex.exe（PID 3064）或其 node 子进程启动。没有调用关闭/重启 API或终止其他进程。与当次 elevated 沙箱 ACL 刷新 os error 32 日志共同确认阻断链：已加载的 Desktop 运行时被 elevated helper 尝试打开用于 ACL 更新，发生 sharing violation，工具进程无法创建。运行时根收集的具体内部规则及 helper 的实际访问掩码尚未定位，不能把该兼容缺陷宣称已被上游修复。
- SDK/实际 CLI 均为 0.161.0；Desktop 环境版本是 0.162.0-alpha.2，二者不是同一运行程序。决策仍继承已有 CODEX_HOME 认证/会话，全局 config.toml 内容哈希未变；模型配置保持 gpt-6.1-sol。
- 新增 `src/codex-decision-runtime.ts`，只接受显式环境变量 `PERSONAL_AGENT_CODEX_DECISION_WINDOWS_SANDBOX=elevated|unelevated`，通过 SDK 官方 config override 在 Windows 决策子进程选择沙箱实现。没有设置时完全沿用原行为，其他平台不覆盖，非法/完全不受限选项拒绝。恢复使用 unelevated；read-only、never、networkAccessEnabled=false 均保持，实际 Thread 上下文也记录 read-only/never。
- 官方 unelevated 是受限 Windows 令牌与 ACL 边界的兼容实现，但网络隔离弱于 elevated，不能宣称防火墙隔离等价。本轮不改全局安全或认证设置；不使用管理员身份或 danger-full-access。官方依据：[Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox)。
- 先进行无模型本地读取与写入负例：读成功；Set-Content 以 UnauthorizedAccessException 拒绝，源码未变。随后最小真实 Thread `01a1246f-6bb4-7452-8a82-a3da087c1298` 在真实工具启动后中断，续接同一 Thread 读出随机源码 token/返回值，工具退出 0，标准 Review 返回 pass 并经原始严格 Schema 校验；文件 SHA-256 前后一致。
- 最小测试通过后才恢复原 Run。真实 Review 调用 `e447d535-02aa-4d80-a2ae-e2d0af3e0267` 经原决策 Thread 读取指定源码、新策略、测试、报告和审计，重放 EXE 229 检查/0 失败，正常返回 rework 并通过 Controller 校验。原因是审查发现游戏闭门入口 GoalOccupied 与自动开门接近条件可能形成死锁，不是工具环境再次阻断；游戏问题归 OpenWorld，具体理由保留在原 Run Review 与恢复报告，不在此伪装成 PA Bug。
- 原计数 loops=3、reworks=2 未重置；decision calls 从 5 正常增加至 6。Controller 因原返工上限保持 paused，nextPhase=execute，reason=Rework limit reached。没有重复 Plan/Execute，没有批准 Delivery。
- 15 个原游戏修改/新增文件哈希均未变；两条原 Thread、任务 Plan 保留。技术读取恢复验收通过，但默认 elevated 故障、游戏审查返工与 UE 现场验收仍有明确限制。
- 证据：`D:/PA-P3A-OpenWorld/20261010/recovery/` 下 runtime-owners、baseline/unelevated probes、minimal-events/minimal-evidence、real-thread-permissions、before-recovery/recovery-evidence；完整原 Run 审计继续保留。
