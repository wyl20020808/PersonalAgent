# Global Work / Idle Mode V1

本功能由独立 Codex Desktop 开发，基线为 `dev@ddb098aedff7a40dc4a161f2e8eda8722bf32598`。任务分支为 `feature/global-work-idle-mode-v1`，工作区为 `D:\PersonalAgent-worktrees\tasks\global-work-idle-mode-v1`。没有创建 PersonalAgent Agent Run，没有调用付费模型，没有替换正在运行的 MAIN、DEV 或 FPSArena。

## 模式和用户操作

设置页增加紧凑的“工作 / 上课”“空闲”选择框。`overview.interactionPolicy` 显示当前状态及配置异常原因；切换通过现有受校验的主窗口 IPC，新增 `interactionMode` 操作只接受 `work` 或 `idle`，不打开提示框。用户操作记录在各实例原有的 `user-actions.jsonl` 中。

MAIN、DEV 都读取固定路径 `D:\PersonalAgent-data\global-interaction-policy.json`。生产路径不接受环境变量、Run 配置或模型参数覆盖。文件结构为 `{"version":1,"mode":"work"}`，用户写入时还记录 `updatedAt`、`updatedBy:"user"`。临时文件独占创建、flush 后原子替换；Windows 短暂占用时沿用既有有限重试，不删除目标或回退为原地写入。缺失、无法读取、损坏、超过 4096 字符、未知版本和未知模式均采用 work。

模式不是 Session 或 Run 的属性。原有实例数据、项目锁、Session、Run、P2A 独立身份、Project Context、审计、恢复和成果审批保持原来的归属。不会自动续跑；用户先切换 idle，再明确恢复原 Run。切换 idle 不代表批准高风险行为、交付、推送或发布。

## 已实施的技术限制

| 执行位置 | work 行为 | idle 转 work 的处理 |
| --- | --- | --- |
| Controller `agentOperation` | 真实 Agent 派发前暂停，保持可恢复状态，不增加真实调用计数 | 100 ms 轮询，取消当前信号，保存为 paused，不自动恢复 |
| `RealAgents.plan/execute/review` | 拒绝真实原生入口，包括 P2A 决策者 | 外层 Controller、进程及 SDK 取消共同处理 |
| Claude Code CLI adapter | 在 Session 分配、调用计数和进程启动之前拒绝 | `runProcess` 仅终止自己持有的 PID 树 |
| OpenCode adapter / `startOpencodeService` | 在调用计数及服务启动之前拒绝；模型发现同样延后 | 关闭自己启动的服务树；Controller 保留 Run 并要求明确恢复 |
| Codex SDK `runCodexTurn` | 在 start/resume Thread 前拒绝 | 传递 AbortSignal 给 SDK；检查后续事件；外层专属 Worker 进程树也可取消 |
| `runProcess` | 未审查程序、Node/Python 脚本、CMD/PowerShell、浏览器和未知包装器全部拒绝 | 100 ms 轮询，取消受管理进程树，后续启动继续拒绝 |
| Desktop 真实 Controller 启动 | 拒绝启动无法可靠约束的真实原生流程 | 已启动的 Controller 使用上述轮询和持久化恢复 |
| 独立 Codex 的 `codex-policy-launch` | 在启动 CLI 前拒绝 | 复用受管理进程轮询和仅持有 PID 的取消 |

这不是命令字符串黑名单。`runProcess` 使用默认拒绝策略，work 只接受固定结构的 Git 观测命令：必须具有关闭 hooks、fsmonitor 和长路径支持的原有配置前缀；diff 必须禁用 external diff 和 textconv；参数必须属于精确允许的形式。未知程序、参数、别名、脚本和包装器不会因为名字看起来安全而放行。未审查的构建、测试、Git 写入/clone/fsck 同样延后到 idle。Git 策略拒绝保持可恢复错误，不改写为永久 Git 故障。

源码文件 API、现有 `applyEdits` 和 Mock 文件编辑没有被禁用。已验证 work 下正常新增源码。Mock 仍可修改授权项目，但需要运行未知验收脚本时会暂停，不能把 Mock 身份当作进程豁免。真实原生 Agent 因无法可靠约束而整轮暂停；这是 V1 的明确能力限制，不声称保留了 work 下完整的自主真实开发能力。

Controller / CLI / SDK 使用原有规则并追加全局交互规则。没有重新引入全量 Snapshot，没有改变 Real/Mock 身份、P2A 双决策者、Project Context 或原有正式交付审批。

