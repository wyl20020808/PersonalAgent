# Project Context V1.1 第三阶段验证报告

日期：2026-10-09。本文记录工程实现、确定性验收和可观测边界。付费 T1/T2/T3 尚未获得授权，实际付费调用为 0；注入式 Mock 的数值不代表真实模型表现、真实用量或成本节约。

## 1. 开发基线与治理

- 开始和结束核对的 dev：`3e3c4ba8fdf6331e8d4929371c0fc18f07312b19`。
- 主目录 main：`be878bdc5e606a1461ef7085e4b1daa197147084`。
- 分支：`feature/project-context-v11-phase3`。
- Worktree：`D:\PersonalAgent-worktrees\tasks\project-context-v11-phase3`。
- 发起入口为当前 Codex 桌面开发会话，没有声称此工程开发已经由 PersonalAgent 的付费双 Agent Run 完成。测试中的 Run 是正式 Controller 创建的隔离本地夹具。
- 已读取治理规则 V1、AGENTS.md、CLAUDE.md、统一规则与执行契约；没有提交、合并、推送、发布或修改真实游戏项目。原主目录和 dev 的未跟踪文件没有清理。
- 治理文件第十二节的目录/分支清单是历史快照；实际状态以本次 Git 核对为准。当前任务的显式 Worktree 授权与长期治理一致。

## 2. 读取和供给记录

每次 RealAgents Plan、Execute、Review 建立唯一 callId，和 Context Manifest 共用标识。启用 Context 时沿用原有 manifest 和完整装配回执；未启用时创建不含 Prompt 正文的归属/字节摘要回执，不改变原有 repository Prompt。

在正式 Run 的 `context/` 中新增：

- `<callId>.reads.jsonl`：供给、读取、Shell、观测覆盖和数值来源证据。
- `<callId>.usage.json`：本次调用的用量回执。过程中保存当前调用进度，结束时保存结果。

读事件包含 Run、Task、Call、phase、Agent、workspace、manifestPath 和观察时间。Manifest 补充 Task、Agent、源码目录与任务摘要；版本仍使用当前工作区 HEAD 和现场快照。原生 CLI 不提供的工具执行时间不推测，事件时间是 Controller 观察时间。

`supplied` 只描述实际 Prompt 中存在的内容：overview 片段、模块目录、文件树，以及 Review evidence 中的契约/决策全文，包含路径或 JSON Pointer、SHA256、UTF-8 字节、选择理由、版本和省略摘要。模块文档路径的导航不是正文供给，也不是 Agent 已读证据。当前第一阶段机制并不自动注入全部模块源码，本阶段保持该行为。

`confirmed-read` 只来自本次 Claude CLI 的 Read 请求与成功文本结果配对：tool_use ID、file_path、`tool_use_result.type=text`、`file.filePath/content/startLine/numLines` 均可核验才记录实际范围。内容只用于判别，不复制到新的统计文件。请求的 offset/limit 不当成实际读取范围。失败另记 `read-failed`；无结构范围、非文本、陌生工具、无法配对和危险路径记为不可观测。

Shell 仅保留经过现有脱敏及敏感命令行参数补充脱敏的命令、工具 ID、状态和已提供退出码。Bash 缺少退出码时为 null；Codex 支持负退出码。没有从 Shell 路径生成读取事件，没有操作系统级文件监控。未知 MCP 不冒充原生读取工具。

沿用路径排除规则并拒绝越界、敏感路径、符号链接及硬链接文件。所有新文件以 fresh callId 排他创建，不截断历史回执。读回执逐事件进入原审计链；结束审计绑定 reads 和 usage 文件哈希。用量摘要读取通过原有审计链验证的数据，不相信 Renderer 或未审计统计文件。

## 3. 原生用量映射与证据

