# Decision Agent Provider V1 验证记录

日期：2026-10-09，Asia/Shanghai。本文在原 Run 的 `validation-report` Execute 中整理；本轮仅更新报告，没有重复实现已经验收的核心与 Desktop 源码。

## 1. 当前结论与验收边界

Claude Code 默认路径、统一 Decision Agent Adapter、OpenCode 动态发现和 Desktop 选择已经实现。最终源码的本轮 Agent 自测通过：Controller 262/262、Desktop 74/74、Desktop build/check 退出码 0、Electron 四组检查通过。**付费模型真实 Plan/Review 尚未验证，真实 OpenCode prompt 调用为 0。**

OpenCode 的本机生产可用性仍受官方接口阻断。此前实际 CLI 2.0.20 没有官方 JSON Schema format；本轮同一安装路径实际已是 **2.0.26**，仍不支持该接口。该更新不是本 Agent 执行的升级。实现明确拒绝发起 prompt，不以普通文本解析、静态清单或 Mock 成功替代真实能力。

正式 Controller 已验收核心及 Desktop，CC 已 pass；Desktop 的 Diff 截断已有用户人工确认。它们与本轮自测分开记录，详见第 6 节。最终报告任务的 Controller 独立验收、最终 Review 与正式 Delivery 审批仍由外层继续；本文不批准交付，不宣称整个 Run 已 completed。

## 2. 新旧架构与适配器实际功能

| 项目 | 原路径 | 本次实现 |
| --- | --- | --- |
| 决策调用 | RealAgents 直接调用 Claude CLI | RealAgents 装配原 Plan/Review 契约，交给 DecisionAgent.structured |
| Claude Code | 原 CLI 参数、工具、提示词和 resume | 调用正文抽入 ClaudeCodeDecisionAgent，保留旧行为及旧 Run 兼容 |
| OpenCode | 无决策后端 | 精确 SDK、受控服务、模型发现、结构化请求、Session 及原生事件观测 |
| Codex Execute | 原 SDK worker 执行 | 保持不变；native-agent.ts、codex-worker.ts 未改 |
| Controller | 计划约束、独立验收、Review Guard、人工交付 | 继续由 Controller 控制，未增加自动批准通道 |

接口接收 Plan/Review JSON Schema、Run/Task/phase 作用域、工作区、取消信号和超时。Config 可选 decisionAgent，旧配置默认 Claude Code；新 Run 冻结 backend/providerID/modelID，Store 拒绝后续变更，配置与冻结标识不一致明确失败。

Session 归属保存 backend、sessionId、runId、workspace、directory；请求校验当前 Run/Task/phase 与目录，拒绝跨 Run、工作区或目录错配。同 Run 合法 Plan/Review 可续接；OpenCode 还核验远端 Session directory 与 Controller 唯一 title。失效 Session 明确失败，不自动新建替代或切换后端。

OpenCode executable 可显式配置，也可由环境、PATH 和 Desktop 安装位置发现。每次独占启动 localhost 服务，以 --port 0 原子分配端口，只接受本次子进程回执中的 URL，不复用用户或 MAIN/DEV 服务。随机服务口令仅在闭包中使用，不进入 State、审计、日志或 Renderer，不写全局认证与模型配置。

兼容服务通过安装 SDK 的 client.session.prompt 发送 format.type=json_schema 与既有 Schema，保留文件读取、Shell 等原生工具；只接受原生 structured 字段，再用 Ajv 本地校验。模型缺少工具、服务缺少 format、结构化结果缺失或纯文本回包均明确失败，不从文本兜底解析。原生 Shell 权限不是目录技术沙箱。

取消时调用 session.abort 并等待 idle；等待失败保留审计，然后释放服务。启动失败、请求错误、取消与超时均关闭本次服务；Windows 使用 taskkill /T /F 释放进程树。确定性测试包含真实本地 Node 服务进程及 PID 释放断言。

公开事件按 Session 和 directory 过滤，绑定 Run/Task/phase，脱敏命令并过滤 reasoning。HTTP 最终回包的公开 parts 也记录，避免 SSE 尾部竞态遗漏。没有结构化读取范围就记不可观测，不把 Shell 当作 confirmed-read。原生 input/output/cache read/cache write 分列；缺字段为 null/unknown，费用、完整内部请求数及文件 I/O 覆盖不估算。用量接入审计与 runUsage 的 opencode 汇总，旧 claude/codex 汇总保留。

Project Context V1.1 导航、提示词收据、完整 Review evidence、Schema、独立验收否决和 Review Guard 继续生效。没有更改任务模块约束、人工确认或 Delivery 控制。

