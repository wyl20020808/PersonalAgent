# OpenCode Execution Agent P3C 验证报告

日期：2026-10-10。范围：独立 Codex Desktop 开发及本地确定性验证，不是 PersonalAgent 远端 Agent 开发验收。

## 分支与交付范围

- 分支：`feature/opencode-execution-agent-p3c`。
- Worktree：`D:\PersonalAgent-worktrees\tasks\opencode-execution-agent-p3c`。
- 实际开发基线：`ddb098aedff7a40dc4a161f2e8eda8722bf32598`，创建前重新核对了 `dev`。
- 最终受测代码 commit SHA：`e6a727cab702851e550ea95f6f2e7c6fd0529b39`。报告及问题记录单独提交在该代码提交之后；最终分支 HEAD 另在交付回复提供，避免报告自引用自身提交哈希。两个提交间没有源码差异。
- 本轮不合入 DEV / MAIN，不 push，不清理其他 Worktree。没有合入 P3A 或全局工作/空闲模式。

## 实际实现的能力

新增 `src/opencode-execution-agent.ts`。`RealAgents.execute` 根据唯一 `executionAgent` 选择 Codex SDK 或 OpenCode，沿用 Controller 已有的任务校验、顺序调度、预算、独立测试、Review Guard 和人工 Delivery 流程。没有另外建立开发系统。

OpenCode 接收 Controller 当前已校验任务及原有项目上下文，使用原生 `build` Agent 的 read、edit/write/apply_patch 和 bash 工具读取、修改项目、运行命令。执行返回现有 `{mode:"native",summary}` 契约；Controller 不从代码文本提取文件，也不重复应用提案。OpenCode 配置不允许 proposal 执行。

执行前核验实际工作目录、源目录授权、Direct 授权或 isolated 工作区映射、Run、任务、Plan、执行模型及持久状态。已完成任务、讨论未结束、任务不一致或角色配置改变均拒绝派发。

权限为原生 permission 规则：默认拒绝，开放必要文件及 Shell 工具、任务列表和 StructuredOutput，拒绝 external_directory；没有开放子 Agent、网页工具或未受控命令替代路径。规则和提示属于协作权限边界，**不是 Windows 沙箱**。bash 仍有用户级进程权限；不能宣称它从操作系统层面无法访问工作区外资源。

## 角色组合与 UI

| 决策者 | 执行者 | 本地验证 |
| --- | --- | --- |
| Claude Code 单决策 | OpenCode | 注入本地 CLI 响应及 SDK 服务通过 |
| OpenCode 单决策 | OpenCode | 本地 SDK 服务及兼容 V1 原生工具链路通过 |
| 两个 OpenCode 决策者 | OpenCode | 0/1 轮讨论、主决策汇总与最终 Plan 校验通过 |
| Claude Code / OpenCode 混合双决策 | OpenCode | 1 轮讨论、主决策与执行归属通过 |
| 原有单/双决策配置 | Codex SDK | 保持默认契约；回归结果见测试表 |

Provider/Model 可以相同，但决策、双决策参与者和执行 Session 必须独立。执行 Session 不能复用决策 Session。每个 Run 只能配置一个执行者。

沿用 P1 双池和现有 CSS、品牌图标，仅开放执行池 OpenCode 单选。执行 Provider/Model 独立于决策模型发现和状态；能力缺失或未知时禁用并显示原因，创建会话和真正 Execute 前再次核验。历史会话默认 Codex。正式聊天布局未重设计；执行消息使用已有右侧 OpenCode 样式，标记执行者、Execute、模型及 Session。高级运行详情也按实际后端显示。

UI 验证包括类型检查、构建、服务/会话/消息投影测试及 React SSR 双池结构断言。没有启动浏览器、Electron GUI 自动化或前台交互；没有完成实际屏幕像素验收。

## SDK、运行环境与事件

