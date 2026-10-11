# PersonalAgent：Windows 本地双 Agent 控制器

## 当前开发流程：不再强制 Project Snapshot（2026-10-10）

选择项目目录并确认 Direct 写入授权后，CC Plan、Codex Execute、CC Review 使用原生工具按需读取、开发和测试。新 Run 不做全项目内容备份、全量哈希、轮次快照或每轮 Git fsck；项目容量和文件数量不再触发 Snapshot 启动限制。Git 与非 Git 均支持 Direct。Project Context 模块、契约、checked_files、Session/Run、工具调用审计和人工确认保留。

Git Diff 只辅助审查，包含已有未提交修改；未跟踪、忽略、非 Git 文件、二进制及超长 Diff 的内容未完整验证。配置测试通过不表示完整变更验证。无 Git 项目依靠原生工具与配置测试开发，Controller 明确显示未验证范围。

Clean Git 的显式 isolated 仍可克隆开发；非 Git/Dirty Git 的自动隔离复制与自动建档隔离入口暂不可用，请显式授权 Direct。无快照 isolated 不提供自动 Apply；Direct Delivery 仅确认已有成果，不再次写入项目。全项目恢复不可用；执行恢复续接已有 Session/Thread，保留文件并重新测试和审查。历史 Run/快照保持可读、不迁移、不清理。下文涉及全项目快照、完整文件清单、自动恢复/Apply 和旧 Review 回执复用的历史说明只适用于旧 Run。

详情见 [问题记录](problems/2026-10-10-large-project-snapshot-limit.md) 和 [本次验证](docs/REMOVE_MANDATORY_PROJECT_SNAPSHOT_V1_VALIDATION.md)。


第一阶段 CLI MVP：Claude Code 负责规划和审查，官方 `@openai/codex-sdk` 负责实现任务。Controller 独立检查 Git Diff、执行退出码和用户配置的验收测试，失败则返工，需要人工决策则暂停。

项目位于 `D:\PersonalAgent`。Controller 使用 Node.js 22、TypeScript、Ajv 和文件系统持久化；V0.3A 增加 Electron + React 桌面控制台，默认 Light 白色主题。没有数据库、ORCH、OCR、MCP 服务或 LangGraph，桌面端复用现有 Controller。

当前安装可直接双击根目录 `PersonalAgent.cmd` 打开桌面窗口。详细流程与截图见 `V03A_VALIDATION.md`。

## 立即运行

在 PowerShell 中执行：

```powershell
Set-Location D:\PersonalAgent
npm ci --cache D:\PersonalAgent\.cache\npm
npm run build
npm test
npm run demo
```

`demo` 自动创建新的独立 Git 测试仓库、仓库外的固定验收脚本、配置文件和运行状态，然后跑完整 mock 循环。每次使用新的目录，不需要清理或修改现有项目。

查看 CLI：

```powershell
.\Start-Controller.ps1 --help
# 如果本机 PowerShell 策略不允许脚本，直接使用 Node 入口：
node .\dist\src\cli.js --help
```

## 配置与真实运行

参考 `config.example.json` 创建自己的配置，建议放在 D 盘并命名为 `config.local.json`。`allowedRepositories` 是用户明确允许的项目根目录列表。Direct 支持 Git、Dirty Git 和普通文件夹，但需要明确写入授权，runtime 必须位于项目外。显式 isolated 仍要求干净且有提交记录的 Git 仓库。项目路径及文件链接保护继续生效。

`tests` 可以为空：允许开发，但逐任务进入人工验收，不能自动声称测试通过或据此交付。统一模式契约见 `PROJECT_EXECUTION_CONTRACT.md`，验收证据见 `V03C_UNIFIED_VALIDATION.md`。测试程序和参数只能来自用户配置，Agent 输出不会被作为命令执行。Windows 下使用原生 `.exe`，不要配置 `.cmd` 或 `.ps1` 包装器；例如用 `node.exe` 执行固定的验收脚本。强烈建议把验收脚本放在目标仓库之外，让 Agent 无法修改验收标准。目标仓库中的项目测试可以作为额外检查。

配置中主要字段：

