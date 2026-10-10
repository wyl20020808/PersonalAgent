# PersonalAgent P2A 双决策者协作验证报告

日期：2026-10-10。状态：独立 feature 开发与本地验证完成，等待用户人工验收及合并授权。真实远端协作尚未验收。

## 开发来源与授权边界

- 开发方式：独立 Codex Desktop 会话，没有通过 PersonalAgent 内部真实 Agent Run 开发，没有委托其他付费 Agent。
- Git 基线：创建时最新本地 `dev`，`4ac263eadb280b4f52ebafea0b23ff89e9d15e87`；该提交已正式合入 P1。
- 分支：`feature/multi-decision-discussion-p2a`。
- Worktree：`D:\PersonalAgent-worktrees\tasks\multi-decision-discussion-p2a`。
- 开发期间 dev 推进到 `c3b37c63569d7e24a79129eaf85ba45487a44f8d`，只增加 P1 集成说明和已有 CDP 问题记录，业务代码没有变化。本次没有改动、切换或合并运行中的 DEV/MAIN。
- 用户明确授权本次独立开发及最终 feature 提交；本次不合入 dev/main，不 push，不发布。最终提交 SHA 由交付回复及本分支 `git rev-parse HEAD` 给出，本报告随该提交保存。
- 所有 Run 均为本次专用本地夹具；没有真实模型 Prompt，没有对用户项目进行真实 Agent 开发。Controller 的真实远端独立验收及人工 Delivery 审批没有被本次自主测试代替。

## 实际实现

单决策者仍是默认模式，保留原 Claude Code 决策、Codex SDK 执行及原模型默认行为。双决策者模式固定两个实例 A/B，支持选择任意一位为主决策者，讨论轮数只能为 0 或 1。参与者、后端、模型、主决策者及轮数持久化绑定到 Run；后续会话设置变化不会改写旧 Run。

每个实例拥有独立 Session、配置及调用计数。Claude Code 使用各自的 `--session-id`，后续调用使用对应 `--resume`；显式模型通过 `--model` 传入。OpenCode 沿用 V1 Adapter，分别绑定原生 Session、远端归属标题及实例运行目录，继续执行模型能力发现、目录和返回 Session 校验。

决策阶段调用、公开输出、失败及用量审计带有 participantId 和阶段归属。Project Context 的每次调用保留独立 manifest、usage、reads 收据及真实注入内容。初稿不携带另一位的方案；一轮意见都只看到固定的两份初稿，B 不会因为顺序调用而额外获得 A 的本轮意见。

主决策者的输出仍是一份标准 Plan。Controller 验证协作步骤确实完成、最终 Plan 与主决策者输出一致，并继续执行原有 Schema、任务 ID、依赖、验收阶段及 Project Context 模块约束。通过校验以前不得开始 Execute。执行后端没有增加新选择，仍是唯一的 Codex SDK。

Review 保持主决策者单人策略，继续原有独立验收、Review Guard、返工及人工 Delivery 审批。没有实施多 Agent Review。

## 支持的组合和模型边界

| 决策者 A/B | 执行者 | 本次证据 |
| --- | --- | --- |
| 单 Claude Code 或单 OpenCode | Codex SDK | 旧适配器与流程定向回归 |
| Claude Code + Claude Code | Codex SDK | 两个独立 CLI 协议 Session 的注入夹具，以及正式 Mock Controller/Electron |
| Claude Code + OpenCode，主决策者可任选 | Codex SDK | 混合后端本地夹具；OpenCode 原生 SDK 使用本地 HTTP 假服务 |
| OpenCode + OpenCode | Codex SDK | 两个原生 Session、模型和事件归属的本地 HTTP 假服务 |

Claude Code Provider 沿用本机已经配置的提供方，不新增任意 Provider 切换。各实例可使用默认模型、CLI 模型别名或完整模型 ID；本机 `claude --help` 确认支持 `--model`、`--session-id` 和 `--resume`，没有发送模型请求。具体账号能否使用所填模型仍由真实 CLI 返回结果决定，不自动换模型。

OpenCode Provider/Model 继续动态发现，要求原生工具和结构化输出能力均被确认，启动时再次检查。能力不足、未知、失效或发现失败均阻断，不回退到 Claude Code。Desktop IPC 继续禁止注入自定义可执行文件。OpenCode 保留实验性标识；本次没有验证其远端模型真实推理。

Codex 决策、Claude Code 执行、OpenCode 执行及第三个决策者均不能通过配置或 IPC 错误启动。

## 流程与调用次数

| 模式 | 顺序 | 正常规划调用次数 |
| --- | --- | --- |
| 0 轮 | A 独立初稿、B 独立初稿、主决策者汇总 | 3 |
| 1 轮 | A 独立初稿、B 独立初稿、A 意见、B 意见、主决策者汇总 | 5 |

调用按顺序进行，沿用 Controller 的 Run 锁和项目写入锁。每步有独立超时，整个初始周期也有有限总时长。主决策者正常承担两次规划调用，另一位承担一次；一轮讨论时分别是三次和两次。每次 Review、显式重试及原流程 Replan 另计。两任务的 Electron Mock 夹具因此分别有 5 次（0 轮）或 7 次（1 轮）本地模拟决策调用；这些不是付费服务调用数。

失败时保留已完成步骤及各自 Session，显示具体实例、阶段和错误。结构化输出不合格、服务不可用、超时和中断不会得到最终计划，也不会提前启动执行者。安全及 Session 归属错误保留终止性保护，不被转换为普通可恢复错误。

