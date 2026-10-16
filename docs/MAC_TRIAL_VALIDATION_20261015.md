# PersonalAgent Mac DEV 试用验收报告

日期：2026-10-15。外部 Codex 在本机独立 Worktree 实施。完整仓库和 Mac 开发环境已建立，DEV 全量桌面与三后端的 arm64 试用包已生成。Codex 真实开发、决策验收、停止恢复和历史重读已通过；Claude 尚未登录，OpenCode 指定免费模型出现真实工具循环，可见 GUI 验收仍因全局 work 模式待执行。本次是可试用候选，整体状态为 PARTIAL，不是全部功能验收通过或长期稳定版本。

## 仓库与源码版本

- 普通 `git clone https://github.com/wyl20020808/PersonalAgent.git`，执行 `git fetch --all --tags`，没有 shallow、single-branch、稀疏检出或 ZIP 替代。
- `git rev-parse --is-shallow-repository` 返回 false；全远端分支 fetch refspec 为 `+refs/heads/*:refs/remotes/origin/*`；获取到 269 个可达历史提交，远端当前无标签。收尾再次 fetch，远端三分支未变。
- MAIN：`b570972639237a017293d660df316e39572055c7`；DEV：`cd178cb99250192b06996c2c39d33c31fda834bc`；TEST：`adc7ca23073778caeace47294152ddca221c6966`。
- 完整仓库：`/Users/apple/Documents/Codex/2026-10-15/mac-personalagent-dev-macos-https-github/work/PersonalAgent`，保留 main 检出；本地 dev、test 跟踪对应 origin 分支。
- 任务分支：`feature/mac-dev-trial-20261015`；Worktree：`/Users/apple/Documents/Codex/2026-10-15/mac-personalagent-dev-macos-https-github/work/mac-dev-trial`。明确按用户指定 DEV 基线继续已有 Mac 草稿，没有改用 TEST。
- 应用源码提交：`8b3187cfb602239fd9e3e21b493827e0e2a87015`。后续仅文档/验收记录提交不会改变此安装包的代码版本；以 `mac-arm64/build-manifest.json` 为准。
- 项目 V2.1 治理、清理规则和问题反馈 V1.2 已执行。Windows 路径的 RTK/caveman 本机不存在，未冒充已加载。未合并 MAIN/DEV/TEST、未推送或公开发布，也没有替换其他实例。

## Mac 环境与适配

这台 Mac 为 arm64，macOS 27.0.1。复用本机 Node v22.23.2、npm 10.9.8、Git、Xcode Command Line Tools，原生安装两级锁文件依赖、Electron 44.7.0、Claude Code 2.1.300、Codex CLI/SDK 0.161.0、OpenCode CLI/SDK 1.18.35。CLI 经 `file` 确认是 arm64 Mach-O，没有复制 Windows node_modules、凭据或运行数据。

桌面服务/会话改用 Claude 发现函数，所选 npm/Python/Cargo 检查按本机工具解析。修复 POSIX 本地文件预览与 file URL 根路径、Mac TMPDIR、OpenCode 私有 npm 缓存、跨进程组取消，以及应用资源定位和可移动 npm 包装器。Agent 指导文本使用真实 Mac 策略路径。Windows 的 D 盘检查、工具默认值、taskkill 和原有流程保留；Windows 实机本轮未执行。

应用包带 Node/npm 与三种 Agent 工具，Finder 无需终端 PATH。数据位于 `~/Library/Application Support/PersonalAgent/instances/test`，默认 TEST 实例，包外持久化；全局策略在上一级 `global-interaction-policy.json`。Mac 对 D 盘任务目录的映射为本次工作根目录下独立 work、outputs 和各证据目录。完整开发命令和登录/升级方法见随附《Mac 开发和安装说明》。Python pytest、Rust/Cargo 等目标项目专属工具需按项目需要另装，本次 PersonalAgent TypeScript 开发环境不依赖它们。

## 功能状态

“回归”包含正式代码上的确定性夹具、适配器注入和真实文件/进程检查，不代表真实云模型或 GUI。源码没有删除界面、隐藏后端、替换 Mock 或关闭策略/Hook/交付门禁。