| 字段 | 含义 |
| --- | --- |
| `mode` | `mock` 或 `real` |
| `runtimeDir` | D 盘运行目录，默认示例为 `D:/PersonalAgent/.runtime` |
| `claudeExecutable` | Claude Code 原生可执行文件名或绝对路径 |
| `timeoutMs` | 每次规划、执行、审查以及每条验收命令的超时；`0` 表示不设执行时间上限，桌面新建真实任务默认使用 `0` |
| `maxLoops` | 可选。整个运行允许的执行次数，包含返工和中断尝试；省略表示不限。桌面端不设置 |
| `maxReworks` | 可选。每个任务允许的返工次数，不含首次执行；省略表示不限。桌面端不设置 |
| `maxClaudeCalls` | 历史兼容字段：不再限制真实调用。实际调用数仍落盘统计，失败/中断也记录 |
| `minTasks` | 可选：规划至少包含的任务数量，默认 1 |
| `mockScenario` | mock 场景；real 模式下忽略 |

真实运行需要安装 Claude Code 原生 CLI，Codex CLI 二进制由锁定版本的官方 SDK 安装。认证、会话和缓存均使用 D 盘目录。

可以显式迁移现有 CLI 登录：

```powershell
node .\dist\scripts\import-login.js D:\PersonalAgent\.runtime
```

迁移脚本先把运行目录 ACL 限制为当前 Windows 用户，再复制现有 `auth.json` 和 `.credentials.json`，不会显示凭据内容，也不会覆盖已有 D 盘登录。`.runtime` 已加入 `.gitignore`。凭据过期时，由 CLI 正常刷新；刷新失败则需重新登录。

也可以在当前 PowerShell 设置 `CLAUDE_CONFIG_DIR` 和 `CODEX_HOME` 为运行目录下的 `claude` 和 `codex` 子目录，分别执行 `claude auth login` 和 `codex login`。API Key 方式支持 `ANTHROPIC_API_KEY` 与 `CODEX_API_KEY`；`OPENAI_API_KEY` 可以作为 Codex 的后备输入。不要把密钥写进配置或 README。

先验证独立仓库，再运行自己的目标：

```powershell
node .\dist\scripts\demo.js --real
node .\dist\scripts\demo.js --real --multi
node .\dist\scripts\smoke-codex.js

.\Start-Controller.ps1 start --config D:\PersonalAgent\config.local.json `
  --repo D:\MyAllowedRepository --goal "实现指定功能，满足固定验收脚本"
```

`demo --real` 输出配置路径与 Run ID，使用新建的小仓库完成真实规划、实现、独立验收和审查。`--multi` 使用两个有顺序的任务，验证 Claude Session 和 Codex Thread 续接，并在结束后再次独立检查最终文件。`smoke-codex` 单独检查 SDK 认证和结构化响应，不会应用返回的变更。

## 状态、恢复与停止

```powershell
.\Start-Controller.ps1 status --config D:\PersonalAgent\config.local.json --id RUN_ID
.\Start-Controller.ps1 stop --config D:\PersonalAgent\config.local.json --id RUN_ID
.\Start-Controller.ps1 resume --config D:\PersonalAgent\config.local.json --id RUN_ID
.\Start-Controller.ps1 resume --config D:\PersonalAgent\config.local.json --id RUN_ID `
  --decision "采用方案 A，继续当前任务"
```

正常的已落盘阶段可以直接恢复。人工暂停、错误、停止或中断的执行必须提供 `--decision`；不会静默重放执行。恢复审查前会重新跑独立检查。Claude Session ID 与 Codex Thread ID 都保存在状态中，后续调用使用对应的恢复接口。

触达上限时不会自行扩大限制。用户可以明确增加上限：

```powershell
.\Start-Controller.ps1 resume --config D:\PersonalAgent\config.local.json --id RUN_ID `
  --decision "允许继续，最多再执行两轮" --max-loops 12 --max-reworks 3