恢复必须经过现有明确用户决策入口。成功初稿不会因为恢复而重新调用；只重试未完成步骤。若进程在持久化 running 步骤期间丢失，重启首先暂停，不能静默重试。没有实现自动降级为单决策者或自动更换模型的路径。

首个协作周期之后，因补充需求产生的既有 Replan 使用主决策者原 Session，审计及聊天明确标记“主决策者 Replan · 非双决策讨论”，不会伪装成新增讨论轮。Run 仍保留原两位参与者身份。

## UI 验证

新会话仍使用 P1 的左右双池；仅在原决策池内增加模式、B 配置、主决策者和轮数选择。输入框、文件夹按钮、工作方式选择与发送按钮位置保持原布局。执行池仍只选中 Codex，未支持的角色组合禁用。

正式聊天页保持原布局，没有双池、讨论 Dashboard 或新侧栏。用户消息居中，所有 Agent 消息在右侧；Claude Code A/B 等实例分别显示品牌图标、名称与角色。初步计划、讨论意见、主决策者总结、Controller 校验通过的最终计划及系统状态分别呈现。消息按持久化审计顺序投影，相同品牌的两个实例不会合并成一个角色的事件组。

实际 Electron 验证覆盖 8 组检查：默认单决策配置、不兼容角色禁用、旧单决策正式 Mock、长文本/Markdown/代码块、宽窄窗口、两实例一轮讨论、0 轮讨论、混合品牌 Mock、模型发现失败阻断、历史回放及原审查/交付入口。截图经过实际查看。最终没有 Renderer 错误、横向溢出或用户文件内容变化。

## 测试与证据

以下均为当前开发会话自主验证，真实远端调用为 0：

| 命令/范围 | 结果 |
| --- | --- |
| `rtk proxy npm run build`，核心 TypeScript 与 Schema 导出 | 通过 |
| Desktop `rtk proxy npm run check` | 通过 |
| Desktop `rtk proxy npm run build` | 通过；仅既有 lucide-react `use client` 打包提示 |
| Controller、Decision Agent、原生执行、恢复、能力表及 P2A 六个受影响测试文件 | 91/91 通过；功能补强前检查点 |
| Desktop 四个现有测试文件及新增 P2A 用例 | 83/83 通过 |
| 最终核心 P2A、Decision Agent、能力表、调用观测四个文件 | 46/46 通过，包含 16 项 P2A 用例 |
| 最终 Desktop Sessions、Thread 两个文件 | 55/55 通过 |
| `rtk proxy node desktop/validate-decision-discussion-electron.mjs` | 8/8 检查通过；实际 Electron 与正式 Controller，仅本地 Mock |
| `rtk proxy git diff --check` | 通过 |

最终核心定向用例验证：0/1 轮、主决策者 A/B、两份独立初稿及固定方案交换、模型参数与独立 Session、实例调用次数/收据、Controller 校验、适配器绕过讨论时禁止执行、Schema 错误、重复任务 ID、B 失败、单步超时、中断与重启、明确续接、既有 Replan、Review Guard 否决、旧单决策历史、真实 Project Context 注入、混合后端和双 OpenCode 的本地 V1 SDK 协议。没有执行与 P2A 无关的大规模游戏回归。

本地日志位于本 Worktree `.validation/`：`p2a-core-build.log`、`p2a-core-focused.log`、`p2a-desktop-build.log`、`p2a-desktop-tests.log`、`p2a-desktop-focused.log`、`p2a-electron-final.log`。

最终 Electron 证据：`D:\PersonalAgent-data\multi-decision-discussion-p2a\electron-8f6223cb\result.json`，同目录保留 8 张截图、4 个 Mock 项目及隔离运行数据。首次测试脚本曾过早读取规划中的 Run；改为逐次读取持久化终态后完成最终检查，失败记录未删除，也未将首次失败称为通过。

## Snapshot、问题记录及 P2B 限制

核查确认，当前 DEV 仍继承大型项目指纹/去重 Snapshot 实现。独立 `fix/remove-mandatory-project-snapshot-v1` 分支已包含移除新 Run 强制快照的改动，但尚未合入本次基线。本次没有复制该修复，没有新增 Snapshot/备份算法或要求；决策调用复用既有 Project Context 接口，不把协作步骤绑定到全项目 Snapshot 数据。继承基线的 Controller/Context 扫描开销仍存在，不能宣称本分支已经移除了全项目扫描。

两项开发在 `controller.ts`、`store.ts` 和 `context-navigation.ts` 有少量交叉。后续合并须保留独立 Snapshot 修复的 observation 路径与 snapshotPolicy，同时保留 P2A 的实例身份和协作完成校验；不能用本次基线实现覆盖该修复。本次对 `context-navigation.ts` 只增加实例归属字段，没有改变其工作区观察实现。

本次检查了 `problems/README.md` 及既有相关记录，没有新增或重要更新问题记录。既有 OpenCode V1 发现间歇失败仍为待处理，不阻碍本地夹具验收，真实使用可能被其明确的不可用状态阻断；本次不声称解决。缺少新 Worktree Electron 二进制的历史问题，通过只读复用已安装依赖和 Electron 完成验证，没有改动 DEV/MAIN 安装。

P2B 尚需：用户明确授权后的真实双 Agent Plan/Execute/Review DEV 验收、OpenCode 远端模型验证，以及后续独立设计的多 Agent Review。第三人、第二轮讨论、协作式 Replan、运行中修改参与者/模型和自动降级均未实现。默认模型空值保留本机默认行为；本次绑定配置及记录实际观测模型，不保证外部账号配置被修改后其默认模型服务行为不变。

本次结束后停止开发，等待用户人工验收及合并授权。
