# Global Work / Idle Mode V1 — 工作模式持续开发

2026-10-10 语义修正。产品定义：**工作模式 = AI 持续开发，但不碰用户的桌面。** 修正基线 `591388d`；继续使用 `feature/global-work-idle-mode-v1`、`D:\PersonalAgent-worktrees\tasks\global-work-idle-mode-v1`，原开发基线仍为 `dev@ddb098aedff7a40dc4a161f2e8eda8722bf32598`。本次由独立 Codex Desktop 开发，不替换 MAIN、DEV、FPSArena，不修改 P3A/P3C，不调用付费模型，不合并或推送。

## 两种模式与状态

`work` 默认表示后台持续开发。模型推理、Plan/Execute/Review、Decision Discussion、P2A 后续派发、Session/resume、Project Context、源码读取和编辑、普通 Git、Shell、后台构建、单测、lint/typecheck 都继续。`idle` 允许任务范围内经授权的前台交互和 GUI 验收，但不授权关机、重启、注销、休眠、驱动/BIOS/磁盘/关键系统修改或极端压力测试，也不扩大提交、交付、发布或推送权限。

共享固定状态文件 `D:\PersonalAgent-data\global-interaction-policy.json`，结构 `{"version":1,"mode":"work"}`。MAIN/DEV 使用同一状态、不同 Session/Run/日志目录。生产状态路径不接受环境变量或 Run 参数覆盖。缺失、不可读、损坏、超过 4096 字符、未知版本/模式均按 work。用户经精确校验的 `interactionMode` IPC 修改；独占临时文件、flush、原子替换，Windows 短暂占用沿用有限重试，不删除目标或原地覆盖。Agent 没有模式切换工具，禁止写入或绕过策略。

设置界面保留紧凑选择框，说明“AI 持续后台开发，但禁止桌面交互和危险系统操作”；空闲说明“允许经授权的桌面交互和 GUI 验收”。页面内展示配置异常、后台开发允许、桌面交互禁止、GUI 验收延后；切换只写本实例非打扰日志，不弹框、不抢焦点。

## 统一操作级 Policy Decision

`classifyOperation / decideOperation / assertOperationPolicy` 是共用入口。策略针对一个操作而不是 Agent/Run，不再存在 `requireIdle` 式真实 Agent 总闸。

| 类别 | work | idle | 例子 |
| --- | --- | --- | --- |
| BACKGROUND_SAFE | 允许 | 允许 | 模型、Controller/Worker、源码、普通 Git/Shell、Node/Python/编译器、build/test/check、确认隔离的 headless |
| DESKTOP_INTERACTIVE | defer | 仍遵守原任务授权 | 鼠标/键盘/输入 Hook/剪贴板、用户窗口/焦点/显示、可见浏览器、CDP 接管用户 Chrome、不明浏览器验收 |
| SYSTEM_HIGH_RISK | deny | deny，不自动获权 | 关机/重启/注销、boot/驱动/关键注册表和服务、磁盘/系统目录破坏、已知极端压力工具 |
| RESOURCE_HEAVY | defer | 在已有任务授权内执行 | 已知重型编译/渲染、benchmark、一般 stress；普通项目构建不归入此类 |

受控 launcher 使用执行元数据、工具类型、headless/浏览器隔离属性和进程能力。验收配置可给单个 `tests[]` 设置 `interaction`；不能用该字段把已识别的桌面/系统能力降为 BACKGROUND_SAFE，模型/Controller 身份只由内部调用点指定，不开放给测试配置。

普通未知开发程序默认允许，不使用固定程序白名单。Shell 的可见风险补充检查结合 executable、argv、命令内容、有限深度的字面入口/包装脚本、npm 生命周期以及 EncodedCommand 解码；脚本读取有文件数、深度和大小边界，不扫描整个项目或单测套件。该检查能拒绝测试覆盖的直接及字面包装风险，**不是完整 Shell 解析器、动态程序分析或 Windows 安全沙箱**。动态构造、混淆、下载代码、未观测的后代进程、修改后再启动和自定义原生扩展仍可逃出应用层观察。不能宣称普通任意 Shell 已绝对安全。

真正 headless 且隔离用户浏览器的受控任务允许；headed、CDP、用户浏览器连接优先判为交互，即使同时声称 headless 也延后。未知浏览器任务延后。V1 不实现完整资源调度器；明确重型/压力任务在 work 延后，普通构建继续。

## PersonalAgent 执行路径