```

这里的数字是新的总上限。恢复时使用状态中的原配置，传入配置文件只负责定位运行目录；改动配置文件不会偷偷改变已有运行的政策。

运行中的 `stop` 通过请求文件触发取消；Ctrl+C 同样取消。Windows 使用 `taskkill /T /F` 终止 Controller 启动的子进程树，Controller 保留状态并释放运行锁。Codex SDK 位于专用 worker 中，其 CLI 子进程也随 worker 终止。强制结束 Controller 后，恢复会检查并清理失效 PID 锁；PID 仍存活时拒绝并发操作。

退出码：成功 `0`，错误 `1`，人工暂停 `2`，停止 `130`。`stop` 命令返回 `0` 只表示请求已经写入，可通过 `status` 确认最终状态。

## 当前原生执行边界

1. 默认原生执行允许 Agent 按项目授权读取、修改和测试。Direct 直接修改选定项目；isolated 在独立副本开发。完成开发不代表获准提交、合并、推送或发布。
2. 原生执行 Codex 使用 `danger-full-access`、`approvalPolicy: never` 和可用网络工具。项目约定和提示词不是操作系统权限隔离，不能据此承诺不会执行影响桌面的操作。
3. Work / Idle Mode 尚未集成到本开发基线；独立候选分支、全局 Codex Hook 的安装与 PersonalAgent 运行版能力应分别验收。不能把候选代码存在当作运行版已生效。
4. 新 Run 不做全项目快照。配置测试通过不表示全部文件变化已验证，完整未验证范围见本文开头。无快照 Direct 交付确认已有成果，不再次写入项目。
5. 独立检查失败时，模型返回 `pass` 也不能越过验收。新建 Run 在模型工作前检查验收可执行程序能否定位，并按正式交付规则拒绝位于 Agent 工作区内的验收文件。预检不执行测试，不证明其依赖或服务可信；项目自测可由 Agent 另行运行。`tests: []` 仍进入显式人工验收，不能自动记为测试通过。
6. `timeoutMs: 0` 只取消时间限制。流式 stdout / stderr 返回值各保留最后 1 Mi 个字符，较早输出不会全部保留在返回值中；非流式输出仍有累计大小保护。带逐行回调的超长单行和桌面全量审计读取仍需后续优化。

项目锁仍与旧版本共用同一位置。新恢复锁记录持有者 PID，以独有恢复声明避免多个新进程同时回收；仅 `ESRCH` 确认退出的持有者可自动回收。活动进程、无法查询的 PID、旧空锁和损坏锁都不会按时间强制清理；身份不明时提示人工检查。PID 复用可能保守地阻挡恢复，不宣称任意崩溃均可自动恢复。

当前测试区分历史快照 Run 与新 Run：历史测试明确构造旧状态并保留原安全断言；新测试验证有限 Git/Context 观察与未验证范围提示。局部测试通过不表示全库回归、GUI 或 Work Mode 已通过。当前修复记录见 [局部修复验证](docs/SAFE_RELIABILITY_FIXES_V1_VALIDATION.md) 和 [后续三项验证](docs/SAFE_RELIABILITY_FOLLOWUP_V1_VALIDATION.md)。

## 历史 MVP 设计记录（不代表当前实现）

以下保留早期 MVP 设计，不代表当前默认原生模式或当前 `proposal` 模式的实际权限。当前 Codex 执行两种模式均使用原生 Thread 配置；`proposal` 只改变结构化输出和 Controller 写入方式，不能提供只读工具隔离。下列禁用工具、只读 sandbox 等描述不能作为当前安全保证；完整快照检查仅适用于仍有快照的历史 Run。

1. Controller 只从允许的干净源仓库创建独立 Git 副本，禁用 Git hooks 和 fsmonitor，移除副本的 origin。源仓库不写入，结果不会自动应用、提交、推送或合并。
2. Claude 使用 `-p --output-format json --json-schema`，禁用全部工具、hooks、skills 和外部工具配置。它只收到 Controller 提供的上下文与检查证据，不直接读取或修改目标仓库。
3. Codex 使用官方 SDK、`read-only` sandbox、`approvalPolicy: never`、禁用 shell 和网络工具。Controller 提供有大小限制的仓库文本上下文；Codex 返回完整文件内容的结构化修改方案。Controller 仅将校验通过的新增和更新写入自己的副本。
4. 修改格式没有删除操作。拒绝绝对路径、`..`、反斜杠、NTFS 数据流、Windows 保留名、重复目标、符号链接和 junction，以及 Git 元数据、忽略规则、Agent 配置和指令文件。不提供自动合并命令。每轮最多 50 个文件、总计 2 MiB UTF-8 内容。
5. 独立检查包含未跟踪文件内容，检查 HEAD 未变化、未删除文件、当前轮确有变更、`git diff --check`、验收命令退出码，以及测试和审查期间快照未变化。Claude 即使返回 `pass`，独立检查失败仍会返工。
6. 只读 sandbox 是实际执行边界，不能替换成 `danger-full-access`。Controller 不把 AI 提示当作文件权限隔离。配置中的验收程序是用户授权执行的本机程序，**不在 Codex sandbox 内**；必须是可信程序。

MVP 使用“只读生成方案、Controller 写入”来确保没有未经授权的 Agent 删除。Codex 不会直接以可写权限操作仓库。需要删除、重命名、二进制文件、子模块或超大修改时，应先暂停并由用户在后续阶段扩展政策；本版本不会放宽这些限制。

仓库上下文最多 200 KB，单文件最多 100 KB；二进制和常见凭据文件不传入规划/执行上下文，省略列表会明确提供。大型仓库需要拆分任务；不要把含秘密的目录纳入目标。Git Diff 和测试输出会提供给模型并记录到审计日志，应按项目数据的敏感程度管理运行目录。

## 持久化与文件位置

```text
D:\PersonalAgent\
  src\                   CLI、Controller、状态、验证、适配器、SDK worker
  test\                  自动化循环与安全边界测试
  scripts\               独立仓库 demo、SDK smoke、登录迁移、Schema 导出
  schemas\               构建时导出的 JSON Schema
  dist\                  TypeScript 编译输出
  .cache\npm\           npm 安装缓存
  .validation\           每次测试/演示新建的独立仓库与验收脚本
  .runtime\
    claude\              Claude 登录、会话和配置
    codex\               Codex 登录、会话和配置
    cache\               子进程可配置缓存
    tmp\                 子进程临时文件
    runs\RUN_ID\
      state.json          原子替换的状态和两个会话 ID
      audit.jsonl         追加、flush 的 SHA-256 链式审计记录
      workspace\         允许执行的独立 Git 副本
      lock.json           活跃 Controller PID 锁
      stop.request        停止请求