| 功能 | 本轮状态与证据 |
| --- | --- |
| Claude Code 决策、执行、讨论 | 功能和原生 CLI 保留；`auth status` 为 loggedIn=false，真实调用待用户本机认证。 |
| Codex 决策、执行、Review | 真实规划→执行→Review 完成；不是当前开发会话代写成果。包内模型查询返回 8 个模型。 |
| OpenCode 接入、模型选择 | 原生服务、OpenAPI 和模型发现通过，发现 opencode provider 的 9 个模型。真实 big-pickle 讨论未收敛，见问题记录；真实执行待验证。 |
| 单决策者与多决策者讨论 | 原实现、独立身份与轮次保留，相关回归执行；多模型真实讨论未完整验收，Claude 认证缺失。 |
| 只读讨论、开发模式与消息排队 | 保留并执行桌面回归；OpenCode 真实只读讨论失败记录未删，未当作通过。 |
| 项目和会话管理 | 正式服务创建真实项目与会话，设置保存、会话重读通过；侧栏、重命名、删除等回归执行。 |
| 决策与执行、任务顺序与依赖 | 真实单任务完整链路通过；多任务/依赖夹具回归执行，未声称真实复杂 DAG 全覆盖。 |
| 流式输出与工具活动 | Codex 真实调用持久化 172 条审计、59 条可重读历史消息；增量 UI 显示待 GUI 验收。 |
| 附件、图片、图片历史 | 原功能保留，multimodal、图片绑定/读取与桌面文件相关回归执行；真实模型图片理解及用户粘贴/选择待验。 |
| 文件卡片、Git diff 与外部本地预览 | 修复 Mac 绝对路径和 file URL；真实文件/Git 专项回归通过。可见菜单、Finder reveal 待 idle。 |
| 历史与用量 | 新服务重读真实会话、审计与历史通过；4 次调用中 1 次主动中断无用量，其余 3 次报告输入 243181、其中缓存 171392、输出 2783。仅已观测下限，不折算金额。 |
| 上下文、长期文档与压缩 | 源码与能力保留；真实调用记录上下文观测，压缩阈值未触发。部分历史 Context 夹具仍失败，不能称完整验收通过。 |
| 暂停、停止与恢复 | 通过正式 stop/resume 接口停止并恢复同一 Run，决策 Session 和执行 Thread ID 保留；恢复后任务完成。 |
| 自动监督、后台恢复、崩溃保护 | 源码、开关和 watchdog 保留，监督回归执行；没有擅自启用用户自动开发，长期运行/真实崩溃恢复未验。 |
| 验收与交付 | 真实决策者 pass 记录成功；没有伪造 userAccepted 或实际测试字段。正式审批、应用、合并仍走原门禁，本次未对真实项目执行正式交付。 |
| MAIN/DEV/TEST 隔离与项目互斥 | Mac 默认路径、owner 拒绝混用及跨进程测试通过；实际 Electron 本轮只启动 TEST，未同时实机跑三实例。 |
| work/idle、Hook 与系统风险限制 | 全局缺失按 work，未改全局模式；策略、Hook、切换取消等专项检查执行。用户尚未切 idle，可见 GUI 验收标记 deferred_by_work_mode。 |
| 子进程取消与归属 | 真实 POSIX 测试确认独立子进程组被终止，无关进程保留；Windows 分支未改变。 |
| Skills、MCP、原生扩展与模型配置 | 保留本机配置继承与共享技能发现，未复制认证；各用户外部 MCP 服务和扩展的端到端效果没有逐一真实验收。 |
| 终端启动与包内运行 | 打包应用实际启动，startup 记录 packaged=true、arm64、包内 Node；包内 Controller --help、npm 和 Codex 模型服务通过。 |
| LaunchServices 与 Finder | `open -n -a` 通过 LaunchServices 启动打包应用，记录 PID 60850。Finder 手工双击及可见 GUI 操作尚未执行；不能把进程启动当全部界面通过。 |
| UI 关键交互、剪贴板、截图与窗口恢复 | 全界面和入口保留；单元回归执行，实际可见交互待用户在应用中切 idle 后补验。 |
| 安装、升级与长期稳定性 | DMG/ZIP 完整性通过，资源无外部软链接；复制到 Applications 后的手动安装、旧版本升级、长期稳定性仍待试用。 |