## 独立 Codex 的实际核查

现场安装：npm Codex CLI `0.147.0`；Desktop 内置 `codex.exe` 为 `0.162.0-alpha.2`。Desktop GUI 产品版本未通过此次只读核查获得，不将内置运行时版本冒充产品版本。CLI 帮助及 app-server 类型协议包含 Hooks、`hooks/list`、信任记录和沙盒选项。用户配置存在 `[windows] sandbox="elevated"`、多个项目 trust 和其他既有 Hook 的信任记录；本次没有修改这些设置或读取认证文件。

官方文档说明非 managed Hook 必须信任；本地工具通常可被 PreToolUse 拦截，但 hosted 和部分专用路径有覆盖例外，`write_stdin` 不重复执行 PreToolUse，执行失败的 Hook 不构成完整边界。参考：[OpenAI 官方 Hooks 文档](https://learn.chatgpt.com/docs/hooks)。本实现用实际探针核查，没有仅凭文档或 enabled/trusted 状态作结论。

使用隔离 `CODEX_HOME`、独立工作目录和本地确定性 Responses HTTP 服务，真实启动两套已安装运行时。模型输出是本地 Mock；Shell 调度由真实 Codex 执行。唯一命令是无害的 `echo POLICY_HARMLESS_PROBE`。结果如下：

- 两套运行时都发现 PreToolUse，显示 enabled；信任记录可从 untrusted 变为 trusted。
- 初始带空格路径的启动命令未正确调用 Hook；无空格路径证明 Hook 执行，但同时返回 JSON deny 与 exit 2 的版本仍未阻断。最终使用 PowerShell `&` 调用带空格路径，Hook 只在 exit 0 的 stdout 返回结构化 deny。两套运行时在持久信任、没有 trust bypass 的条件下都实际拒绝 Shell，工具结果包含 `Command blocked by PreToolUse hook`，没有执行 echo。非零退出状态在包装层怎样转换尚未进一步定位；最终传输形式已由真实运行时验证。
- `command/exec` 的无害 RPC 探针发生“无法创建目录或文件”基础设施错误，无法据此证明被 Hook 阻断或可靠覆盖。
- CLI 实际放行项目内 apply_patch 并新增 `source-probe.ts`，Hook 审计记录 allow；源码编辑未被禁用。Desktop 内置运行时在本地模型夹具的工具目录中未提供此 custom tool，返回 unsupported，不能宣称它通过了同一源码编辑测试。脚本干运行另外验证策略、规则、越界及符号链接路径拒绝。
- Mock MCP 工具未到达 handler，但工具目录未注册该工具，返回 unsupported；这不算 Hook 拒绝。任意 MCP、浏览器、computer-use、默认模型下的嵌套 code-mode 调用和既有 `write_stdin` 会话仍未证明覆盖。MCP/插件的启动阶段也不属于模型工具调用拦截。工作模式不能批准未覆盖的潜在交互路径继续执行。

因此，**独立 Codex 的隔离 Shell Hook 已真实生效，CLI 源码 patch 已真实放行；live 用户目录尚未安装，任意独立 Desktop/CLI 直接启动尚未接入此策略，不能宣称完全保护**。问题记录为 `problems/2026-10-10-codex-hooks-not-enforced.md`，Shell 拦截已解决，专用工具覆盖仍待验证。保守启动入口覆盖通过下列脚本新启动的 CLI：

```powershell
rtk proxy node dist/scripts/codex-policy-launch.js <codex.exe绝对路径> <工作区绝对路径> --json <任务文本>
```

该入口使用原用户配置和 CLI exec；work 不启动原生 Agent，idle 运行时监测同一全局文件。它不能接管已经启动的任意 Desktop、其他 CLI、用户浏览器或课堂软件。本次没有在 live home 安装规则或 Hook，也没有启动真实模型任务验证该入口的付费服务行为。

## 全局安装准备与回退

`scripts/stage-codex-interaction.mjs` 只在隔离目录生成安装候选。现有全局 AGENTS.md 的原内容作为完整前缀保留，再追加工作模式规则；原 hooks.json 的内容合并保留；config.toml 只备份，不覆盖。产出包含独立 Hook bundle、原文件 SHA-256 和安装/回退清单，既有 Hooks 的信任记录不被删除。

全局安装必须取得针对具体候选的明确授权。安装前重新核对原文件哈希，保存现有会话和完整备份；文件变化时重新准备，不能覆盖用户后续修改。安装后必须由用户信任精确 Hook，重启并在实际配置下通过无害探针证明拒绝；隔离 Shell 成功不证明当前应用全部工具已接入。回退按候选 manifest 恢复原文件，原本缺失的文件只撤回本次新建内容；不删除历史 Session/Run 或全局模式。

安装候选及 config 备份为本机私有验证资料，已从 Git 排除，不纳入提交。最终候选位于 `validation/codex-install-stage-verified`，可重新生成到新的目录。本次当前用户配置可能被其他活跃应用更新，不能把旧备份哈希当作永久安装授权。

## 保证边界

V1 在自己掌控的派发和进程启动处真正拒绝，并安全取消自己拥有的进程。没有按进程名杀 Chrome、课堂软件或其他用户程序。取消信号和 100 ms 轮询存在延迟；不能撤销已发生的操作，也不能可靠控制脱离进程树的外部服务。

“Agent 不修改模式”是规则与受控 API 边界，当前仍没有通过 Windows ACL 阻止同一用户权限下的任意原生进程写模式或改策略代码。test-only AsyncLocalStorage、依赖注入和模式文件参数用于隔离测试，不从生产环境变量、IPC、Run 配置暴露。它们不是操作系统沙箱。

更强保证需要独立 Windows 用户/权限与不可由 Agent 修改的策略目录、受保护的执行代理、Job Object / 进程树管理和独立桌面或 VM；普通 workspace-write/read-only 文件沙盒不能天然阻止所有桌面和系统交互。这些机制未在 V1 实施。本次不扩大为大型治理系统。

## 验证结论

策略后端专项 9/9；Desktop 最终 84/84；GUI TypeScript 检查、Controller 构建和 GUI 构建通过。没有启动 Electron 窗口，没有实际鼠标/键盘/剪贴板、窗口、关机、重启、显示或压力测试。所有危险请求只到 Mock 启动器，取消测试使用 Mock PID，确认没有无关 PID 操作。真实 Codex 探针只执行无害 echo，付费模型调用 0。

可复核命令（均在本任务工作区执行）：

```powershell
rtk proxy npm run build
rtk proxy node --test dist/test/interaction-policy.test.js
rtk proxy npm --prefix desktop run check
rtk proxy npm --prefix desktop run build
rtk proxy npm --prefix desktop test
rtk proxy node scripts/verify-codex-interaction.mjs <本机codex.exe绝对路径>
rtk proxy node scripts/verify-install-candidate.mjs
rtk proxy node --import ./scripts/regression-policy.mjs --test dist/test/dual-instance.test.js
rtk proxy node --import ./scripts/regression-policy.mjs --test dist/test/native-agent.test.js dist/test/decision-agent.test.js dist/test/decision-discussion.test.js
```

安装候选验证确认现有全局 AGENTS 原始字节完整保留，独立 bundle 的结构化 deny 与源码 patch 放行通过。不能通过最后一项历史失败的组合测试宣称全部 Agent 回归通过。证据摘要和真实工具结果保存于 `docs/evidence/global-work-idle/`。

根目录历史整库回归不是全绿：阶段性 feature 314 项，194 通过、120 失败；DEV 归档副本 307 项，148 通过、159 失败。119 项 feature 失败也在 DEV 副本失败集合中；唯一额外的跨进程 Mock 失败经测试夹具显式继承修复后，dual-instance 5/5。后续决策/原生 SDK 组合 49 项，46 通过、3 项仍失败，均在历史失败集合中。归档副本路径更长，Windows 路径限制影响比较，不能据此宣称完整回归通过或严格等价。旧 Snapshot/预算断言及其他失败保留在原问题文档，不恢复强制 Snapshot 来让旧测试变绿。

测试启动器使用明确的 idle 夹具，不读写 live 模式。Desktop 测试通过专用子类注入 `--import` 给测试子进程；生产主进程继续清除 NODE_OPTIONS，不能借测试修复放宽生产策略。新增 SDK 单测更新仅验证新增 AbortSignal，并另有真实取消信号的 Mock 验证，没有改动 Controller 的业务验收脚本。

这是独立 Codex 的自主验证，不是 Controller 独立交付验收。分支提交按本次用户明确授权执行；不合并 dev/main，不 push。尚需用户验收与另行批准集成，正在运行的版本尚未接入此实现。