```

JSON Schema 校验覆盖配置、规划任务、修改方案、审查结果以及持久化状态。状态写入使用同目录临时文件、`fsync`、原子 rename；审计与状态是两个独立文件，不宣称跨文件事务或断电下 exactly-once。执行中的崩溃需要人工确认后重试。审计哈希链可发现记录改动，但没有外部签名，不能防止本机管理员重写整个日志。

外部测试可读取 Controller 设置的 `PERSONAL_AGENT_TASK_INDEX`（从 0 开始）、`PERSONAL_AGENT_TASK_ID`、`PERSONAL_AGENT_FINAL_TASK` 与 `PERSONAL_AGENT_RUN_ID`，按阶段逐步验收。阶段来自 Controller 的任务状态，不能由目标程序决定。CC 调用计数保存在 `state.json` 的 `claudeCalls`，审计记录包含每次预约调用的编号、角色和 Session ID。旧状态没有计数字段时从 0 开始，因此历史调用数未知；严格额度验收应使用新建运行。

## 验证与已知范围

自动测试覆盖完整多任务循环、失败返工、独立检查硬门槛、人工暂停和恢复、停止、超时、循环/返工上限、Schema 拒绝、路径越界、无变更、快照篡改、退出码、锁和源仓库保护。测试都创建新的独立仓库，不使用游戏工程。

真实验证使用 `demo --real`，详情见 `VALIDATION.md`。CLI 仍可独立使用；V0.3A 桌面端不新增调度服务、数据库或自动合并。验收脚本覆盖程度和 Claude 对需求的理解仍决定功能验收质量；Controller 只保证执行流程、检查记录和权限边界。

接口依据：[Claude Code 非交互与 JSON 输出](https://code.claude.com/docs/en/headless)、[官方 Codex TypeScript SDK](https://github.com/openai/codex/tree/main/sdk/typescript)。依赖版本由 `package-lock.json` 锁定。

## V0.2A：失败诊断与恢复

验收失败仍由 Supervisor 决定返工、人工暂停或终止；Controller 继续以独立检查为硬门槛。`human` 表示 ASK_HUMAN，新增 `fail` 表示终止失败。Supervisor 返回 `pass` 但独立检查失败时，Controller 记录 veto 并进行有上限的返工。

执行错误、认证错误、超时及额度耗尽会保存 `failure`（类别、阶段、原因、是否可恢复）并进入 `paused`。不会自动重试这些运行异常；修复外部条件后使用 `resume --decision`。路径/Schema/快照冲突及明确的 `fail` 属于终止失败，不能用普通 resume 再次提交。用户停止仍为 `stopped`。

返工与执行次数在调用前写入状态。`reworks` 为当前任务次数，`totalReworks` 保存整次运行的累计次数，任务推进不会清空累计值。恢复不会清空 `loops`、`claudeCalls`、返工次数或会话 ID。达到返工上限后，普通 `--decision` 不能绕过限制；只有明确提高对应上限才可继续。

用户可以授权新的 CC 总上限，已使用次数不变：

```powershell
.\Start-Controller.ps1 resume --config D:\PersonalAgent\config.local.json --id RUN_ID `
  --decision "外部问题已修复，允许新增两次调用" --max-claude-calls 10
```

