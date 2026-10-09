# PersonalAgent V0.3C.4 真实原生工具与 GUI 验收报告

验收日期：2026-10-08（Asia/Shanghai）。正式基线 main：`b8b34cd157357e3a7a39221cca71af334b91ede0`。必要修复位于开发分支 `codex/v03c4-native-live-validation`，未提交、合并或推送。报告依据实际运行日志、原生公开工具记录、Controller 审计、文件哈希和 Electron 截图编写。

真实任务通过正式桌面应用启动。CC 完成规划及两次源码审查，Codex 在同一 Thread 的两次执行中直接创建、修改文件并运行自测，Controller 分阶段执行冻结的外部独立测试，最终 Run 为 completed。全过程没有以 Mock、协议注入或 Controller 代写完整文件冒充原生执行。

| 验收项 | 结论 | 实际证明及范围 |
| --- | --- | --- |
| CC 原生工具 | PASS | Bash 真实读取/搜索文件、运行检查与测试；两阶段规划和审查。CC 直接修复文件为 NOT OBSERVED。 |
| Codex 原生工具 | PASS | 官方 SDK runStreamed，真实 Shell、原生文件修改、自测、读取输出及 Thread 续接。 |
| 自主开发及自测 | PASS | 两个有依赖任务；自测分别 4/4、53/53。失败后自主修复为 NOT OBSERVED。 |
| GUI 真实流式活动 | PASS | 94 条实际公开活动进入三人群聊；成功调用在结束前持续产生 DOM 消息，原始来源可追溯。测量边界见第八节。 |
| Controller 独立验收 | PASS | 外部规则预先冻结；core 6 项、最终 core 6 项加 full 10 项全部通过；审核与预算审计一致。 |
| 总体真实原生执行 | PASS | 本次小型非 Git direct 项目完整开发循环完成，成果审核预览可用；未观察能力不包括在 PASS 范围内。 |

## 1. 实际 GUI 启动、授权与预检

正式入口为 `D:\PersonalAgent\PersonalAgent.cmd`。使用 PowerShell 脚本启动真实 Electron 应用，外部 desktop-data 隔离验收数据。Node 启动观察器仅追加调试端口 9334/9335，以 Playwright/CDP 操作实际 GUI 控件、读取实际 Renderer DOM 和截图；不是另行 CLI 开发后回放。用户明确要求不操作电脑，因此后续使用脚本，没有鼠标/键盘 Computer Use。

脚本选择 MiniTaskCLI 普通文件夹、填入自然语言目标、导入正式 real/native 配置并核对 direct 授权及额度。文件选择对话框使用已授权的固定测试路径；Mock 的对话框自动确认。**首次真实付费启动的原生授权对话框保留人工确认**，用户随后明确回复“已在 GUI 确认”。认证恢复时，用户明确登录并授权继续，脚本通过项目群的正式恢复决策控件恢复同一 Run。此处说明自动化方式，不能把脚本自动确认的恢复对话框称为另一次人工点击。

Mock 预检使用单独 `MockPreflight` 文件夹，仅验证标记文件调度及 GUI 状态，零真实模型调用，未提前实现 MiniTaskCLI。结果为 completed。MiniTaskCLI 种子仅有 REQUIREMENTS.md、package.json；种子负向独立测试因不存在 cli.js 按预期失败。

证据：[00-cmd-launched.png](D:/PersonalAgent-validation/native-live-test/evidence/00-cmd-launched.png)、[01-mock-preflight-completed.png](D:/PersonalAgent-validation/native-live-test/evidence/01-mock-preflight-completed.png)、[03-real-ready-for-user-confirmation.png](D:/PersonalAgent-validation/native-live-test/evidence/03-real-ready-for-user-confirmation.png)、[dialogs.json](D:/PersonalAgent-validation/native-live-test/evidence/dialogs.json)、[mock-preflight.json](D:/PersonalAgent-validation/native-live-test/evidence/mock-preflight.json)、[seed-negative-check.json](D:/PersonalAgent-validation/native-live-test/evidence/seed-negative-check.json)、[pre-fix-cmd.stderr.log](D:/PersonalAgent-validation/native-live-test/evidence/pre-fix-cmd.stderr.log)。实际用户启动记录见 [audit.jsonl](D:/PersonalAgent-validation/native-live-test/runtime/runs/b1261a41-ac90-4f33-b5d8-029be50cc57c/audit.jsonl) 中 desktop-user-start。