复用已有 OpenCode Runtime 和 owned service launcher，依赖官方 `@opencode-ai/sdk` **1.18.35**。代码导入 `@opencode-ai/sdk/v2` 是这个包的生成客户端入口，不表示调用本机 OpenCode Desktop V2。

本地原生验证使用兼容 V1：

`D:\PersonalAgent-data\opencode-compatibility-v1\toolchain\node_modules\opencode-windows-x64\bin\opencode.exe`

服务使用 loopback 随机端口、临时服务密码和隐藏子进程；执行数据独立放在 `<runtimeDir>/opencode/<runId>/execution`。复用既有 V1 配置映射，禁用项目配置及自动更新；没有修改全局 V2 登录、OAuth 数据库或凭据。

能力门禁实际查询 OpenAPI、已连接 Provider/Model、tool.ids 和 build Agent。必须具有 read、bash、至少一种写入工具、原生 permission、结构化输出、事件及 Session 生命周期接口；目录可见或 model 名称存在不能替代这些检查。

调用使用 `session.create/get/status/prompt/abort` 和 `global.event`。在 prompt 前订阅事件；使用 JSON Schema StructuredOutput、`retryCount:0`。Session/目录/模型归属不符、输出不完整、非终态工具、服务仍忙、事件流失去确认或进程退出未确认均不能作为成功结果。

原生工具由 OpenCode 执行。事件过滤具体 workspace 和执行 Session，公开 receipt 记录 `runId/taskId/sessionId/providerID/modelID/role/phase` 及工具 input/output/error/metadata。复用审计链、脱敏及活动上限，不展示隐藏 reasoning；不把未知工具返回值推断成成功。执行用量归属 `agent=opencode,phase=execute`，不冒充 Codex，也不计作决策 Claude 调用。