`application-N.json` 在写入前保存已经校验的方案和目标文件原始哈希。`applying` 阶段恢复只续写该方案，目标已是预期内容时不再写入，也不会调用 Codex；目标被其他内容改动则终止。执行中断且没有持久化方案时仍需要人工决策，重试占用返工名额。

`review-N-HASH.json` 保存审查回执，绑定 Run、任务、反馈、HEAD、快照与测试证据。恢复相同审查时可复用回执，无需重复调用 CC；人工修改决策或验收证据变化会使旧回执失效。旧 V0.1 状态缺少新字段仍可读取，但没有旧写入日志时不能追溯证明崩溃前是否写入；不会声称恢复历史的 exactly-once 语义。详情见 `V02A_VALIDATION.md`。

## 依赖、增量上下文与用量统计

任务可带 `dependsOn: ["task-id"]`。Controller 检查缺失依赖、重复 ID 和循环，并按稳定拓扑顺序串行执行；前向引用可用。只有独立验证和 CC 审查共同通过才把任务加入 `completedTaskIds`，失败或暂停的前置任务不能被跳过。旧任务没有该字段时保持原顺序。

可信配置可指定验收阶段，数字是 `tests` 数组中的零基索引：

```json
{
  "acceptanceStages": { "foundation": [0], "complete": [0, 1] },
  "taskStages": { "foundation-task": "foundation", "complete-task": "complete" }
}
```

任务可声明 `acceptanceStage`；指定 `taskStages` 后，每个任务必须在可信映射中，Agent 的声明不能冲突。规划上下文包含映射，用户应选择稳定任务 ID。验收命令始终来自可信 `tests` 配置，未知阶段、越界索引和未映射任务均拒绝。未指定阶段时运行全部配置测试。外部测试可读取 `PERSONAL_AGENT_ACCEPTANCE_STAGE`；拓扑排序后 `PERSONAL_AGENT_TASK_INDEX` 指执行顺序，ID 和阶段比计划原始位置更稳定。

每任务及每轮执行前保存文件基线，验收证据保留 `diff`（整个 Run）、`taskDiff`（任务累计）及 `roundDiff`（本轮变化）。CC 审查优先使用本轮 Diff，补充任务累计 Diff、依赖验收标准和完整测试证据；相同任务/本轮 Diff 不重复发送。完整证据留在状态和审计日志，Diff 哈希另记于 `diff-context` 事件。旧运行没有基线时回退到完整 Diff。