## 2. 实际模型和原生配置

Claude Code：`C:/Users/WYL20/.local/bin/claude.exe`，native stream-json 正式调用。原生 assistant 记录模型为 **claude-opus-5-5**。调用未指定 effort，源日志也未确认其实际值，因此 effort 为 NOT CONFIRMED。

Codex：官方 Codex SDK 完整 native 工具模式；原生 session CLI 版本 0.161.0，turn_context 确认 **gpt-6.1-sol / medium**，danger-full-access、approval_policy=never。保留本机默认配置，没有新增模型选择器。模型提供方元数据为 custom；本报告只证明所观察到的原生调用，不推断账号计费明细或服务商内部模型实现。

[public-trace-provenance.json](D:/PersonalAgent-validation/native-live-test/evidence/public-trace-provenance.json) 记录原始 JSONL 路径、SHA-256、公开副本与 sourceLine。公开副本排除了 thinking/reasoning 等隐藏内容；GUI 不展示隐藏思维链。

## 3. 原生工具、公开事件与底层证据

CC 共实际使用 **Bash 3 次、StructuredOutput 3 次**，均有原生 tool_use/tool_result。规划时 Bash 实际列出种子目录并检查 Node 版本，需求内容来自 Controller 提供的实际文件上下文；不能声称此时额外调用 cat 读取需求。审查时通过 Bash 读取实际 cli.js、检查源码和自测文件清单/行数，使用 grep 检查导入，运行 npm test 和临时目录中的 CLI 检查。没有调用名为 Read/Grep/Search 的单独工具，不能把这些工具名记为已验证；文件读取及搜索能力已由真实 Bash 行为证明。三次 StructuredOutput 是实际原生规划/审查返回工具，不是注入的结果。

Codex 有 **6 个实际 Shell 执行**，开始与完成合计 12 条工具活动；**2 批实际文件修改**，开始与完成合计 4 条工具活动。第一批创建 cli.js 与 test/cli.test.js；第二批修改 cli.js，创建 README.md 与 test/hardening.test.js。文件事件、native-result、agent-finish 前后快照和 Diff 一致，Controller 没有使用旧 proposal 模式代写这些文件。

CC 68 条、Codex 26 条，共 **94 条 agent-activity**。CC 类型计数：session 10、output 2、error 2、receiving 39、tool 12、stage 3。Codex：error 2、stage 4、output 4、tool 16。Codex 的两条 error 为原生启动的 respect_system_proxy 配置警告，公开展示并保存，随后执行成功；不将其隐藏为无错误。

Controller 实际记录 agent-start/finish、global-claude-reserved、native-result、diff-context、independent-check、review、transition、direct-checkpoint 和 human-decision。运行结束时审计 160 条，成果预览新增 delivery-transition 后为 161 条，完整哈希链验证通过。

证据：[claude-public-source.jsonl](D:/PersonalAgent-validation/native-live-test/evidence/claude-public-source.jsonl)、[codex-public-source.jsonl](D:/PersonalAgent-validation/native-live-test/evidence/codex-public-source.jsonl)、[audit-observed.jsonl](D:/PersonalAgent-validation/native-live-test/evidence/audit-observed.jsonl)、[final-audit-verification.json](D:/PersonalAgent-validation/native-live-test/evidence/final-audit-verification.json)、[native-result-1.json](D:/PersonalAgent-validation/native-live-test/runtime/runs/b1261a41-ac90-4f33-b5d8-029be50cc57c/native-result-1.json)、[native-result-2.json](D:/PersonalAgent-validation/native-live-test/runtime/runs/b1261a41-ac90-4f33-b5d8-029be50cc57c/native-result-2.json)。GUI 与正式审计映射使用 audit hash；底层公开 JSONL 使用工具 ID、命令和 sourceLine 对照。

## 4. 实际 Shell 命令、退出码和输出

完整逐条命令及公开结果见 [shell-command-inventory.md](D:/PersonalAgent-validation/native-live-test/evidence/shell-command-inventory.md)、[shell-command-inventory.json](D:/PersonalAgent-validation/native-live-test/evidence/shell-command-inventory.json)，含多行 Bash 原文、PowerShell 完整可执行程序和原生输出，不以最终摘要替代。

