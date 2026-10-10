# 决策返工恢复修复验证记录

日期：2026-10-10（Asia/Shanghai）。

## 交付状态

修复已在独立工作区完成，等待正式审查、交付审批和 dev 整合。当前运行中的 PersonalAgent 与 OpenWorld Run 未被替换、迁移或恢复；没有提交、合并、推送或发布。

- 发起环境：Codex Desktop，当前聊天原工作区为 main `D:\PersonalAgent`；故障来自 PersonalAgent dev。
- 开发基线：dev `3c32ebb34534da3c566c64a42621a75717cc00c1`。
- 任务分支：`fix/decision-rework-resume-v1`。
- 工作区：`D:\PersonalAgent-worktrees\tasks\decision-rework-resume-v1`。
- 本修复没有创建真实付费 Agent Run；以下为开发会话自主测试，不等同于 Controller 对本修复的正式独立交付验收或真实游戏任务验收。

## 用户可见变化

“提出修改并返工”现在会将明确返工意图传到 Controller，重新执行当前任务，并按已有规则计入一次返工和一次执行。保留 Run ID、任务进度、Agent 会话、调用计数与配置上限。

运行详情的“恢复 / 决策”弹窗增加恢复方式选择：“继续原流程 / 重新验收”与“按修改意见返工当前任务”。缺少独立测试时说明两个入口的区别；人工验收仍须单独绑定当前摘要。不能把继续修改、普通恢复或视觉确认当成自动测试通过或成果交付批准。

规划节点、提案应用中断、活动 Run、缺少当前任务或缺少明确意见时不能直接返工；仍须先处理相应原流程。执行轮数与每任务返工限制继续生效。

## 改动范围与复核绑定

生产代码：`src/controller.ts`、`src/cli.ts`、`desktop/src/service.ts`、`desktop/src/App.tsx`、`desktop/src/GroupWorkspace.tsx`。

测试：`test/recovery.test.ts`、`desktop/src/thread.test.ts`。新增返工恢复、限额与非法节点测试；同时将既有审查回执复用测试明确设为历史快照 Run，以匹配其测试目标。生产代码的历史回执逻辑没有修改。

问题记录：`problems/2026-10-10-decision-rework-resume.md`、`problems/2026-10-10-controller-snapshot-test-fixtures.md`，以及本验证文档。

上述七个代码/测试文件按相对路径排序，使用 `路径 UTF-8 + NUL + 原始文件字节 + NUL` 计算的 SHA-256：

`4c118304bca1f108cac62fd0d739b96674e373d45d8e7869bd7610ebde78d5e7`

代码补丁：`.validation/decision-rework-resume.patch`，SHA-256：

`b8621ffbbb18a10842e85de897cc5412b416c0f3d9ed882c876a1b660758ee80`

## 实际验证

| 验证 | 结果 |
| --- | --- |
| `rtk proxy npm run build`（Controller） | 通过 |
| `rtk proxy npm run build`（desktop） | 通过；依赖 lucide-react 的既有 use-client 打包提示仍存在 |
| `rtk proxy npm run check`（desktop） | 通过 |
| `rtk proxy node --test out/thread.test.js`（desktop） | 21 项通过；包括真实本地子进程串联的桌面服务、CLI、Controller 返工测试 |
| `rtk proxy node --test out/service.test.js out/unified.test.js out/sessions.test.js`（desktop） | 67 项通过，日志 `.validation/desktop-regression.log` |
| `rtk proxy node --test --test-concurrency=2 dist/test/controller.test.js dist/test/recovery.test.js dist/test/no-project-snapshot.test.js` | 59 项中 56 通过、3 失败，日志 `.validation/controller-regression.log`；恢复套件 25 项全部通过 |
| 基线 Controller 运行新增的两项缺少测试返工用例 | 两项都失败，表现为执行次数仍为 1，而预期为 2；日志 `.validation/baseline-regression.log` |
| 修复后单独运行同两项用例 | 两项通过，日志 `.validation/rework-regression.log` |
| 三项扩大回归失败在原 dev Controller 上复查 | 同样全部失败，日志 `.validation/baseline-controller.log` |
| `rtk proxy git diff --check` | 通过 |

端到端测试使用新建本地 Mock 项目，未调用 Claude、Codex 或 OpenCode 的真实模型服务。原生适配器相关恢复验证使用注入夹具，不冒充真实模型输出。

## 已知限制

三项原有失败为 `no change cannot pass`、`later task cannot pass using previous task diff`、`test mutating untracked content invalidates evidence`。它们仍要求新 Run 提供已取消的全项目快照保证，基线同样失败。本次未修改这三个测试或现有快照政策；不能宣称完整 Controller 回归通过。已登记独立问题。

未进行可见 GUI 操作或 Electron 实际界面验收。界面代码已构建及类型检查，但视觉验收和运行版本实用验收仍为 pending。本机策略检查为 idle；仍遵守用户要求的默认 CLI/API 操作方式。

原 OpenWorld 的 `measurements.md` 尾部空行和未配置独立测试属于原任务当前证据。本修复不直接修改游戏项目文件，也不伪造人工验收或测试通过。正式更新 dev 后，应在原 Run 选择“返工”，由其正式执行 Agent 按用户意见修复并重新验收。

## 后续交付步骤

按 `AGENT_WORK_RULES.md` 第 5 条及开发治理规则进行正式审查和交付审批。获准整合前重新检查 dev HEAD、用户修改、活动任务和进程；若 dev 基线改变，复核整合差异并补测。仅在安全节点更新 dev 并重启，再检查已有 Run/Session 的恢复；不发布 main、不推送远程、不自动验收游戏成果。

## 同一修复任务的后续范围

用户随后要求修复长任务通信并取消运行时长限制。当前候选在原返工恢复修复上增加了不限时通信、持久化限时配置恢复及相应测试。本文件的七文件哈希只适用于前次快照，当前完整候选以 LONG_TASK_COMMUNICATION_VALIDATION.md 及 .validation/long-task-candidate.json 为准。仍未提交、合并或替换运行版本。