本轮 Diff 上限 60,000 字符，额外任务 Diff 上限 20,000 字符；被省略时明确标记 `diffOmitted`，Controller 阻止自动通过并暂停供人工检查。安全问题、所有测试退出码及 stdout/stderr 不截断。这里只优化审查上下文，规划和 Codex 的仓库内容限制仍沿用 V0.1。文件基线最多 50 MiB，超限安全失败；所有基线、Diff 临时文件位于该 Run 的 D 盘目录。

2026-10-09 起移除 PersonalAgent 内部付费预算门槛。真实 Run 使用已配置的 Claude Code / Codex，不需要 `global-budget-policy.json`、调用预约、每 Run CC 额度或 Session 累计额度。历史 `maxClaudeCalls`、`globalBudget` 和预算文件保留为兼容数据，不控制派发；不会伪造余额或改写旧账本。模型认证、服务商限流和订阅额度错误仍按原流程报告。

`maxLoops`、`maxReworks` 为可选上限：仅在配置中显式填写时生效，桌面端 Run 不设置，由用户在聊天中停止或调整。CC 审查修改后的独立复验循环用持久化 `reviewRepairs` 计数，仅在配置了 `maxReworks` 时受其约束。Run 暂停、失败或停止时可切换执行后端或模型后继续，切换写入审计并使用新的执行 Session。调用、工具和 Token 统计与审计链继续记录。

```powershell
rtk proxy npm run build
rtk proxy node .\dist\scripts\validate-v02b.js
```

测试结果、字节成本对比和局限见 `V02B_VALIDATION.md`。

## V0.2C：安全交付与人工审批

交付是独立 CLI 流程，Controller 自动开发完成后不会写回目标仓库。目标必须位于 D 盘、在该 Run 持久化的 `allowedRepositories` 中、当前分支与显式 `--branch` 一致、HEAD 等于 Run 初始提交，且工作区/索引干净。不切换分支，不做三方合并。需要新的目标开发分支时，由用户先创建并检出。

```powershell
# 第一步：只生成预览；不会修改目标仓库。
.\Start-Controller.ps1 delivery-preview --config D:\PersonalAgent\config.local.json `
  --id RUN_ID --repo D:\AllowedTarget --branch development
```

返回 Delivery ID、审批 SHA-256 和目录。先检查 `preview.md`、`diff.patch` 及含完整文件内容的 `manifest.json`；清单记录新增/修改、原始与预期哈希，目标状态、分支、HEAD、索引、验收规则摘要和成果快照。`targetStatus` 为空表示预检 Git 状态干净。Diff 预览包含 `NEW FILE` 段，不是供 `git apply` 执行的补丁。

```powershell
# 第二步：由用户明确批准本次具体摘要；批准本身仍不写目标。
.\Start-Controller.ps1 delivery-approve --config D:\PersonalAgent\config.local.json `
  --id RUN_ID --delivery DELIVERY_ID --approval SHA256_FROM_PREVIEW `
  --decision "我批准这次交付清单，目标分支和 HEAD 已核对"

# 第三步：应用已经持久化的批准。
.\Start-Controller.ps1 delivery-apply --config D:\PersonalAgent\config.local.json `
  --id RUN_ID --delivery DELIVERY_ID

.\Start-Controller.ps1 delivery-status --config D:\PersonalAgent\config.local.json `
  --id RUN_ID --delivery DELIVERY_ID
```

审批绑定 Run、目标、分支、HEAD、文件清单与内容、原始快照、规则和审查证明。批准后任何受校验内容变化，在下一次 status/apply 校验时撤销批准；不存在后台监视器。没有批准、摘要错误、预览替换、规则变化或目标冲突都不能应用。`delivery-approve` 是明确批准动作，decision 是用户的审批记录；它不是通过自然语言推断批准。

交付只接纳每个任务都有独立测试成功和 CC pass 记录的 completed Run。验收时新增规则指纹，覆盖测试配置、阶段映射、可执行文件及参数直接引用的文件。交付要求这些规则文件在 Agent 工作区外。旧 Run 没有历史规则指纹时仍可正常读取和使用原功能，但本版拒绝直接交付，不能追溯补一个哈希冒充旧验收证明。

应用沿用路径保护、UTF-8、50 文件和 2 MiB 内容限制；额外拒绝硬链接目标、文件模式变化、忽略文件碰撞。只新增和修改，不删除、不 commit/merge/push。每文件写入前落盘 intent，比较原始内容，写后校验哈希；最终检查完整文件快照、Git Diff 和 `git diff --check`。目标索引不写入。

```powershell
# 仅当应用进程曾中断，且目标仍满足持久化日志时，显式恢复。
.\Start-Controller.ps1 delivery-apply --config D:\PersonalAgent\config.local.json `
  --id RUN_ID --delivery DELIVERY_ID --resume
```