| 执行者 | 实际命令摘要 | 实际结果 |
| --- | --- | --- |
| CC 规划 | ls -la、ls test、node --version | 检查种子目录和环境，根据正式文件上下文输出两个依赖任务 |
| Codex core | 读取本机工作规则与项目文件；npm test | 3 个 Shell 均 exit 0；自测 4/4 |
| CC core 审查 | ls/wc/grep、npm test、临时目录 add/list/done/非法命令 | 自测 4/4，正常路径 rc=0，预期错误 rc=1；审查 pass |
| Codex hardening | 读取 cli.js 与测试；npm test；Node 读取实际文件 | 3 个 Shell 均 exit 0；自测 53/53 |
| CC hardening 审查 | 源码/README/测试检查、npm test、参数及损坏数据检查 | 自测 53/53，预期非法场景 rc=1 且数据未被覆盖；审查 pass |
| Controller | node 外部 acceptance.mjs core/full | 三个独立测试进程 exit 0，stdout passed=true，stderr 空 |

CC 的公开 Bash tool_result 标记 is_error=false，但没有独立 Shell exitCode 字段；不由此编造 Bash 外层退出码。命令自身的 rc 输出保留原值。CC CLI 外层调用退出码依次为 **1、1、0、0、0**；前两次为认证失败。Codex 两次 worker 外层 exit 0；6 个 Shell 完成事件均明确 exit_code=0。

## 5. 文件修改、快照和哈希

MiniTaskCLI 全新创建，始终无 .git。Controller 使用非 Git 文件快照和 Diff；证据中的 diff --git 格式不代表初始化或提交过 Git。需求与 package.json 保持种子字节不变。

| 新增文件 | 最终 SHA-256 |
| --- | --- |
| cli.js | `1353d3aa3a1c09aa1926cea709c345e87d9eb31e1448e0b9f7375682361b8346` |
| README.md | `f88e3d1aebb54cf52d180a610249184e383447d3647f7a53915f394a1348e559` |
| test/cli.test.js | `d26cdf23799fa168a29757976289b49a2dd62b668127b41ca41c78b30f6442b0` |
| test/hardening.test.js | `732ccff8b25933d5e581b767c6f9a61d33d520ef7950380122116b53bb0d5ff6` |

Controller Agent 快照摘要：初始 `208e18294c33becc8d604664efe16109673b109ed6c07ebc3794471139835213`；core 后 `b056769853d63b8e495bd39dee93d0653b392041ea2c2231002d1b1448a032f3`；hardening 后 `8c665886c3fe1bd69efa9228d64b5f30b726e6d7b4b066647f04e2d2b1906de9`。每次 CC 前后摘要相同，真实观察到 changed=false，未产生 CC 文件修改。

证据：[before.json](D:/PersonalAgent-validation/native-live-test/evidence/before.json)、[project-current.json](D:/PersonalAgent-validation/native-live-test/evidence/project-current.json)、[tracked-verification.json](D:/PersonalAgent-validation/native-live-test/evidence/tracked-verification.json)，以及 Run 内 agent-*-baseline.json、diff-agent-* 和 audit 的 agent-finish。

## 6. 两阶段任务、冻结验收和 CC 审查

core 实现 add/list/done、JSON 持久化和基本自测。hardening 依赖 core，补齐非法参数、非法/损坏数据保护、临时文件加 rename 写入、异常简洁输出、测试和中文 README。

冻结发生在 **2026-10-08T14:31:19.272Z**，早于真实调用。测试文件位于项目外 `trusted/acceptance.mjs`；正式配置由 Controller 指定 core/full 阶段，Agent 不负责决定独立测试。冻结文件及测试、需求、配置 SHA 检查全部保持一致：

- 外部测试 SHA-256：`4bfb23f1a75e1ac164777eaa0a5fcd96ce6d24ee601edf717862776abdfd662e`。
- 真实配置 SHA-256：`64a91f9aae09906138e30849639248b2610ffd21a15b5d96c52b6b9a750f1a62`。
- 需求 SHA-256：`01a0012d23d771bae90f0d141e77055339433a95d9596d78f2b8c2aaa424dc16`。
- acceptanceRulesHash：`47faa3c18d78537ec11ceac83933b08382d823641c0ee8a7f7f51fffff148567`。

core 独立检查 6 项通过，涵盖空列表、中文空格/引号、跨进程 ID、list 不改数据、done 持久化及幂等。最终执行 core 6 项和 full 10 项；full 另外检查非法参数保持原文件、非法 JSON/结构/字段/重复 ID 不覆盖、非连续 ID 不复用、自测及说明存在。full 的 10 项含核心检查，不能计成 22 个互不重叠能力。

