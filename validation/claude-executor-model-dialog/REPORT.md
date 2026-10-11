# Claude 执行者与模型设置弹窗交付记录

日期：2026-10-11。任务 ID：claude-executor-model-dialog-20261011。

用户口述的 Cloud 按截图中的 Claude Code 实施。开发执行方为外部 Codex 会话；本任务使用治理规则 V2 和 2026-10-11 默认 TEST 基线规则。基线为 `test` 的明确提交 `cfc8271494bfc45061f0f22b576f417c36333ea2`，任务分支为 `feature/claude-executor-model-dialog-20261011`，独立 Worktree 为 `D:/PersonalAgent-worktrees/tasks/claude-executor-model-dialog-20261011`。未提交、合并、推送或替换运行中的 MAIN/DEV/TEST 构建。

## 最终行为

- Claude Code 可以作为执行者，使用真实 CLI 的原生工具和结构化结果；执行 Session 独立于规划、审查和双决策参与者 Session。保留工作策略 Hook、调用记录、Controller 验收和交付审批。
- Claude Code、OpenCode、Codex 的决策和执行角色均可选择模型。Codex 执行模型贯穿配置、IPC、WorkerRequest、新建和续接 SDK Thread。
- 模型设置统一为居中弹窗，不再把长配置区域插入角色池。配置在确认时生效；取消、Esc、点击遮罩不修改选择。支持焦点限制、关闭后恢复焦点、390px 窄屏。
- Codex 通过已安装 CLI 的只读 `model/list` 查询目录，当前本机返回 7 个模型；列表查询不创建项目 Session，也不发起模型回合。失败时仍可选默认模型或自定义 ID。
- Claude 提供 Sonnet / Opus / Haiku CLI 别名和完整自定义模型 ID，默认沿用本机配置；这些别名不表示所有账户均获准访问。OpenCode 保留动态 Provider / Model、原生工具和结构化输出能力校验。
- 会话重启、项目重新打开和暂停后的模型切换保留选择。切换执行模型时移除旧执行 Session，保留决策 Session、已有文件和用量。
- Claude 的执行消息、工具和结果正确标记为执行者；不会因决策后端为 Codex 而误归类。

## 验证结果

| 验证 | 结果 | 证据范围 |
|---|---|---|
| Controller TypeScript / schema build | PASS | `rtk npm run build` |
| Desktop TypeScript | PASS | `rtk npm run check` |
| Desktop production build | PASS | `rtk npm run build`；存在既有包体积及 use client 警告 |
| 聚焦 Controller 回归 | 84/84 PASS | `controller-tests.log`；不等同全部仓库测试 |
| 最终原生执行回归 | 24/24 PASS | `native-final-tests.log`；包含 Claude 执行和既有 native-agent 测试 |
| Desktop 注册的完整测试命令 | 116/116 PASS | `desktop-tests-final.log`；新增模型持久化、恢复和消息角色测试 |
| 隐藏 offscreen Electron 组件交互 | 9/9 PASS | `ui/result.json`；Provider 和模型列表为 UI 夹具，非真实远端服务 |
| 本机 Codex 模型列表 | 7 个模型 | `native-catalog.json`，真实 CLI 只读查询 |
| 真实 Claude Sonnet 执行生命周期 | PASS | `real-d54ce562/result.json` |
| Sonnet 决策 / Haiku 执行真实生命周期 | PASS | `real-3cf3896f/result.json` |

真实验收调用正式 `createRun`、`drive`、`RealAgents`，仅操作本任务隔离的 marker 验收项目。两次 Run 均完成 Plan、Execute、Controller 独立文件测试和 Review；公开工具记录显示执行者真实调用 Write，结果文件由可信测试独立核对。第二次 Run 的决策和执行实际模型不同，Session 也不同。该证据证明新 Claude 执行适配及独立模型配置可运行，不代表本次开发成果已通过独立代码审查或获正式交付批准。

两次真实 Run：`0c88fff7-fe71-472f-9905-2fb7faec0f3f`、`7a641e50-1072-4202-9dff-d47ee932c677`。两次各有 3 个模型调用，执行者退出码为 0，独立测试通过；Review 续接决策 Session。

初期回归中的旧断言把 Claude 执行配置视为非法，已更新为拒绝未知后端，并保留多执行者、模型格式及 executable 注入拒绝检查。早期桌面第一次运行有 4 个失败，重跑剩 1 个旧断言失败；更新后最终注册测试命令 116/116 通过。Controller 84/84 日志的 Node 测试成功，但最初 PowerShell 外层退出命令错误；最终 24/24 命令已使用正确退出码并返回 0。

## 交付状态与限制

初次开发完成时，成果为未提交 Diff 和新增源码、测试、报告。2026-10-11 用户随后明确修订治理规则为 V2.1，允许符合条件的任务自主提交并合并本地 TEST。本任务已全文读取并接入 `D:/PersonalAgent/docs/PERSONALAGENT_DEVELOPMENT_GOVERNANCE_V1.md` V2.1，按持续授权执行集成；不再沿用旧的逐次提交、合并审批要求。集成前 TEST 仍为基线提交，无源码修改；本地 Serena 元数据保留并通过 Git 本地 exclude 排除。集成锁位于共享 Git common directory 的 `personalagent-test-integration.lock`，由本任务独占取得。Git 合并及检查结果另留集成记录；当前运行的软件界面尚未更新，DEV/MAIN 和远程仓库不在本次集成范围内。

未在运行中的 TEST/DEV 窗口做可见 GUI 验收；未新增 OpenCode 真实远端或 Codex 真实执行生命周期验收。OpenCode 的能力校验和原生执行协议回归通过；Codex 模型目录真实查询及 SDK 模型选项传递通过。不得将组件 UI 夹具、聚焦回归或隔离 marker 项目扩大表述为全部后端、完整项目任务或已发布版本验收。

`.serena/`、依赖 Junction、构建目录、Electron 数据、真实 Run runtime 和原始会话日志只保留本地，不纳入交付。审阅截图为隐藏 Electron 中实际渲染的组件截图，模型列表使用 UI 夹具。