| 路径 | 当前技术接入 | 边界 |
| --- | --- | --- |
| Controller `agentOperation`、RealAgents 三阶段、Desktop launch | 以 BACKGROUND_SAFE 正常派发；切模式不取消 Run | 原生 Agent 内部工具还需要各自 Hook；不能仅凭外层进程属性保证内部行为 |
| Claude Code adapter | invocation-local `--settings` 合并 PreToolUse，明确启用 Hook，模型/Session/计数正常；不覆盖用户设置文件 | 真实 CLI + 本地假模型验证了安全 Bash 放行、交互 Bash 拒绝、模型继续；其他工具/扩展、Hook 故障与原生后代仍有缺口 |
| OpenCode service/adapter | 受管理 runtime 的 plugin 注册 `tool.execute.before`，读取同一策略并拒绝具体工具；模型发现/讨论正常 | 真实 V1 CLI + 本地假模型验证了 Plan/Review、Bash 放行/拒绝和 Run 完成；V2 不支持原有结构化输出的限制仍保留 |
| Codex SDK Worker / `runCodexTurn` | 正常启动/恢复；规则追加；模式切换不 abort SDK/Worker | 未自动安装全局 Codex Hook；没有已验证的 invocation-local SDK 全工具 Hook。当前原生工具主要靠指令约束，不能冒充技术阻断 |
| `runProcess`、受管理脚本/验收入口 | 同一 Policy Decision 在 spawn 前判断；风险返回 defer/deny；Windows hidden、shell:false | 只覆盖此入口及可观察脚本，不拦截原生 CLI 内所有内部子进程；隐藏进程本身也不能阻止后代 GUI |
| Browser/interactive validation | 通过单项验收 metadata 和同一 launcher 判断；未确认 headless 延后 | 已有用户浏览器不被接管；本轮浏览器正反例使用 fake launcher，没有实际打开浏览器 |
| 独立 `codex-policy-launch` | work 正常启动后台 CLI，切模式不杀 CLI | 只管理该入口，工具层保护依赖另行安装/信任的 Hook；既有 Desktop/CLI 不被天然接管 |

真实模型调用使用原有账号、模型、Session、SDK、P2A、Context 与正式审批；本轮验证全部使用本地确定性模型夹具，不调用付费服务。原生危险工具拒绝是模型可以处理的单项反馈，规则要求继续无依赖开发，不能把拒绝升级为“work 禁止整个 Agent”。

## 模式切换、pending 和依赖

取消监测只附着于已识别的受管理交互/重型进程。idle 切 work 后 100 ms 轮询取消该进程树；BACKGROUND_SAFE 模型、Controller、普通 build/test 不挂模式取消器。用户 stop、超时与原有恢复信号仍生效。不会按名字杀 Chrome、课堂软件或其他用户应用。

验收入口捕获单个 `InteractionPolicyError`，写 `deferred_by_work_mode` 或 `requires_system_authorization` 审计，返回带 status 的非成功结果，继续其他安全验收。正常失败仍按原流程处理。Controller 保留 GUI pending 的节点，不加入 completedTaskIds；只有 Review pass 且存在 pending 验收时，才选择所有前置已完成的独立节点继续，不能越过 Review human/fail、审批或上下文保护。依赖 pending 节点的任务等待。

所有可运行独立节点处理完后，Run 可以显示 paused，原因明确是剩余相关节点待验收，不是模式总闸。`deferredTaskIds` 保留待验收身份；idle 后用户明确恢复，从该节点 verify 开始，不重跑已完成实现，实际通过后再运行依赖节点。GUI pending 不被伪造为 PASS/交付。系统高风险结果会保持 pending/拒绝；V1 没有新增 Agent 可自行填写的高风险授权开关。

本轮 DAG 夹具验证了 GUI 节点代码完成、安全检查成功、独立节点完成、依赖节点未派发，以及 idle 明确恢复只补 GUI 无害夹具验收、随后运行依赖节点。验收配置之外的原生 GUI 请求由 Hook/行为规则负责反馈；V1 不从自然语言推断所有 GUI 验收义务或建立新调度系统。

## 独立 Codex 实际覆盖

现场运行时为 npm CLI `0.147.0` 和 Desktop 内置 `codex.exe 0.162.0-alpha.2`，不将内置运行时版本冒充 GUI 产品版本。使用隔离 CODEX_HOME、独立工作区、无认证的本地 Responses 服务；PreToolUse 经 hooks/list 发现、写入精确持久信任记录，再重启确认 trusted，无 trust bypass。工具调用来自本地 Mock，调度来自真实安装的 Codex。

- 两套运行时实际执行了安全 `echo POLICY_BACKGROUND_SAFE`。
- 随后仅请求无害 `echo ClipCursor POLICY_HARMLESS_PROBE`，用于触发桌面分类，不调用 ClipCursor。两套 Hook 实际返回结构化 deny，工具未执行，模型继续下一轮。
- CLI apply_patch 新增源码成功。Desktop 本地模型工具目录没有该 custom tool，结果 unsupported，不声称验证通过。
- Mock MCP 未进入注册工具目录，属于 unsupported，不能当作技术拒绝证据。code-mode、hosted/专用工具、插件/MCP 启动、已存在的 write_stdin 等仍未证明完整覆盖。
- 无害 command/exec RPC 因“无法创建目录或文件”失败，不能据此证明 Hook 覆盖。