官方接口参考：[SDK](https://docs.opencode.ai/docs/sdk/)、[Server](https://docs.opencode.ai/docs/server/)。实际兼容性以本轮 V1 服务探测和本地工具证据为准。

## 恢复与失败处理

持久化 `executionSession` 和 `executionAttempt`，绑定 Run、目录、Provider/Model 及任务轮次。恢复必须核验服务端 Session title、目录、permissions 和 idle 状态；错误归属或未知 Session 不悄悄创建替代会话。

Controller 已持久化的 native result 沿用既有恢复路径，已确认成功的任务不重新 Execute。派发记录存在但结果未知、超时、取消或失败时保留已有修改，禁止无人工决定自动重放；明确人工恢复后在原执行 Session 中继续。失败调用原生 abort 并关闭 owned 服务及进程树，未确认退出则标为失败并要求人工处理。

跨进程退出后的执行 Session 恢复已经通过 SDK 注入服务验证；兼容 CLI 原生 Execute 跨重启继续及远端 Provider 的恢复行为仍待独立真实验收。没有宣称 Shell 任意后台进程具有 Windows 级安全隔离。

预留 `ExecutionPolicy` 注入入口，在服务启动和 prompt 前检查执行策略。没有接入并行开发的全局工作/空闲模式。

没有恢复强制全项目 Snapshot。工具 receipt 证明对应工具发生；有限 Git Diff、定点证据及独立测试按现有规则展示。缺少完整 Diff 时不能宣称全部文件修改已自动验证。

## 本地测试结果

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| Controller 构建 | 通过 | `.validation/controller-build-final.log` |
| Desktop 类型检查、构建 | 通过；构建有现有 lucide 模块指令警告 | `.validation/desktop-build-final.log` |
| OpenCode Execute 专项 | 14/14 通过；另追加创建能力门禁 1/1 通过 | `.validation/opencode-execution-final.log`、`execution-create-gate.log` |
| Desktop 服务、消息、会话、统一流程 | 84/84 通过；包含最后补强后的复测 | `.validation/desktop-tests-final.log` |
| P1 双池 SSR | 两池、单选执行者、独立模型、不可用禁用断言通过 | `.validation/role-board-ssr.html` |
| Controller 首次全量回归 | 321 项：202 通过、119 失败；不能宣称全库通过 | `.validation/controller-tests.log` |
| DEV 失败对照 | 排除 6 项大项目用例，其余 113 项在原 DEV 独立副本全部同名失败；missing/additional 均为空 | `.validation/baseline-comparison.json`、`baseline-failures.log` |
| Codex 原生执行回归 | `native-agent.test` 13 项中 10 通过、3 个已有失败；3 项均在 DEV 复现。SDK 流式修复、原 Thread 恢复、提案兼容及持久结果不重放通过 | 同上全量及基线日志 |
| 既有单/双决策 | P2A 讨论及角色校验用例在全量回归通过；OpenCode 新执行组合在专项通过 | 全量及专项日志 |

专项覆盖工具/事件归属、独立 Session、单/双决策 0/1 轮、混合决策、权限及模型门禁、模型/Plan/目录篡改拒绝、Provider 异常、缺失或未知终态、未知 Session 状态、服务退出未确认、超时取消、人工恢复、不重放、Review Guard、Preview 未审批、历史 Run 与 Mock 身份。

**测试范围偏差**：首次全量命令误包含 `large-project-snapshot.test` 和 `no-project-snapshot.test` 中的旧大项目夹具（2 万文件、101 MB 文件及 512 MB 稀疏文件），不符合用户本轮禁止压力测试的约束，已如实保留日志。后续没有重跑这两组，基线复现明确排除它们。6 项失败只静态比对：对应测试及 `project-files/incremental/delivery` 与 DEV 无差异；未据此宣称这 6 项已经运行复现。之后的专项、Desktop 和原生闭环均使用轻量独立夹具。没有为了迁移这些用例修改生产流程。

全量回归在最后退出审计、未知终态/Session 状态保护和创建能力门禁补强前运行；补强后的相关路径由最终专项、追加门禁测试及原生闭环复测覆盖。没有再次执行全量压力夹具。

全量结果和失败基线复现必须区分：不删除失败测试，不为满足旧测试恢复 Snapshot，也不把注入工具事件宣传成真实远端能力。

额外原生链路：`scripts/validate-opencode-execution-local.mjs` 使用实际 V1 CLI 和 loopback 确定性模型服务，在全新临时 Git 项目中执行：决策 read → Plan → Controller 校验 → 执行 read/write/bash → Controller 独立测试 → 决策 Review → Delivery Preview。

- 证据：`.validation/p3c-native-e0d57aca/result.json`，`passed:true`。
- Run：`072b68f0-eabb-4a12-9420-f955fe2a6921`。
- 决策 Session：`ses_edbe64325ffeBH5kpjJgN9E0IK`；执行 Session：`ses_edbe61f48ffeMu7tixLAFhB4kp`。
- 原生 write 将 `core.js` 的 `a-b` 改为 `a+b`；原生 bash 运行 `node verify.mjs` 并成功退出，Controller 另运行工作区外可信测试。
- 8 次**本地模型夹具请求**，0 次远端付费请求。模型、Plan、Review 内容是确定性夹具；原生文件写入与 Shell 由真实 V1 工具完成。验证的是原生接线及闭环，不是模型自主开发质量或远端 Provider 成功。
- Delivery 保持 `phase:preview`、`approval:null`；没有自动审批或正式交付。

最后补强后再次用全新轻量项目运行，`.validation/p3c-native-d55fdef8/result.json` 仍为 `passed:true`：Run `84dc878b-b83e-4b5a-bc2a-d50864d75b49`，决策 `ses_edbcdd880ffeJV7pwtMsy4gGid`，执行 `ses_edbcdba40ffexup2rGj9Ca391T`，仍为 8 次本地模型请求、0 次远端请求、Delivery Preview 未审批。汇总输出：`.validation/native-chain-final.log`。

## 尚未验证的远端能力

未调用 dieqiyun `hgapi-openai/gpt-6.1-sol` 或其他付费模型。真实远端 Plan/Review 格式服从、原生工具生成、复杂构建、取消与恢复、长任务稳定性均未验证；未进行质量、Token 性价比或单/双决策比较。

## 后续独立真实验收启动

必须先获得用户对 Provider、Model 和预期费用的明确授权。开发授权及下列准备命令不构成付费调用授权。

在本 P3C Worktree 使用分支构建的 Controller：

```powershell
Set-Location 'D:\PersonalAgent-worktrees\tasks\opencode-execution-agent-p3c'
rtk proxy npm run build
rtk proxy node scripts/validate-opencode-execution-remote.mjs --provider hgapi-openai --model gpt-6.1-sol --executable 'D:\PersonalAgent-data\opencode-compatibility-v1\toolchain\node_modules\opencode-windows-x64\bin\opencode.exe'
```

默认只准备独立项目、运行数据和 config，零模型调用。已验证准备产物：`.validation/p3c-remote-3948dcb0/controller.json`、`prepared.json`。如使用独立 V1 Provider 配置，追加 `--provider-config '已授权的配置文件路径'`；配置读取沿用现有脱敏和隔离规则。

后续获授权才可在同一命令追加 `--run --authorize-remote --expected-cost '用户已确认的预期费用'`。脚本没有这些参数时拒绝执行；每次创建全新临时 Git 项目和 runtime，不连接 DEV Run/Session/历史，不碰真实项目，不启动 GUI。最大 1 次实施轮、0 次返工、每次 Agent 操作 120 秒；Provider 原生内部请求可能多于 Controller 调用次数，预期费用文字不是服务端硬性消费上限。

脚本使用 OpenCode 决策 → Plan 校验 → OpenCode 原生修改一份源码及轻量测试 → 决策 Review → Delivery Preview。保存 `acceptance.json`、独立 Run 审计、Session 和 Delivery。Ctrl+C 触发取消；失败及中断保留证据，不能以未确认状态继续自动重放。人工 Delivery 审批需另行执行现有流程。

本地原生链路重跑：

```powershell
rtk proxy node scripts/validate-opencode-execution-local.mjs 'D:\PersonalAgent-data\opencode-compatibility-v1\toolchain\node_modules\opencode-windows-x64\bin\opencode.exe'
```

## DEV 兼容性和问题记录

交付前只读核对，最新本机 `dev` 仍为 `ddb098aedff7a40dc4a161f2e8eda8722bf32598`，未前进；P3C 来自该提交。没有修改正式 DEV / MAIN 的代码、运行进程或运行数据，也没有切换它们的分支。以后 DEV 前进时，应在独立 integration Worktree 组合验证，再由人工决定是否更新 DEV。

本轮触及 Controller、schema/store、RealAgents、调用观察以及 Desktop 角色选择、会话配置和消息投影。P3A 后续扩展决策类型可能与这些文件重叠；全局工作/空闲策略应通过明确执行策略入口整合。没有主动组合两个独立功能。

重要更新：`problems/2026-10-10-snapshot-era-regression-fixtures.md`。状态：原获批 13 项已解决，其余历史回归待处理。本轮 119 项全量失败中 113 项在 DEV 副本同名复现，6 项大项目未复跑；影响是不能给出全库绿色结论，不阻断独立 P3C 专项交付，也不构成合入 DEV 的授权。失败分布及逐项名称保留在 `.validation/failures-summary.json` 和原日志。

主机蓝屏证据记录：`problems/2026-10-10-host-bsod-during-p3c.md`，状态待处理、归因未确认。用户已交给别人调查，本轮停止主机诊断；未修改 Windows 配置、执行重启或抢占前台。单套测试使用串行调度，首次全量的范围偏差另见上文；不能宣称主机问题已解决。测试及运行证据保留未提交，包括 `.validation` 和本轮产生的 `runtime-env-*` 夹具目录，没有清理历史数据。

完成后停止，等待人工验收及后续授权。