恢复只接受日志标记已写或 intent 对应的预期内容；已写文件不重写。重复应用只验证结果。外部冲突或异常进入 invalidated，撤销批准并保留现场，不自动回滚、删除或重新批准；需要人工处理后生成新预览。不得把任意目标变化当成自己的部分写入。

交付状态在 `runs\RUN_ID\deliveries\DELIVERY_ID`，Run 的审计链记录交付阶段、错误及最终 Diff。该安装的 `.delivery-locks` 目录保存目标排他锁；显式恢复只回收确认 PID 已终止的锁。遗留恢复锁、活跃/PID 复用等无法确认的情况要求人工介入。审批是本机 CLI 的授权记录，不是用户身份认证或防管理员伪造的电子签名。

本版没有跨文件事务，也不宣称通用 exactly-once。Windows Node 文件 API 不能对不合作的外部写入者提供原子 compare-and-swap；操作时应保持目标分支独占。本版检查写入前/后的内容、文件链接与快照，检测到冲突就停止；断电留下第三种内容时不能自动恢复。验收指纹不递归解析 import/require、环境变量或外部服务，应使用可信、自包含的外部验收程序。

```powershell
rtk proxy npm run build
rtk proxy node .\dist\scripts\validate-v02c.js
```

Mock 测试、真实进程终止与恢复证据见 `V02C_VALIDATION.md`。

## V0.3A：Windows 桌面控制台

默认白色面板、灰蓝背景和青绿强调色。提供工作台、新建开发任务、运行详情、交付审批、运行记录与设置。运行状态、任务依赖、测试输出、会话 ID、调用和返工次数均读取实际 Controller 记录；Mock 明确标记，不消耗真实额度。

当前已构建安装的启动方式：

```powershell
Set-Location D:\PersonalAgent
.\Start-Desktop.ps1
# 若本机 PowerShell 执行策略限制脚本：
node .\desktop\node_modules\electron\cli.js .\desktop
```

也可双击 `PersonalAgent.cmd`。本版为本地未打包桌面应用，没有安装器、代码签名或自动更新。主进程使用本机 `C:\Program Files\nodejs\node.exe`，需要已有 Node.js 22 和 Git。

首次重新安装或重新构建时：

```powershell
Set-Location D:\PersonalAgent
New-Item -ItemType Directory -Force D:\PersonalAgent\.cache\tmp | Out-Null
$env:TEMP = 'D:\PersonalAgent\.cache\tmp'
$env:TMP = $env:TEMP
$env:npm_config_cache = 'D:\PersonalAgent\.cache\npm'
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
npm ci
npm run build
npm --prefix desktop ci
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = $null
node .\desktop\install-runtime.mjs
node .\desktop\build.mjs
```

使用顺序：

1. 点击“新建任务”，再点击“准备 Mock 工作区”。每次创建全新 D 盘隔离仓库，正常场景生成 hello/done 标记文件；可选择返工、人工暂停、失败或超时场景。
2. 填写目标，核对可信配置与流程限制，点击“确认并启动”。运行详情显示真实任务轨迹、独立测试和经哈希链校验的审计日志。
3. “暂停 / 停止”发出安全停止请求，最终对应 Controller `stopped` 状态。恢复需明确决策，原有用量计数保留；不可恢复失败禁用恢复。
4. 完成后进入“成果交付”。先填入目标仓库当前已检出的分支并生成预览；核对文件、Diff、HEAD、验收摘要与审批摘要。批准需输入完整摘要、说明并通过 Windows 原生确认；应用是另一项单独操作。
5. 真实项目先通过文件选择器导入本人核验过的 D 盘 Controller 配置。GUI 只允许白名单仓库和可信流程限制，不能编辑验收命令。真实开始无需付费预授权；首次直接修改项目目录与正式交付仍需独立确认。