CC 两次审查读取真实文件、执行独立的手动检查和 Agent 自测后均返回 pass。core 审查明确区分留给 hardening 的原子保存、trim、README 和错误测试；hardening 审查确认完成。CC 未修复文件，所以“CC 修改后重新验收”场景为 NOT OBSERVED。Controller 自测与冻结验收有独立执行记录，不混用。

证据：[freeze-verified.json](D:/PersonalAgent-validation/native-live-test/evidence/freeze-verified.json)、[trusted/frozen.json](D:/PersonalAgent-validation/native-live-test/trusted/frozen.json)、[state.json](D:/PersonalAgent-validation/native-live-test/runtime/runs/b1261a41-ac90-4f33-b5d8-029be50cc57c/state.json)、Run 中两份 review-*.json、audit 中 independent-check/review。

## 7. 调用预算、Session/Thread 和恢复

Run ID：`b1261a41-ac90-4f33-b5d8-029be50cc57c`。CC Session：`dcde0221-e108-4531-9f3c-343b184fe76a`。Codex Thread：`01a11bfe-050c-71d1-81ba-db25cc0a9320`。

CC 使用 **5/8**，其中 2 次认证失败、1 次成功规划、2 次审查；失败调用仍占预约预算，没有回滚计数。Codex 使用 **2/4**，两轮复用同一 Thread；loops=2/4，reworks=0，每任务最多返工1次，单次 timeout=600000ms。跨 Run CC 账本 used=5/limit=8，5 项 reservations 均指向本 Run；现有跨 Run 功能仅覆盖 CC，Codex 上限来自本 Run maxLoops=4，不能宣称另有 Codex 跨 Run 账本。

首次 CC OAuth 过期进入正式 paused；用户首次说已登录后恢复仍失败，保留第二次失败日志和预算。后来用户执行路径错误 `C:\Users\WYL20.local\bin\claude.exe`，正确路径有 `\.local`；该错误是用户终端路径问题，不是 Agent 执行失败。正确 CLI auth status 为 true 后，用户明确“true 继续”，经正式 GUI 恢复同一 Run。两次 human-decision、checkpoint、三份 recovery 状态可追溯，Session、目标、冻结规则和预算未重建、未扩大。

证据：[cc-budget.json](D:/PersonalAgent-validation/native-live-test/cc-budget.json)、[claude-auth-status-current.json](D:/PersonalAgent-validation/native-live-test/evidence/claude-auth-status-current.json)、[resume-action.json](D:/PersonalAgent-validation/native-live-test/evidence/resume-action.json)，正式 audit 和 recovery-*.json。认证由用户完成，脚本不代填凭据。

## 8. GUI 流式活动、数量与延迟

Renderer MutationObserver 持续记录真实 .group-message 的 ID、首次出现时间和重复计数，与正式 audit hash 对照。运行期间 160 条审计投影出 **147 条群聊消息**，全部被观察到；94 条公开 Agent 活动无遗漏、无重复 DOM ID、无底层时间顺序逆序。不同来源批次的显示是 Controller 正常投影，不把原生流部分文本 receiving 和最终结构化结果算成重复工具调用。

首个公开事件：audit **14:40:07.712Z**，GUI DOM **14:40:07.988Z**，延迟276ms，距首调用开始3156ms。首个成功规划事件：audit **14:49:24.158Z**，GUI **14:49:25.054Z**，延迟896ms。94 条活动从 audit 到 GUI DOM 的范围为 **37–1226ms**。

| 调用 | 公开事件数 | 调用结束前进入 GUI 的事件数 | 首事件距调用开始 | 调用内部最长公开事件间隔 |
| --- | --- | --- | --- | --- |
| claude:1 | 4 | 2 | 3156ms | 2073ms |
| claude:2 | 4 | 0 | 1266ms | 39ms |
| claude:3 | 26 | 23 | 5225ms | 2530ms |
| codex:1 | 13 | 13 | 5856ms | 34058ms |
| claude:4 | 16 | 12 | 5295ms | 4732ms |
| codex:2 | 13 | 13 | 3816ms | 64569ms |
| claude:5 | 18 | 14 | 5122ms | 21077ms |