Windows Codex Hook 命令需要 PowerShell `&` 调用带空格 Node 路径，拒绝通过 exit 0 的 stdout structured permissionDecision deny；此前 exit 2 包装路径不可靠的问题保留历史记录。Claude 的 invocation-local Hook 使用其命令 Shell 的普通引号格式，并经真实 CLI 验证，不能把两种调用语法混用。

官方边界参考：[OpenAI Hooks](https://learn.chatgpt.com/docs/hooks)、[Claude Code Hooks](https://code.claude.com/docs/en/hooks)、[OpenCode Plugins](https://opencode.ai/docs/plugins/)。文档支持和 enabled/trusted 元数据不能替代实际拒绝测试。

## 全局安装与更强隔离

用户 live Codex 配置尚未安装本策略。现有全局 AGENTS.md、hooks.json、config.toml 没有被本轮覆盖；安装候选保留 AGENTS 原始字节前缀、合并既有 Hooks、只备份 config，附文件哈希、安装和回退清单。最终候选 `validation/codex-install-stage-semantic-final-v2` 属于私有本机资料，未入 Git；原先候选仅为历史验证。

全局安装仍需针对具体候选的明确授权、最新哈希核对、备份、精确 Hook 信任与 live 配置复验。回退恢复备份、不删除 Session/Run/全局模式或用户其他 Hooks。**隔离验证通过不表示任意独立 Desktop、SDK、CLI 当前已受保护。**

与用户同一 Windows 用户/Session 下的任意原生代码仍可能绕过策略、修改模式/Hook、通过未观测子进程干扰桌面。只允许用户改模式目前由 API 归属、工具路径保护和指令维护，未建立不可写 ACL/权限边界。轮询不能撤销已发生操作，不能可靠停止脱离进程树的外部服务。更强保证需要受保护策略目录、Job Object、受限 Token、独立用户、非交互 Session/独立 Desktop 或 VM；本轮不实施这些大型隔离设施。

## 验证与交付

策略专项最终 16/16，Desktop 84/84，TypeScript/Controller/Desktop build 通过。专项实际在隔离项目执行源码编辑、Node/Python、npm build/test、Git init/add/commit/status/diff；提交仅属于明确授权的临时夹具。另验证编译输入不会作为可执行脚本扫描，Root/Desktop build 分类正常。headless launcher 用 Mock 验证，不冒充真实浏览器验收。鼠标、键盘、ClipCursor、窗口/焦点/显示、关机/重启/注销、重型/压力请求均只到 fake launcher 或无害 echo 探针；没有真实桌面交互、强退用户 Chrome、重启或压力任务。

真实 Claude CLI 与真实 OpenCode V1 CLI 都使用本地假模型验证安全 Bash 和交互拒绝后继续。OpenCode Run 实际完成且 Controller 验收成功；Codex 两套真实运行时的 Shell 正反例通过。付费模型调用 0。证据在 `docs/evidence/global-work-idle/verification-summary.json`。整库阶段检查 322 项、203 通过、119 失败；119 个失败名称均出现在已有 DEV 归档失败集合，无新增名称，但归档长路径影响比较，不能据此宣称严格回归等价。最后的编译输入分类修正及审批否决专项单独复核至 16/16，不把阶段整库日志冒充最后提交的全绿检查。旧 Snapshot/预算前提等问题不在本轮全面迁移范围内，未恢复强制 Snapshot。

复核命令（任务工作区）：

```powershell
rtk proxy npm run build
rtk proxy node --test dist/test/interaction-policy.test.js
rtk proxy npm --prefix desktop run check
rtk proxy npm --prefix desktop run build
rtk proxy npm --prefix desktop test
rtk proxy npm test
rtk proxy node scripts/verify-codex-interaction.mjs <本机codex.exe绝对路径>
rtk proxy node scripts/verify-claude-interaction.mjs <本机claude.exe绝对路径>
rtk proxy node scripts/verify-opencode-interaction.mjs <本机OpenCodeV1.exe绝对路径>
rtk proxy node scripts/verify-install-candidate.mjs validation/codex-install-stage-semantic-final-v2
```

回归 loader 改用隔离 work 夹具，不读写 live 模式；测试专用子类只向测试子进程传入该 loader，生产仍清除 NODE_OPTIONS。真实服务夹具用短路径，避免长目录基础设施错误冒充策略拒绝。新增 Claude CLI 合约测试核对 invocation-local Hook，而不是继续断言绝不允许 --settings。

问题文档：`problems/2026-10-10-work-mode-pauses-development.md` 记录本轮已解决的语义错误；`problems/2026-10-10-codex-hooks-not-enforced.md` 保留原生覆盖和全局安装待处理边界；历史整库失败补充于 `problems/2026-10-10-snapshot-era-regression-fixtures.md`。这是独立 Codex 自主验证，不是另一 Controller 开发验收。用户授权本 feature 修正提交；不合并 DEV/MAIN、不 push，完成后等待验收。