本机只读版本核对：Claude Code `2.1.286`；项目锁定 `@openai/codex-sdk 0.161.0`。版本查询不调用模型。Claude 映射参考 [官方用量说明](https://code.claude.com/docs/en/agent-sdk/cost-tracking)；Codex 映射以本 Worktree 的 `node_modules/@openai/codex-sdk/dist/index.d.ts` 中 Usage、ThreadEvent、CommandExecutionItem 的实际声明为依据。没有修改 SDK/CLI、模型设置或工具权限。

| 统一字段 | Claude Code | Codex SDK 0.161.0 |
|---|---|---|
| inputTokens | `input_tokens` / fresh `modelUsage.*.inputTokens` | `turn.completed.usage.input_tokens` |
| outputTokens | `message_delta.usage.output_tokens` / fresh result | `output_tokens` |
| cacheReadTokens | `cache_read_input_tokens` / `cacheReadInputTokens` | `cached_input_tokens` |
| cacheCreationTokens | `cache_creation_input_tokens` / `cacheCreationInputTokens` | `cache_write_input_tokens` |
| actual model | 本次请求的 `message.model`，init.model，或 fresh modelUsage 键 | 该事件协议不暴露，null |
| modelRequests | 本次可识别请求 ID 去重数；未观察到时 null | 内部请求数不暴露，null |

Claude 的普通输入、缓存读取和缓存创建分别保留。Codex cached_input 字段不再次加进 input；reasoning_output 不再次加进 output。不存在跨服务的强制缓存语义换算或金额估算。

Claude 按 API 消息 ID 和父工具 ID 去重同一请求的 sibling/流式消息。assistant output 是占位值；输出使用可识别的 message_delta 最终累计值。新会话有有效 modelUsage 时，以各模型完整报告替代中间/主循环统计，不重复累加。否则使用可识别请求或 fresh result 的报告，并明确整体覆盖可能不完整。

恢复会话时，result.usage/modelUsage 可能包含恢复的历史累计；将其留作来源证据但不计入本次。当前实现不猜测差分，也不依赖历史全局用量基线。只统计本次可识别请求，缺字段保留 null。没有模型请求事件的非流式恢复调用，其本次用量可以完全未知。

Codex 一次 runStreamed 为一个回合，重复 turn.completed 替换同一回合回执，不累加。worker 仅转发统计所需的命令/用量字段，不为统计转发完整工具结果。调用失败、无用量、超时、中断和 Schema 失败保留已收到的数据并标记 partial/unknown；没有 finish 的进度记录保持 running 且不完整，恢复后不把旧回执当成新调用。

`complete` 仅指协议报告的本次 input/output 完整，不表示掌握所有原生请求、所有缓存字段、所有文件 I/O 或实际账单。Claude 请求级统计无法证明后台/内部辅助请求覆盖，标记 partial；新会话 modelUsage 可覆盖整体报告。来源 notes 和各字段的 null 独立保留。

## 4. Run/Task 展示与兼容

`runUsage` 从当前 Run 审计中按 callId 选择最后进度/最终回执，按 Task、phase 和返工分组，分别汇总 CC/Codex 的输入、输出和缓存。任一调用缺少某字段，该字段的严格总和为 null，不把未知当零。没有观测数据的历史 Run 不补造 Token。

Desktop 的 detail 接口返回统计，原白色运行详情增加简洁用量卡，展示 Plan/Execute/Review、返工、Controller 调用数、Prompt UTF-8 字节、模型、可识别请求数和完整性。没有大型 Dashboard，也没有群聊重设计。

提示词字节仅指 Controller 装配的用户 Prompt；不包含 CLI/SDK 内部系统指令或服务端扩展。**Prompt UTF-8 字节数、真实输入 Token 和最终计费金额是不同概念。**

没有修改 State Schema、调用预算账本、角色调度、Session、恢复、人工确认、交付预览/批准/应用、安全模式或模型选择。

## 5. 固定任务与独立验收

`scripts/context-regression-fixtures.ts` 固定初始源码、四类知识约定中的 overview/module/contract 文档、需求和模块 checked_files。每次创建新隔离目录，已有目录拒绝覆盖。`scripts/run-context-regression.ts` 将本地事件注入正式 RealAgents 适配器，由正式 createRun/drive、原预算、独立验收和原 Review veto 流程执行。

验收程序在源码目录外固定，避免 Agent 改写自身验收脚本。每次运行保留 fixture.json、config.json、result.json、实际计划、实际 Diff、Review、独立命令结果、manifest、reads、usage、审计和耗时。所有事件与结果明确标记 injected Mock。

| 任务 | 固定需求与断言 | 已验证的确定性行为 |
|---|---|---|
| T1 | HUD 12px/4px 改为 16px/8px；文字函数及 combat/world 源码逐字不变 | Plan 声明 game-app，无自动源码包；独立验收通过，无返工 |
| T2 | reach=3，wallX=10，共享单位 m；首候选故意设 reach=4、world.unit=cm | 实际两模块 Diff 触发 expandedModules=world；Review 收到几何契约全文；即使注入 Review pass，Controller 也否决独立失败；一次返工后重新验收通过 |
| T3 | main reach=2、dev reach=5；dev 说明和 checked_files 预置为旧 main 数据 | Git 版本和工作区不同，调用现场发现哈希不一致；核对当前源码并更新说明，不改变两个版本的业务源码；再次调用生成新 manifest，不读取旧 manifest 当索引 |

T3 在确定性 suite 中还覆盖普通目录及 Git main/dev。两个固定 Git 夹具均从同一固定 main 文件条件创建，dev 分支仅变更指定业务值；不是 PersonalAgent main/dev 分支的修改。此处没有重新引入索引缓存机制。

指标与独立断言的输出、实际变化和审核记录绑定。Mock 能验证固定断言、控制流程、读取归属、Prompt 字节和注入统计；不能判定真实模型的关键约束理解、上下文错误导致的返工率或实际成本。`modelConstraintOmissions=null`，`actualPaidCalls=0`。T2 返工属于测试注入，不能归责为 Codex 自主犯错。

## 6. 实际验收

最终确定性验收 **PASS**：Controller 短路径全量 **231/231**，失败/跳过/取消均为 0；耗时 462754.6186 ms。短路径目录为 `D:\pa3reg\b4097eae`，最终日志为 `validation/phase3/controller-short-1791538714923.log`，测试字节指纹清单为 `validation/phase3/short-manifest-1791538714923.json`。其中新增观测和固定任务专项 14 项；第一、第二阶段专项文件均完整参与全量测试，不跳过断言。

实际命令：`rtk npm run build`；`rtk proxy node scripts/validate-phase3.mjs controller-short`；Desktop 的 `rtk npm run build`、`rtk npm run check` 和 `rtk proxy node scripts/validate-phase3.mjs desktop-test`。Runner 对 Desktop 使用完整 4 个测试文件、test-concurrency=1；对短路径 Controller 使用全部 17 个测试文件、test-concurrency=2。独立夹具工作区没有被当前开发会话并发修改。

已完成：Desktop build/check，Desktop 串行 test 72/72；Electron legacy 17/17、第一阶段 4/4、第二阶段 7/7、新详情 4/4，合计 32 项实际实窗检查。全部为新建本地 Mock/注入式事件/隔离夹具；真实付费 Agent 0 次。

最终 Desktop 日志：`validation/phase3/desktop-test-1791538758724.log`（89185.4588 ms）；Electron 原始日志分别为 `electron-legacy.log`、`electron-phase1.log`、`electron-phase2.log`、`electron-phase3-final.log`。新详情最终截图位于 `D:\pa3electron\a870d254`，包括 T1、T2、T3/main、T3/dev 的真实窗口截图，已检查最终 T2 截图的白色布局和统计展示，并通过四例真实窗口断言核验。新 Electron 验证脚本首次因为配置导入返回 Overview 而非 Profile 导致缺 profileId，修正测试取值后 4/4 通过；失败日志保留，不计入通过次数。

原始长路径全量日志 `validation/phase3/controller-full.log` 为 229 项、224 通过、5 失败：3 处旧测试假设不支持新事件或新回执文件，已在测试中显式按 activity/manifest/usage 类型检查；2 处为已有 Windows Git `fatal: '$GIT_DIR' too big`。原日志完整保留。

Desktop 初次并发回归 66/72，Mock 流程等待超时造成 6 项连锁失败；随后串行保留原断言复测通过。两个中间短路径测试快照因最终源码增加用量来源/脱敏测试而终止，日志保留，未计入最终 PASS。

最终短路径 runner 将最终 dist 测试逐字复制到短隔离目录，记录每个测试 SHA256，所有测试和断言完整保留，不使用 skip、不修改 Git 全局配置。它只能证明短路径等价条件下通过，不能说明底层 Windows 长路径原因已解决。

0xC0000409 与 0xC0000005 属于此前记录的底层风险，最终日志未再次出现，本次不宣称修复。构建仍有 lucide-react 的非阻断 use-client 提示。

## 7. 变更清单

- `src/call-observation.ts`：协议专属读取/命令识别、用量去重、来源记录、回执和 Run/Task 汇总。
- `src/real-agents.ts`、`src/native-agent.ts`：在真实适配器和 worker 流程接入观测；不改变默认模型或权限。
- `src/context-navigation.ts`：调用归属元数据和当前 selected 模块核心哈希失配提示，保持导航限额和现场解析。
- `desktop/src/UsageSummary.tsx`、App.tsx、service.ts、types.ts、style.css：运行详情用量展示。
- `scripts/context-regression-fixtures.ts`、run-context-regression.ts、validate-phase3.mjs：固定多模块夹具、正式 Controller 注入式演示、保留日志的短路径/串行验证。
- `test/call-observation.test.ts`：读取、Shell、用量、恢复、失败、来源、审计、三个固定任务专项。
- `test/native-agent.test.ts`、`test/project-context.test.ts`：原断言适配新增 observation 事件和 callId 回执，保留第一阶段语义断言。
- `desktop/validate-project-context-phase3-electron.mjs`：真实窗口显示及隔离 IPC 检查。
- 本报告和完成验收后单独生成的真实回归预算单。

build 重新导出的 schemas 仅出现原有 LF/CRLF 工作区提示，Git 没有语义差异；没有扩大持久化状态结构。

## 8. 示例统计与尚未验证的边界

确定性 T1 演示（全部 Token 为显式注入的测试数值）：最新 evidence 为 `validation/phase3/mock-demo-1791538847843.json`，夹具根目录为 `D:\pa-pc3-demo\432736ee`，T1 Run 为 `17e9eb33-99f9-4791-8db5-c6a97e1268e6`；精简输出在 `validation/phase3/example-summary.json`。

```text
Controller: CC Plan 1 + Codex Execute 1 + CC Review 1 = 3 calls
Prompt UTF-8 bytes=22420（只指已装配用户 Prompt）
CC: input=180, output=24, cache_read=40, cache_creation=8
Codex: input=120, output=18, cached_input=30, cache_creation=null
supplied=8, confirmed-read=2, shell-command=1
Codex actual_model=null, internal_model_requests=null
整体完整性=false；paid_calls=0
```

真实可观察的是 Controller 的装配内容/字节/哈希/版本、原生流提供的可确认 Read 范围和命令，以及协议实际报告的用量字段。上例只能说明记录与汇总逻辑正确，不能用作真实 Token 预算、费用或节约证明。不同历史任务范围不一致时不可严格比较。

实际 Claude CLI 在所有插件、工具及读取模式下是否都会给出本实现支持的结构，还需授权后的真实回归确认；缺少结构就记录不可观测，不降级为从请求或 Shell 推断。没有获得完整文件 I/O 行为。Codex SDK 的模型标识和内部请求数仍不可获得。

本阶段最终交付停留在独立 feature 工作区。真实回归预算见 [独立预算单](PROJECT_CONTEXT_V11_PHASE3_REAL_REGRESSION_BUDGET.md)：预计 CC 7 / Codex 4，允许上限拟为 CC 10 / Codex 4，只有 T2 有一次纠正返工。此方案未获授权，未启动付费运行。全部确定性验收完成后才编制预算单。
