# Mac GUI 实机验收记录

日期：2026-10-14（America/Los_Angeles）。承接首次 Mac 交付报告。用户明确授权安装到 Applications、打开及继续 GUI 验收，禁止推送和正式分支合并。本轮未执行上述 Git 对外或正式分支操作。整体仍为 PARTIAL：主要 Codex 试用链路已实测，不代表全部 DEV 功能和长期稳定性通过。

## 运行与版本

- 安装位置：`/Applications/PersonalAgent DEV Trial.app`，arm64、TEST 实例。初次核验发现应用已在 Applications，复用同一包；没有覆盖其他修改或导入 Windows 数据。
- 原运行构建：`8b3187cfb602239fd9e3e21b493827e0e2a87015`；退出修复构建：`6cd61e7`（完整提交见新版 build-manifest.json）。任务分支仍为 `feature/mac-dev-trial-20261015`，DEV 基线 `cd178cb99250192b06996c2c39d33c31fda834bc`。
- 原“看不到窗口”时，该已记录进程后来已退出；确切首次退出原因尚未确认。隔离真实后端/renderer 可正常渲染，显式可见启动后用户成功操作设置，不能把首次现象宣称为已定位的空白 renderer 缺陷。
- 全局策略文件在 `~/Library/Application Support/PersonalAgent/global-interaction-policy.json`，用户于 UTC 2026-10-15 02:42:59 切为 idle，updatedBy=user；Agent 没有修改策略。
- 实例数据：`~/Library/Application Support/PersonalAgent/instances/test`。GUI Run `632a1853-c2fb-4e46-805a-2fdf7ec80365`，会话 `eda6634f-e312-43b0-a2db-7c4e09b2e21d`。

## 实机结果

| 检查 | 真实结果与限制 |
| --- | --- |
| 可见窗口、导航与设置 | 完整界面可操作，idle 显示正确；项目群、工作台、运行详情、成果交付、历史页面可进入。 |
| 后端/模型配置 | Codex 模型列表返回 8 项，可选 gpt-6.1-sol/low；多决策者选择与轮次控件可用。未把多模型真实讨论标为通过。 |
| 项目绑定 | 原生文件夹选择器绑定本任务独立 gui-real-project，授权提示只针对该目录。 |
| 文本与图片附件 | 原生文件选择器加入文本和 PNG 两个附件，显示 2/8；图片预览正常，历史保存附件，真实 Agent 确认文本标记。PNG 为最小 1x1 验收图片，未验证复杂图片理解或拖放/剪贴板全部组合。 |
| 真实规划、开发、流式显示与审查 | GUI 派发真实 Codex 决策/执行，创建 counter.mjs、counter.test.mjs，看到实际阶段、工具活动、结果和审查通过。没有由本开发会话代写成果。 |
| 暂停恢复 | 执行中点击暂停，已修改文件保留；GUI 发送恢复指令后同 Run 完成。决策 Session `01a13d75-3513-7d21-82ae-cd59a39ff371` 与执行 Thread `01a13d75-863a-7450-a909-3d49849e446b` 在暂停前后相同。 |
| 目标项目测试 | 真实执行者 npm test：3 项通过、0 失败；决策者核对凭证/源码后 pass。本开发会话另跑 npm test，独立得到 3/3 通过。四个原文件哈希未变，PNG 未修改。 |
| 文件预览 | 点击 counter.mjs，在应用内只读标签显示真实源码与 Mac 绝对路径。 |
| 历史和用量 | 真实 Run 持久化，历史列表按 Run ID 搜索命中；普通重开后会话、附件、完成状态及 2 次决策/2 次执行调用可恢复显示。上下文仪表为 12%，未触发真实压缩。 |
| 交付预览及门禁 | 生成真实只读 Delivery `102a2159-45fb-4778-a04b-7052b26c5a72`，状态待审批；“批准具体成果”仍需用户决定，确认按钮禁用。本轮未批准、Apply、合并或发布。非 Git 项目 Diff 为 0 并明确警告文件变更未自动验证；不把空 Diff 当作无变更。 |
| 测试与验收字段区分 | state 中 decisionAccepted=true，decisionReview=pass；Controller tests=[]、passed=false、userAccepted 未设置。Agent 的 npm test 凭证不伪写成 Controller 独立测试或用户审批。 |
| 退出保护 | 实测旧版 Cmd+Q 弹出 Object has been destroyed：closed 后访问 BrowserWindow.webContents，will-quit 再次清理重复触发。修复改为初始化时保存 WebContents emitter，退出仅解绑引用；不削减 renderer 恢复能力。新增销毁后重复清理回归。修复后 Finder 打开、Cmd+Q 正常退出（PID 96928 消失、未再弹错）、Finder 再开（PID 97140）及历史/源码预览均通过。 |
| 已知显示缺陷 | 工作台/运行详情仍把 Codex 决策者标成 Claude Code/CC，聊天角色与后端路由正确。新建 problems/2026-10-14-workbench-agent-labels.md，状态待处理；该显示项不通过。 |