## 实际验证

| 检查 | 结果 |
| --- | --- |
| 根目录 npm run build | 退出码 0。 |
| desktop npm run check / npm run build | 均退出码 0；保留既有 use-client 构建警告，没有隐藏告警。 |
| Mac 平台/实例/子进程专项 | 18 通过，0 失败，1 Windows 专项跳过。 |
| Mac 桌面路径、文件、策略、服务专项 | 40/40 通过。 |
| OpenCode 环境/协议和 POSIX 专项 | 8/8 通过。 |
| 完整 Controller 回归 | 594 项：568 通过、24 失败、2 跳过；退出码 1。 |
| 完整桌面回归 | 181 项：180 通过、1 失败；退出码 1。 |
| 未修改 DEV 同提交对照 | Controller 577 项：548 通过、27 失败、2 跳过；桌面 180 项：174 通过、6 失败。Mac 测试路径修复后展开了此前在模块加载前失败的策略用例。 |
| Codex 真实项目 | Run `5695b4e8-f868-4f89-b755-e42df5bea3bd` 完成，decisionAccepted=true；项目 3 个 node:test 独立重跑通过。 |
| 包内资源 | 生产 dist/src 与开发构建逐文件比较一致；扫描无 auth.json、.credentials.json、sessions.json、state.json、profiles.json；没有包外软链接。有限文件名检查不等于完整隐私审计。 |
| 签名/归档 | codesign --verify --deep --strict 通过，ZIP unzip -t 通过，DMG hdiutil verify 通过。 |
| Git | diff --check 通过，独立任务分支提交；没有正式分支合并或推送。 |

Controller 余留失败的名称如下，逐项原始结果保存在 `evidence/controller-regression.txt`；对应 DEV 对照保存在 `evidence/dev-baseline-controller.txt`。失败主要涉及现行决策自主完成与旧验收预期、深路径/大文件/上下文夹具、锁与旧用量预期。未通过改写断言或关闭门禁来让这些失败消失。新展开的 pending GUI 用例与草稿交接文档已记录的基线失败一致。

- T1 repeatable fixed task uses actual Diff, full contracts and decision/user acceptance (injected Mock)
- T2 repeatable fixed task uses actual Diff, full contracts and decision/user acceptance (injected Mock)
- T3 repeatable fixed task uses actual Diff, full contracts and decision/user acceptance (injected Mock)
- T3 main/dev Git versions and stale hashes use fresh workspace knowledge, never historical manifest
- deep clone at 195 characters either verifies and completes or safely rejects before any Agent
- deep clone at 205 characters either verifies and completes or safely rejects before any Agent
- deep clone at 220 characters either verifies and completes or safely rejects before any Agent
- unborn Git and ordinary folders remain supported; fatal HEAD errors are not unborn
- pending GUI cannot bypass human/fail Review or a failed safe acceptance check
- large project lifecycle direct Git=false, unchanged resources remain checked
- large project lifecycle direct Git=true, unchanged resources remain checked
- large project lifecycle isolated Git=false, unchanged resources remain checked
- large project lifecycle isolated Git=true, unchanged resources remain checked
- asset.uasset edits reach decision reviewer and wait for explicit user acceptance
- blob.dat edits reach decision reviewer and wait for explicit user acceptance
- missing format closes incompatible service before one fallback; private runtime and cancellation signal retained
- no tests does not produce completed or verified result
- explicit rework at missing-tests pause executes current task and retains sessions (proposal)
- explicit rework at missing-tests pause executes current task and retains sessions (native)
- dead recovery guard is reclaimed; acquired project lock still excludes another Run
- live recovery guard, empty historical guard and malformed guard are never removed
- dead recovery claims do not block; live and unknown claims exclude recovery
- measured multi-task review cost drops while complete independent evidence remains
- Codex public events expose actual items without treating proposals as passed tests

桌面唯一余留失败：`isolated rounds require formal application of previous result; history stays unchanged`，同一用例在未修改 DEV 对照也失败。保留其失败事实，本次不宣称完整自测成功，因此不自行合入 TEST。

## 真实 Run 与问题记录