CafeGame 历史配置首次启动时仅作为只读记录导入，不复用旧授权发起新任务，不对已交付成果再次写入。设置显示本地 CLI/SDK 是否存在，不把安装存在性当成已认证或额度可用。认证与登录目前仍使用原 CLI，GUI 不读取或展示认证文件。

GUI 数据、Electron 会话、日志、crash dump 与可配置临时文件默认保存到 `D:\PersonalAgent\.desktop-data`。可在启动前设置 `PERSONAL_AGENT_DESKTOP_DATA` 为另一个 D 盘路径；测试使用独立目录。Agent 数据继续使用各可信配置自己的 `runtimeDir`。

```powershell
node .\desktop\validate-tests.mjs  # 类型检查、构建、13 项适配层测试
node .\desktop\validate-gui.mjs    # 实际 Electron 窗口、17 项 Mock 交互检查与截图
node .\dist\scripts\validate-v02c.js  # 原 Controller 全量回归
```

桌面窗口测试复用现有 `snake-validation/node_modules/playwright-core`，该依赖只用于开发验收。验收结果与限制见 `V03A_VALIDATION.md`，通信与视觉规范见 `desktop/ARCHITECTURE.md`、`desktop/DESIGN.md`。

## V0.3C：三人项目群

默认主页面为一个宽敞的白色群聊窗口。你和 Claude Code 的消息靠左，Codex 的消息及头像靠右；Controller 以居中的系统事件展示派单、阶段变化与进程退出。没有独立的 Codex 聊天窗口。右侧详情栏默认隐藏，通过聊天标题栏“项目详情”展开；完整运行详情、测试、交付和历史页面继续保留。重启会恢复上次选中的已注册 Run。

历史消息从校验通过的审计链还原；计划、测试、日志、Diff 和长审查内容可折叠。角色筛选、暂停滚动、回到最新消息和截图入口均位于聊天工作区。Mock 有明确标签，不把历史回放当成新的真实 Agent 调用。

输入用途必须明确选择：普通补充消息只保存为“未生效”备注，不注入正在执行的任务；恢复、返工和视觉确认通过原 Controller 恢复接口处理。视觉确认需打开本阶段可信截图并明确勾选确认。普通聊天不能批准交付，用量不会因恢复而重置，流程防循环限制仍生效。完成后仍需进入正式成果交付页，分别批准具体摘要和应用。

新配置可选 `"claudeStreaming": true`，使用 CLI `stream-json` 的公开文本与接收状态，最终结构化结果仍经过原 Schema 校验。未设置时保持原 JSON 调用；旧 Run 的配置与授权不变。Codex worker 转发 SDK 公开事件和摘要。隐藏思维链不可获取；没有事件时显示实际阶段和持久化结果。本阶段只进行了 Mock/注入响应测试和真实历史回放，未进行新增付费流式联调。

可信外部验收程序可在 JSON 输出中返回 `artifacts` 目录，目录必须位于该配置外部验收脚本相邻的 `artifacts` 根下。Controller 记录 PNG 尺寸、来源、Run/Task/Loop 和哈希；GUI 用受控图片协议展示、放大及前阶段对比。旧记录的图片首次导入时固定哈希并标为 `historical-import`，不会改写历史 Run。图片未自动传入 Claude；需要视觉判断时继续由负责人明确确认。

启动仍使用 `Start-Desktop.ps1` 或 `PersonalAgent.cmd`。已经打开的旧版本窗口需正常关闭后重新启动，才能载入新的主进程接口。测试命令：

```powershell
rtk proxy npm run build
rtk proxy node .\desktop\validate-tests.mjs
rtk proxy node .\desktop\validate-gui.mjs
rtk proxy node .\desktop\validate-v03c.mjs
rtk proxy node .\dist\scripts\validate-v02c.js
```

完整结果、截图、真实活动流限制及安全说明见 `V03C_VALIDATION.md`。FishEatFish 交付仍为 preview，未获本次批准、未应用。