两次 Codex 各13条事件均在结束前进入 GUI。成功 CC 规划26条中23条、core审查16条中12条、最终审查18条中14条在结束前进入 GUI，证明不是调用结束后一次性回放。第二次认证失败非常短，该次4条事件均在失败结束后显示，不能把它单独列为流式 PASS。最长单次调用内部静默为64.569秒；包含人工登录等待的跨调用空档不作为模型静默指标。没有虚构思考文本填充等待。

**测量限制**：DOM 首次出现时间不等同于精确屏幕首帧；部分运行截图的滚动位置停在历史消息，不能宣称每条新消息当时都在可见视口中。公开命令、输出和文件事件确实进入群聊 DOM，截图另证明真实应用与进行中状态；本报告不声称做过逐帧屏幕延迟测量或穷尽所有工具协议类型。

证据：[activity-metrics.json](D:/PersonalAgent-validation/native-live-test/evidence/activity-metrics.json)、[gui-observations.jsonl](D:/PersonalAgent-validation/native-live-test/evidence/gui-observations.jsonl)、[live-0048-planning.png](D:/PersonalAgent-validation/native-live-test/evidence/live-0048-planning.png)、[live-0124-executing.png](D:/PersonalAgent-validation/native-live-test/evidence/live-0124-executing.png)、[06-group-real-completed.png](D:/PersonalAgent-validation/native-live-test/evidence/06-group-real-completed.png)。截图为真实 Electron 页面，没有生成假截图。

## 9. 中途失败与必要修复

认证失败两次：归类为 CLI 认证问题，按正式暂停/恢复处理。Codex 两条原生配置警告：归类为 CLI 配置兼容警告，公开保存；没有导致任务失败。脚本早期 cmd 启动参数、等待选择器及重启后诊断变量问题：仅验收脚本问题，保留相关日志；没有代替产品真实执行或扩大付费调用。

开发完成后真实 GUI 的“生成交付预览”失败，错误为 **Task acceptance stage conflicts with trusted mapping**。这是 Controller 成果证明计算错误：completionProof 对完成后 taskIndex==tasks.length 的非 review 审计记录仍调用 testIndexes，导致可信 taskStages 查找越界。

最小修复仅调整 `src/delivery.ts`：在 pass review 分支内解析当前任务所需测试数量；保留每任务独立验收、规则摘要、审查与审批条件。新增 `test/direct-project.test.ts` 两个依赖 native 夹具任务的回归，覆盖可信阶段映射、完成后预览、明确审批要求、直接确认 written=[]、快照/mtime 不变、冻结规则变更拒绝。夹具明确不是付费 Agent 证明。

旧实现加新回归 **exit1**，修复后同一回归 **exit0**，先复现再修复。证据：[pre-fix-current.png](D:/PersonalAgent-validation/native-live-test/evidence/pre-fix-current.png)、[delivery-fix-before.log](D:/PersonalAgent-validation/native-live-test/evidence/delivery-fix-before.log)、[delivery-fix-after.log](D:/PersonalAgent-validation/native-live-test/evidence/delivery-fix-after.log)、[delivery-fix-reproduction.json](D:/PersonalAgent-validation/native-live-test/evidence/delivery-fix-reproduction.json)。随后完成受影响测试及完整回归，并通过正式 cmd 重启真实应用，保持原 Run 和已用额度。

修复后实际 GUI 预览成功：delivery ID `15847da4-8192-47ab-a7ab-f730b2872046`，审批摘要 `ced578c93444eeeb81357462946802fca69cbf882906bfeba7b7ad38fe02965c`；sourceUnchanged=true，mtimeUnchanged=true。停在正式成果审核界面，**未批准、未 apply**，等待用户审核。真实项目预览没有重新写文件；实际批准后确认流程为 NOT OBSERVED，零重复写入由本地回归证明，不能冒充本次真实批准。

证据：[direct-preview-verification.json](D:/PersonalAgent-validation/native-live-test/evidence/direct-preview-verification.json)、[07-direct-preview-confirmation-dialog.png](D:/PersonalAgent-validation/native-live-test/evidence/07-direct-preview-confirmation-dialog.png)、[08-direct-real-review-ready.png](D:/PersonalAgent-validation/native-live-test/evidence/08-direct-real-review-ready.png)。修复分支保留39行净变动（2个源码/测试文件）；未改预算、原生工具或授权机制。

## 10. Controller、GUI、Electron 完整回归