## 3. SDK、真实 types 与本机 OpenAPI

精确固定 @opencode-ai/sdk **1.18.35**，存在 /v2、/v2/client、/v2/types 导出。已核对 feature 安装 types 与 [SDK 官方文档](https://opencode.ai/docs/sdk/)、[Server 文档](https://opencode.ai/docs/server/)、[Models 文档](https://opencode.ai/docs/models/)。/v2 同时包含旧 client.session 和新 client.v2.session，导出名称不能证明与 CLI 2.x 全接口兼容。

SDK 旧 AssistantMessage 的原生字段为 structured，和网页示例 structured_output 有差异。实现以真实 types 为准。2.0.20 实际 OpenAPI 位于 /openapi.json；/doc 是 HTML。它提供 /api/provider、/api/model、/api/session/{sessionID}/prompt、interrupt 等新端点；prompt 接受 text/files/agents/skills/metadata/delivery/resume，没有 format，也没有官方 StructuredOutput/OutputFormat Schema。SDK 新 Session 部分结构也与本机不同。**未找到与本机 2.0.20 完整结构化 Plan/Review 协议兼容的 SDK；不能将 Mock 协议验证称为本机真实 Plan/Review 已可用。**

2.0.20 原件及白名单回执保存在 `D:/PersonalAgent-data/decision-agent-providers-v1/execute-1-artifacts/.validation/opencode-openapi.json`、`opencode-live-interface.json`。当时 /api/info 为 200、version=2.0.20；原 OpenAPI SHA-256：2982f2a00c1571738a3269ccadb624f0961ca1d3fef23b1264ecea7be5ad8346。

本轮重新执行同一路径 `C:/Users/WYL20/AppData/Local/Programs/@opencodedesktop/resources/opencode-cli.exe --version`，实际为 opencode v2.0.26，退出码 0。受控 localhost 服务 /api/info 返回 200、version=2.0.26，旧结构化接口和新 prompt format 均不可用。本轮 JSON.stringify(OpenAPI) 的 SHA-256 为 6f748ff099b6c106f7dfe9fd9ca8710f6999c35a41b4d343eedc436739acc5d9；这是序列化对象摘要，不能与上述原字节摘要直接比较。

本轮 `node dist/src/cli.js decision-models` 退出码 0：available=false，reason=`OpenCode service lacks official JSON Schema structured output (format); prompt refused`，providers=[]。结果来自真实动态发现，仅输出白名单 ID/能力与不可用原因；没有发 prompt、修改认证或打印密钥。空列表不是所有 Desktop 账户认证状态的证明，当前没有可选的已验证真实模型 ID。脚本和回执为外部 `final-live-check.mjs`、`final-live-check.json`，serviceReleased=true。

## 4. Desktop 使用与持久化

1. 在现有“新建任务”或白色群聊的新会话 Run 配置选择“决策 Agent：Claude Code / OpenCode”；旧项目、旧 Session、旧 Run 缺字段时默认 Claude Code。
2. 选择 OpenCode 后等待真实 decisionModels IPC 发现，在动态 Provider 和 Model 下拉选择；可刷新模型。加载中、不可用或能力未知时显示原因并禁用开始/发送。本机当前会显示上述 format 不支持原因。
3. 服务在新 Run 启动前重新发现，拒绝缺少、非法、过期或能力不满足的选择。Renderer 不能传 executable、认证或任意配置密钥。
4. 选择保存到 Project.settings、Conversation.settings 和 SessionDraft；生成 Controller 配置包含 decisionAgent，重启后恢复设置。已有 Run 只读展示冻结 State 的后端与模型，后续恢复沿用原后端。
5. 真实模式沿用原调用授权提示，明确决策后端；legacy CC 上限同时约束 Claude Code/OpenCode 决策调用。详情、群聊和用量卡标明实际后端与模型，未知 Token 显示未知。

未新增 Dashboard、重设计群聊或硬编码真实模型清单。发现回包按 ID/名称/能力再次白名单投影；注入 password/apiKey/secret 的测试断言其不进入 IPC 与落盘配置。新增回归聚合在既有 sessions.test.ts，原 test 文件清单未删除或弱化。

## 5. 最终源码 Agent 自测

从 feature cwd 执行 `rtk proxy node D:/PersonalAgent-data/decision-agent-providers-v1/independent-acceptance.mjs`。可信外部脚本未改，逐文件哈希绑定复制到 **D:/pa-dap/ed70f238**；安装、构建、测试与夹具仅在外部副本生成。沿用外部 npm 缓存，不在产品工作区运行会生成 dist/out/.validation/.cache 的命令。脚本运行期间 feature 源码未变，passed=true、failure=null。

| 外部副本实际命令 | 最终结果 | 完整日志 |
| --- | --- | --- |
| npm ci（root、desktop） | 均退出码 0 | independent-ed70f238-root-install.log、desktop-install.log |
| npm test -- --test-concurrency=2（含 TypeScript build、Schema 导出） | 262/262；失败/取消/跳过均 0；271411.8068 ms | independent-ed70f238-controller-tests.log |
| npm --prefix desktop run build | 退出码 0；1104 ms | independent-ed70f238-desktop-build.log |
| npm --prefix desktop run check | 退出码 0；3274 ms | independent-ed70f238-desktop-types.log |
| npm --prefix desktop test | 74/74；失败/取消/跳过均 0；43017.9327 ms | independent-ed70f238-desktop-tests.log |

上述日志、逐文件 hashes 和总回执 `independent-ed70f238.json` 均在 `D:/PersonalAgent-data/decision-agent-providers-v1/`。构建保留 lucide-react 既有 use-client 警告。脚本名含 independent 不代表本次是 Controller 独立验收：这是本 Agent 主动自测。

全量覆盖 Claude 旧路径、Plan/Review adapter Mock、安装 SDK 的本地 HTTP/SSE 序列化、动态模型、Schema/纯文本拒绝、目录和 Session 归属、工具事件、null 用量、取消 abort/idle、超时/错误/进程释放、Project Context、独立验收否决、Review Guard 与预算 gate。测试均为 deterministic Mock/本地服务，没有真实 OpenCode prompt。

本轮最终 Electron 命令：在 D:/pa-dap/ed70f238 执行 `rtk proxy node desktop/validate-decision-agent-electron.mjs`。PERSONAL_AGENT_DESKTOP_DATA 指向新建独立 D 盘目录；只读复用同版本 Electron 和 Playwright 二进制依赖。外部 bootstrap 注入明确 Mock 发现结果，没有增加产品测试开关。动态 Provider/Model 切换、不可用原因与禁用发送、切回 Claude 后正式 Controller Mock Run completed、无横向溢出四组均 PASS，Renderer errors=[]、paidCalls=0。

最终 UI 证据：`D:/PersonalAgent-data/decision-agent-providers-v1/electron-577172cb/result.json` 及 selected.png、unavailable.png、completed.png。三张均已通过 view_image 真正读取像素：白色原布局、动态选项和不可用状态可见。completed.png 实际仍显示规划阶段，completed 由 API 断言证明，不能将截图描述为完成态。原 result.pixelInspection 保持 Pending，本段单独记录像素检查，不追改原证据。标题 MAIN 是 preview 复用实例标签，实际数据独立，没有重启正式 MAIN/DEV。脚本仅终止本次 Electron PID 进程树，正常退出。

## 6. 正式 Controller 验收与审查

核心最终正式回执 `independent-f0ddb4ae.json`：Controller 262/262、Desktop 73/73、build/check 退出码 0；2026-10-09T13:56:24.638Z 的正式 CC review verdict=pass。该快照包含 CC 对 Windows 预算锁 EPERM 的必要小修。

Desktop 正式回执 `independent-fd92bcf0.json`：Controller 262/262、Desktop 74/74、build/check 退出码 0；2026-10-09T14:31:15.259Z 的 CC review verdict=pass。CC 明确读取截断及其后的源码、新文件与测试清单，没有以截断 Diff 直接冒充完整审查。

原 Review Guard 对 diffOmitted 仍要求人工复核。用户确认后，外层在 2026-10-09T14:33:58.569Z 记录 **human-review-confirmation**，绑定 desktop-decision-agent、loop=3、snapshot=40160f03f48152785053d3451c25cbe12c051eda964fdeea5cf42220f3112c4c、reviewHash=eeba439d3f9e2223e53dcabaf525b6874c9b66278435d85231d6785ec8858636 与 fd92bcf0 回执；事件 hash=84e014272d4263e695f627c4e4a47376a8cb6eb1fcf96403fd8a6bace58fee6a。

上述依据均来自正式 Run audit.jsonl，不是本 Agent 自造审查结果。本轮只读重算当时 1350 条审计链有效，回执 `final-audit-readonly-check.json`。本任务没有修改 Guard、预算、Session、正式状态或审计。最终报告任务尚待外层验收与 Review。

## 7. 原失败、中断与复测记录

原报告备份为外部 `validation-report-before-final.md`，原始日志未覆盖。以下保留真实失败，后续通过不将失败改为 PASS。

- 规划阶段曾发生 npm 缓存故障，正式审计另记录 planning Git diff 输出超过上限；2026-10-09T12:57:44.411Z 的 human-decision 确认缓存已修复，沿用原 Run/CC Session 续接，并引用 planning-receipt-before-interruption.json。没有重新建 Run 清零次数。
- 第一 Execute 为移出测试硬链接与构建产物曾暂停；原产物保存到 execute-1-artifacts，13:38:22.310Z 的 human-decision 明确切换外部可信验收副本。原计数和 Session 保留。此前空 .cache 确认为空后清理，不删除缓存数据。
- core 原目录首轮 259 项中 250 通过、9 失败（旧测试公共账本夹具及 Windows Git 深路径）；新增 local-budget-fixture 保留生产 gate 和原断言，只缩短普通 project-modes 夹具根名，专门长路径用例保留。原日志 execute-1-artifacts/.validation/controller-full.log；后续 262/262，不能据此宣称修复所有 Windows 长路径根因。
- adapter 初轮 9/11、随后 10/11：夹具事件名误写和 HTTP/SSE 尾部竞态；修正准确事件名与最终公开 parts 记录，原 decision-agent-first.log、second.log 保留。历史专项最终 13/13、native 合计 24/24，日志仍在上述 artifacts/.validation。
- 正式独立回执 independent-6528d689 为 core 261/262：dual-instance 竞争锁 openSync(wx) 返回 Windows EPERM。CC 在正式 Review 内将 win32 EPERM 视为锁忙，沿用原 5 秒重试和安全暂停，不放宽 gate、不改测试。CC 自测 cf382e58 通过；随后 Controller f0ddb4ae 再次独立验收全部通过。
- Desktop 两次外部副本 8c97bb39、5c76109f 因 TS 错误提前停止，未计 PASS；37ea704e 为 core 262/262、Desktop 73/74，新断言大小写与真实 Immutable Decision Agent identity changed 不匹配，修正准确断言后 0c1225eb 全部通过。最终正式 fd92bcf0 与本轮 ed70f238 继续全部通过。
- Electron 原 7f077766、8ce2b48c 因 ESM evaluate 注入方式失败；改外部 bootstrap。早期 preview 关闭时序问题曾手动终止专属进程树，最终脚本 taskkill 自动释放。原 df84e598、6532719a、7223bd57 记录保留。
- 本轮提前在尚未构建 Desktop 的 ed70f238 启动 preview，因缺 service.js 失败，记录 electron-2f8d427c。随后在源码哈希一致的已构建 fd92bcf0 副本通过（electron-3e180d94），最终待完整 build/check/test 后重跑 ed70f238 通过（electron-577172cb）。没有修改产品或弱化验收掩盖该启动错误。
- Desktop 正式恢复过程中曾因 stopped 暂停，后经原人工确认恢复；原错误仍在 audit.jsonl，没有将暂停覆盖为无中断成功。

## 8. 预算、Run、Session 与 Git 基线

OpenCode 决策调用沿用 reserveClaudeCall、legacy claudeCalls、globalBudget 和 Controller reserveSharedCall，预约在调用前落盘，失败不退款。没有新增付费预算体系、移除公共 gate 或依赖预算移除分支。与 feature/remove-budget-gate-v1 后续组合集成时须重测：预约顺序、共享账本去重、耗尽拦截、失败计数、旧 Run 固定配置恢复、Session 连续性、Desktop 提示；本任务没有读取或修改该分支。

| 身份 | 实际值 |
| --- | --- |
| 发起版本 MAIN / 开发基线 dev | d51985e2dcd6bee9fc3f1ef9c1525f34273905c2 |
| 当前 feature HEAD | 同上，尚未提交 |
| 分支 / 产品工作区 | feature/decision-agent-providers-v1；D:/PersonalAgent-worktrees/tasks/decision-agent-providers-v1 |
| 正式 Run | e55a6e1e-8ad6-48af-88ff-a4030b518605 |
| 原 CC Session | ed6717b4-4d40-4a9c-9ecc-c6dfd20307b1 |
| Codex Thread | 01a120be-af01-7ff2-bd40-05aaea9a7bd7 |
| runtime 与审计 | D:/PersonalAgent-data/decision-agent-providers-v1/runtime/runs/e55a6e1e-8ad6-48af-88ff-a4030b518605/，含 state.json、audit.jsonl |
| 授权政策及账本 | D:/PersonalAgent-data/decision-agent-providers-v1/policy.json、claude-budget.json、codex-budget.json |
| 最终 commit SHA | **由外层提交后填充**；外层授权执行方在外部同名最终报告写入 |

本轮开始只读 State 时 phase=executing、taskIndex=2、claudeCalls=5、loops=4；此时共享账本文件分别 used=2/20、1/20。State 调用尝试与共享账本预约是不同记录，不能伪造两者已经一致或据此猜测计费请求数。正式实际 CC/Codex 次数、总授权消耗以外层 Controller 最终账本和审计核算为准，本报告不是任务结束后的计数回执。本次不写账本、不清零 Session、不增加调用额度；测试 Mock 不计为真实付费调用。

## 9. 保护检查、限制与停止状态

最终产品源码除本文外与已测试 hashes 一致。git diff --check 退出码 0，仅原 LF/CRLF 提示；Git 状态为本任务预期核心、Desktop、Schema、测试及报告文件，没有暂存、凭据、node_modules、dist、.cache 或运行数据进入拟交付状态。产品目录无 dist、desktop/out、.validation、.cache。治理文件及 Codex Execute 实现文件无改动，MAIN/DEV 没有被修改或重启。

本次 owned OpenCode 服务已释放，Electron preview 与测试副本的 Node 子进程已结束。另有早于本任务启动的 OpenCode serve（PID 17940，22:28:52 创建）和正式 Controller/当前 Agent 进程，未触碰它们；“无残留”仅指本次自测及 preview 自己启动的进程，不冒称全机没有 Node/Electron/OpenCode。凭据扫描与白名单断言不能证明任意秘密格式都已穷尽；没有读取或复制认证文件。

已知限制：本机 2.0.20/2.0.26 均不能完成要求的官方结构化 Plan/Review；仍需提供兼容官方接口后另获真实模型验证授权。真实付费模型内容质量、完整内部请求与文件读取覆盖、实际金额未知；Mock UI 清单不是账户真实模型列表。原 Windows Git 长路径和底层异常风险不宣称已修复。未知原生 token/cache 保留 null，不估算、不隐藏失败。

本 Agent 完成本轮自测与报告后停止，交回原 Controller 进行最终任务验收与 Review，等待正式用户审批/合并。未提交、合并、push、发布或批准 Delivery；最终 feature 提交由外层已获授权执行方处理。

最终保护回执：`D:/PersonalAgent-data/decision-agent-providers-v1/final-source-check.json` 与 `final-process-check.json`。除报告外源码与 ed70f238 已测试 hashes 差异为 0；生成目录、异常产物、私钥头/常见长 API key 模式命中均为空，暂存为空，本次自测/preview 残留进程为空。上述模式扫描不穷尽所有凭据形式。报告是在测试完成后更新，没有将其更新期间冒称为测试中的不可变快照。

## 外层执行方补充（最终提交前）

并行任务在本任务运行期间将 MAIN/dev 推进至 aff80240342176ec196fedb2028905f489afced9（预算移除）；本 feature 仍基于启动时核实的 d51985e，不自动 rebase、合并或更新正式分支。本任务没有执行该外部集成。

外部更新还改变了共享 MAIN 编译模块，后续恢复时 Run 已记录 CC 5/Codex 4，而原任务共享账本只记录 2/1。外层已保留账本备份，以原公共 reserveGlobalBudget API 按 audit 的真实调用逐项补记，额度仍为20/20、无退款或清零；补记时间是核算时间，不冒充事前预约。现在账本为 CC 5/Codex 4。后续最终验收与 CC 审查绑定已验证固定副本 D:/pa-dap/ed70f238/dist，避免外部版本漂移；保持原 Run、Session、Thread 与产品预算门槛。相关证据为 budget-drift-reconciliation、frozen-runtime-bound 审计事件。最终调用数在提交后外部同名报告中核算。

## 外层最终验收回执

原 Run 已 completed，三个任务均完成。最终 Controller 独立回执 independent-a8ee541d：核心 262/262、Desktop 74/74、build/check 退出码 0；最终 CC 审查于 2026-10-09T14:57:14.418Z 返回 pass。本次审查实际通过新 Claude Code 适配器续接原 Session，结构化结果、工具事件及 Session 归属已落盘。最终账本与 Run 一致：CC 6/20、Codex 4/20，OpenCode 真实 prompt 为 0。产品源码与最终独立验收 hashes 一致；本段仅为验收后的元数据补录。

提交 SHA 在提交动作完成后记录到外部最终同名报告：[最终验证报告（含 feature commit SHA）](D:/PersonalAgent-data/decision-agent-providers-v1/DECISION_AGENT_PROVIDER_V1_VALIDATION.md)。仓库本文随 feature 提交保存，外部报告复制全文并补齐实际 SHA，避免将尚未生成的自引用提交 SHA 写成既有事实。未批准合并、push、发布或正式 Delivery。