Codex 会话：`fafa3821-0111-4d05-aa85-8d4c7b852d19`。决策 Session：`01a13d51-1967-78f1-b745-27322a45a4f5`；执行 Thread 在停止前后两次事件均为 `01a13d51-6928-7ac1-bad0-8d2f5fead33f`。真实项目和不可重建的 Run/Session 原记录保留在 `/Users/apple/Documents/Codex/2026-10-15/mac-personalagent-dev-macos-https-github/work/mac-real-evidence`，脱敏摘要在 `evidence/codex-real-summary.json`。

新增问题记录：`problems/2026-10-15-opencode-readonly-discussion-loop.md`，待处理。OpenCode 只读讨论出现 69 个独立 callID 的完成读取，没有最终回复；开发会话主动终止本任务服务，正式链路保留失败状态和人工恢复提示。原 Session、DB、审计及部分结果保留在 `/Users/apple/Documents/Codex/2026-10-15/mac-personalagent-dev-macos-https-github/work/mac-opencode-evidence`。本问题影响 OpenCode 此模型验收，不影响已通过的 Codex 真实开发。未自动重放、重建或删除原 Session。

## 产物与安装

产物目录：`/Users/apple/Documents/Codex/2026-10-15/mac-personalagent-dev-macos-https-github/outputs/mac-arm64`。

| 产物 | SHA-256 |
| --- | --- |
| PersonalAgent-DEV-Trial-arm64.zip | `7cba99307c6834220dacf617abfb46de1a2194c43cb89fb5369dfeddfd682112` |
| PersonalAgent-DEV-Trial-arm64.dmg | `5d9eeb5a08bca9d6a065c013e9f1d541f70d03a8677aa3f93c4cfbf9ce81904b` |
| .app 文件树 | `652301e14725426665248d42bb4d65e2aaa559c929590e7a8b71d8f0eb9390fd` |

.app 文件树哈希为按相对路径排序的文件 SHA-256/软链接目标 JSON 的 UTF-8 SHA-256，完整输入在 `evidence/app-file-sha256.json`。路径、版本、提交与签名元数据在 `mac-arm64/build-manifest.json`。

DMG 打开后把 `.app` 拖到 Applications，或直接解压 ZIP 后运行。首次可优先把决策者、执行者都设为已在本机登录的 Codex；使用 Claude 前由用户执行本机 `claude auth login`。不要复制 Windows 登录数据。应用使用原有用户配置，包内无凭据。

包为本地开发 ad-hoc 签名，没有 Developer ID、公证或 Hardened Runtime 分发承诺；没有修改 Gatekeeper 或任何系统策略，Electron renderer sandbox 仍启用。若系统阻止打开，在系统安全设置中核对可信来源后允许，不能关闭系统安全保护。升级前停止任务、退出应用、备份包外运行目录，保留旧包；不能只回退代码就宣称数据已恢复。详细命令见《Mac 开发和安装说明》。

## 清理报告

- 已删除：本任务 30 项测试夹具、缓存、对照构建、重复 Agent 安装、DMG staging，以及两份中断下载和被拒候选包。30 项目录中文件逻辑大小合计 39,433,729,127 字节，包含测试稀疏/重复文件，未实测磁盘回收量；不能把该数字当作实际释放物理空间。清单在 `evidence/cleanup-receipt.json`。
- 已保留：完整 Git 仓库、独立任务 Worktree、已提交源码与规则文档；本机 node_modules、dist、desktop/out 为用户要求的持续开发环境保留；.app、DMG、ZIP、哈希和最终证据为交付物保留。
- 已保留：真实 Codex 与 OpenCode 项目、Run、Session、原始审计和 OpenCode 私有运行状态；没有清理用户凭据、共享缓存或其他任务目录。
- Worktree：一次性 DEV 对照 Worktree 已正常移除；任务 Worktree 未合并，保留供继续开发，不强制覆盖正式分支。
- 进程：验收用 Controller、Agent、Electron 和 watchdog 均结束；应用可从交付目录重新启动。真实 OpenCode 失败状态保留，没有后台付费/写入调用继续运行。
- 未能清理：无归属于本任务且确定无用的残留；受保护的真实运行记录按上项保留。过程日志和一次性文件已仅保留最终结论集。