修复前基线：Controller 157/157，GUI38/38，Electron14/14、13/13、17/17，全部 exit0。修复后：

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| controller-build | exit 0 | [controller-build.log](D:/PersonalAgent-validation/native-live-test/evidence/regression-fix1/controller-build.log) |
| controller-check | exit 0 | [controller-check.log](D:/PersonalAgent-validation/native-live-test/evidence/regression-fix1/controller-check.log) |
| gui-build | exit 0 | [gui-build.log](D:/PersonalAgent-validation/native-live-test/evidence/regression-fix1/gui-build.log) |
| gui-check | exit 0 | [gui-check.log](D:/PersonalAgent-validation/native-live-test/evidence/regression-fix1/gui-check.log) |
| gui-tests | exit 0，38/38，fail 0，cancelled 0，skipped 0 | [gui-tests.log](D:/PersonalAgent-validation/native-live-test/evidence/regression-fix1/gui-tests.log) |
| electron-unified | exit 0，14 passed / 0 failed，真实 Agent 调用 0 | [electron-unified.log](D:/PersonalAgent-validation/native-live-test/evidence/regression-fix1/electron-unified.log) |
| electron-legacy | exit 0，13 passed / 0 failed，真实 Agent 调用 0 | [electron-legacy.log](D:/PersonalAgent-validation/native-live-test/evidence/regression-fix1/electron-legacy.log) |
| electron-legacy-flow | exit 0，17 passed / 0 failed，真实 Agent 调用 0 | [electron-legacy-flow.log](D:/PersonalAgent-validation/native-live-test/evidence/regression-fix1/electron-legacy-flow.log) |
| controller-full | exit 0，158/158，fail 0，cancelled 0，skipped 0 | [controller-full.log](D:/PersonalAgent-validation/native-live-test/evidence/regression-fix1/controller-full.log) |

Controller 使用短路径 `D:/nv4tfix1` 运行完整编译后测试；Electron 使用隔离 `D:/nvl4fix1` 的正式 dist/out 副本，包含编译产物校验。完整回归中的 Mock/本地夹具与本次付费原生证据分别保存，不能相互冒充。原有深路径157/157来自既往 main验收，本次修复后未重跑深路径，不能把历史结果改称本次158项通过。

证据：[regression-summary.json](D:/PersonalAgent-validation/native-live-test/evidence/regression-summary.json)、[regression-fix1-summary.json](D:/PersonalAgent-validation/native-live-test/evidence/regression-fix1-summary.json)、[checks.json](D:/PersonalAgent-validation/native-live-test/evidence/regression-fix1/checks.json)。

## 11. 未验证能力、安全边界与停止状态

- CC 直接编辑修复：NOT OBSERVED。实际没有问题需要 CC 修复，前后快照不变。
- Codex 自测失败后的自主修复：NOT OBSERVED。两次首次自测均通过；没有故意制造缺陷或消耗额外调用。
- 单独 Read/Search/Grep 工具、联网/MCP 工具全覆盖、人工主动暂停、运行中强制进程中断恢复：未在本次逐项触发。认证异常暂停/正式恢复已验证。
- 实际 GUI 成果批准后的 direct 确认：NOT OBSERVED。等待用户审核；实际预览不写文件，本地回归确认 apply written=[]。
- 开放完整原生 Shell/文件/网络能力不是操作系统级沙箱。规则仅约束授权范围，不能技术性阻止其他目录访问。Codex 实际读取本机工作规则属于已观察到的项目外读取；不能宣称所有访问局限于 MiniTaskCLI。
- 受保护既有路径清单比对24839项，1个 LevelDB LOCK因 EBUSY 无法读取。变化为用户重新登录的 Claude凭据及5个Electron图形缓存文件；已纳入清单的真实工程源码未变。该清单不涵盖全盘或新增文件探测，不能证明全机零变化。详见 [protected-comparison.json](D:/PersonalAgent-validation/native-live-test/evidence/protected-comparison.json)；报告不暴露凭据内容。
- CafeGame、FishEatFish、OpenWorld 等工程未作为开发目标；没有批准 FishEatFish 历史交付。成果预览只有本次 MiniTaskCLI。
- 本地工具输出部分中文受运行环境编码影响，可按原始日志核对；不以改写原始日志掩盖显示问题。最终源码、冻结规则、结果与快照以真实UTF-8文件和正式审计为准。

Run已完成，无继续开发或预算预约。成果文件已在direct测试项目内；PersonalAgent必要修复保留在开发分支，GUI保持审核预览。报告生成后停止，等待用户审核。