## 本轮检查

- desktop `npm run check`、`npm run build`：通过。
- rendererRecovery 回归：7 项全部通过，包含 native window 属性销毁后 closed + repeated dispose。
- 完整桌面回归：182 项，181 通过、1 失败。失败仍为原有 `isolated rounds require formal application of previous result; history stays unchanged` 的 Windows 路径夹具，在 Mac 报“请选择绝对项目目录”。没有删除断言或关闭门禁。
- 生产包重建、严格 codesign 验证：通过；ZIP 全量 unzip -t 和 DMG hdiutil verify 均通过。
- Applications 安装修复版后，实际从 Finder 选中应用并 Cmd+O 打开（不是仅检测进程）；可见完整界面。Cmd+Q 正常退出，再从 Finder 打开，历史、附件、审查、待审批交付及源码预览仍在。最终 PID 97140，无调试端口。
- 真实模型 Run 在原 8b3187c 构建完成；6cd61e7 仅修复窗口销毁清理，本轮没有无必要地重跑整个付费任务。新版已复测其变更涉及的退出、启动及历史显示。

## 未覆盖范围

Claude 本机认证仍缺失；OpenCode 真实免费模型讨论循环问题沿用首次报告，未宣称解决。真实多决策者讨论、复杂 DAG、全套 MCP/Skills、长期自动监督、三实例并行、所有复制/拖放及压缩路径、Windows 实机没有全部补验。Developer ID 签名、公证和长期稳定性尚未通过；应用采用 ad hoc 开发签名，renderer sandbox 和原策略/Hook/审批保留。

## 证据与成果

同目录 gui-evidence 保存附件预览、暂停、完成源码预览、交付预览、重启历史和修复前退出错误截图，及 gui-run-summary.json、执行者 npm-test.log/verification.log、窗口恢复回归日志。原始 Run/Session/审计仍在实例 TEST 数据目录，未复制凭据。真实目标项目保留在工作根目录 work/gui-real-project，不作为临时夹具清除。

## 最新产物与安装

最新应用源码：`6cd61e7402a461ba925f9a2d589553ce19b370d1`。本轮应用已安装到 `/Applications/PersonalAgent DEV Trial.app` 并保留打开，便于用户试用；不自动派发新任务。

最新输出目录为 `outputs/mac-arm64-gui`，包含 `.app`、ZIP、DMG、build-manifest.json 和 SHA256SUMS.txt。首次 `outputs/mac-arm64` 旧包保留作回退，不能把旧 DMG 当作包含退出修复的新版。

- ZIP SHA-256：`f6f0fba6023ff83f1cc8e701f1ac4eb8ac46b799b247e9a55e4977f812e82aae`
- DMG SHA-256：`48f2d13c4cbb69675ac1e25e67c0a61f7ebd7bdb321203bdf4f6eac2b6efb6a5`

登录、安装、后续源码开发和安全升级步骤仍见《Mac开发和安装说明》。新版仍为 ad hoc 开发签名，未签 Developer ID、未公证。不要关闭系统安全策略。模型认证仍用本机用户授权。

## 清理报告

- 已删除：本任务 work/gui-acceptance 的诊断脚本、隐藏 Electron 数据与过程截图/日志、旧已安装包的临时备份；中止的慢速打包 stage 和其系统临时下载；本任务 work/npm-cache、work/electron-cache；本轮回归生成的 desktop/D:、.v03e-tests、.v3c3、global-interaction-regression 夹具及 desktop/.cache。明细在 gui-evidence/cleanup.json，逻辑大小约 3.37 GB；含 sparse/hardlink 统计，不宣称实际物理回收同等空间。
- 已保留：最新与首次可回退应用/ZIP/DMG、最终证据；真实 gui-real-project 的源码与四个原文件；TEST 的 Run/Session/审计、用量、待审批 Delivery；原有真实测试历史；本机认证配置。真实 Agent 的凭证目录按原引用保留。
- 未能清理：无。开发 node_modules、dist、desktop/out 为紧接着持续开发而保留，未当成验收证据。
- 进程：诊断、下载、测试、打包和原带调试端口的进程均结束；9348 已无监听。按用户“安装并打开供试用”的明确要求，最终正常 Applications 实例 PID 97140 和其 watchdog 97144 保留，当前没有活跃模型 Run；不把此用户试用实例当作遗留诊断进程关闭。
- Worktree：任务分支尚未合并，保留独立 Worktree 和开发依赖供持续开发。完整主克隆、MAIN/DEV/TEST 和其他任务未清理或改写；没有执行推送或正式分支合并。
