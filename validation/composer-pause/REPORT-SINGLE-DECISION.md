# 暂停、角色状态与单决策者切换验证

日期：2026-10-11。任务分支 `feature/composer-pause-20261011`，目录 `D:\PersonalAgent-worktrees\tasks\composer-pause-20261011`，dev 基线 `d2fe3e67ee911c816070afca5010fcc6f76213a9`。发起端为 Codex 桌面会话。正在使用的 DEV 未修改、未重启。未提交、合并、推送或发布。

## 实现

- 聊天框右下角显示波形、实际决策者/执行者及阶段、圆形方块暂停按钮。顶栏执行状态与停止任务入口删除。规划与审查显示决策者，执行显示执行者，独立验证显示 Controller。
- 暂停等待原 Controller 子进程退出；保留草稿和附件，防止重复请求。暂停后提供精简的继续、决策者、执行者入口，切换共用紧凑弹窗。
- 单决策者支持 Claude Code/Codex/OpenCode 和支持的模型。多决策者任务禁止切换；活跃进程、只读历史、不可恢复失败仍受保护。
- Controller 在 Run 锁内保存交接 JSON，记录旧身份与 Session、计划、完成项、当前任务、反馈、验收摘要与差异。保留同一 Run、工作区、执行 Session、计数；新决策者创建新 Session。
- Desktop 正式 resume IPC 支持单角色切换并继续；更新会话后续默认决策者，历史 Run 不改写。一次只切换一个角色。
- 治理文档增加用户授权的单决策者暂停切换修订，多决策者锁定及交付审批保持。

## 本地验证

- 根目录 build、desktop check/build 通过。无关自动导出 schema 格式差异恢复；lucide-react 现有警告退出码 0。
- desktop 串行回归 103/103 通过，包含正式 IPC 切换、Session 后续默认身份、活跃与多决策者拒绝。
- 新 Controller 切换测试 4/4 通过，覆盖交接记录、已有修改/完成项/执行 Session 保留、重启恢复、身份保护及恢复。
- 隔离 Electron 离屏 UI 检查 18 项通过，覆盖暂停去重、等待退出、草稿、角色切换、决策身份、审查/Controller 状态、多决策者禁用及错误重试。见 `result.json`。
- 相关 Controller、恢复、决策适配器、讨论及 OpenCode 执行串行回归 127/127 通过（含上述 4 项新增测试），耗时 446.6 秒。正向选择 `decision-switch`、`decision-agent`、`decision-discussion`、`codex-decision-agent`、`codex-decision-runtime`、`controller`、`recovery`、`opencode-execution-agent`；未运行禁止的大快照夹具，不是全库回归。

## 真实 Claude Code → Codex

使用用户本轮明确授权额度，通过真实 DesktopService → CLI → Controller → RealAgents 执行，未替换 launch、模型响应或 Agent。只读取隔离微型项目，不修改用户项目。

- Run `4b1fa515-71f7-42d3-be1a-a2ef40d4ec6a`。
- Claude Code 原生读取随机 marker，返回 `CLAUDE_READY:<marker>` 并人工暂停。
- 正式 resume IPC 切换 Codex。Codex 原生读取交接 JSON 与 marker，返回 `CODEX_HANDOFF_OK:<marker>` 并暂停。同一 Run、工作区、marker 内容保持；旧 Claude Session 留在交接与审计，新 Codex Session 独立。
- 实际 2 次 Controller 模型调用，无额外付费重试。Claude 报告普通输入 4、输出 215、缓存读 27244、缓存写 29156；Codex 报告输入 113163、输出 547，其中缓存输入 78848。协议含系统上下文，微型业务提示不代表总输入很少；不推算价格。
- Codex Shell 曾因本机 `helper_unknown_error: setup refresh had errors` 启动失败；同一回合使用原生 Node MCP 完成只读核对，保留全部审计。
- 脚本初次误用 `decisionSession.id`，应为 `sessionId`；修正后只验证已持久化证据，没有再次调用模型。见 `real-result.json`、`verify-real-decision.mjs`。

真实验证证明暂停后更换决策者、交接读取和新规划回合。未声称完整真实开发/审查闭环、所有模型排列或跨执行者真实开发验收通过。本次源码尚无独立 Controller 正式交付审批。

## 预览与交付

用户授权且全局策略 idle 时启动独立可见 Electron 预览，独立 preview-data，仅演示 fixture，不连接 DEV 或真实 Run。截图 `decision-running.png`、`decision-switch.png`、`execution-switch.png`、`paused.png`。截图不是正式验收。

等待用户看效果并明确批准后，才进入提交/整合审批流程。

## 后续：紧凑计时与输入框宽度

按用户追加要求，顶栏增加脑形/代码图标配时长；悬停与无障碍标签分别解释决策、执行。时间由 Controller created/transition 审计重建，规划/审查归决策，派单/执行/提案应用归执行，暂停/失败/停止及独立验证不计入。会话多 Run 累加；模型切换不清零，重新打开可恢复。原进程不再活跃时冻结到最后记录；连接断开时 UI 冻结到最后成功刷新。

取消 codex.css 中输入框 900px 居中限制，聊天区域两侧留 24px，窄屏 12px；不改变消息阅读宽度。1600px 实际 Electron 截图 `timing-wide.png` 验证输入框宽度至少为聊天列宽度减 52px。

新增计时单元测试覆盖等待/独立验证排除、跨切换与跨 Run 累加、暂停冻结、活跃尾段及超过一小时的格式。UI 隔离检查更新为 21 项通过。check/build 通过；首次桌面测试因 build.mjs 显式入口漏列新增模块报 MODULE_NOT_FOUND，补齐并构建后完整桌面回归 104/104 通过，耗时 105.7 秒。git diff --check 通过。本轮无新增付费模型调用，独立可见预览已更新，DEV 未修改或重启，未提交、合并、推送。
