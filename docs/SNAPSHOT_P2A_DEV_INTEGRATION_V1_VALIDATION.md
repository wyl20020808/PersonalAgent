# Snapshot 移除与 P2A 正式 DEV 整合验证

日期：2026-10-10。独立 Codex Desktop 执行，无 PersonalAgent 内部付费开发 Run、无子 Agent。用户明确批准完整功能进入最新 DEV及必要冲突和夹具适配；不 push、不发布 MAIN。

## 来源与安全核对

- MAIN 初始 HEAD：`aff80240342176ec196fedb2028905f489afced9`。原有七个 schemas 修改及未跟踪成果保留。
- DEV 初始 HEAD：`c3b37c63569d7e24a79129eaf85ba45487a44f8d`，已含验收 P1；执行前实际重新核对。
- Snapshot 完整来源：`363f8da11e3ce5e90924e3f8b659b07f62eb88c2`，包含实现 `5cd1a26` 和收尾记录。
- P2A 完整来源：`b3fe5155fb97f9f8353a3b3a633533081ffc1217`；DEV 已含依赖，DEV 到 P2A 只有该功能提交，没有重复合入依赖。
- 两功能原先均未成为 DEV 祖先；A/B Worktree 干净。P1 相关 Worktree 的未跟踪 runtime-env 保留。
- 整合分支：`integration/personalagent-snapshot-p2a-v1`；目录：`D:/PersonalAgent-worktrees/tasks/personalagent-snapshot-p2a-v1`。
- 初检没有 PersonalAgent Electron/Controller 进程或 Run 锁；DEV 只有一个已失败 Run、两个原 Session，没有自动重跑。
- DEV 原有未跟踪 24 个实际文件、历史项目数据 8 个文件记录摘要用于前后核验；`D:/PersonalAgent-data/snapshot-p2a-integration-v1/before.json`。这是只读保留证据，不是项目开发 Snapshot。

## 合并与冲突

先 `git merge --no-ff --no-commit fix/remove-mandatory-project-snapshot-v1`，自动处理 P1 GroupWorkspace/thread 交叉，保留完整历史；再合并 P2A。实际内容冲突是桌面 `service.ts`、`thread.ts`、`types.ts`，逐段同时保留 `discussion` 和 `evidence.verificationScope`，Controller/参与者身份与无快照“文件变更未自动验证”提示，没有整文件 ours/theirs。

`controller.ts`、`store.ts`、`context-navigation.ts` 自动合并成功。核对新 Run 的 `snapshotPolicy: none`、独立身份/Session/配置、0/1 轮顺序调度、固定初稿交换、主决策汇总与最终 Plan 校验。`captureBaseline` 无快照立即返回，fsck 仅在旧策略分支，P2A 没有全项目捕获新入口。历史 State/Snapshot 读取保留。

没有额外 UI 重设计；单决策默认、Codex SDK 唯一执行者、Review Guard、Project Context、审计及人工 Delivery 保留。本次额外修改用于冲突组合、测试前提与验证记录。

## 实际验证

| 项目 | 结果 |
| --- | --- |
| Controller `rtk proxy npm run build` | 通过 |
| Desktop `rtk proxy npm run check` 与 `build` | 通过；只有现有 lucide-react use client 提示 |
| 核心组合 Node 测试 | 65/65，0 失败/跳过 |
| Desktop 四个现有测试文件 | 83/83，0 失败/跳过 |
| 实际 Electron | 8 组通过，Renderer errors 为空 |
| Git diff 空白检查 | 通过 |

核心命令：`rtk proxy node --test dist/test/no-project-snapshot.test.js dist/test/decision-discussion.test.js dist/test/decision-agent.test.js dist/test/opencode-compatibility.test.js dist/test/call-observation.test.js dist/test/context-regression-review.test.js dist/test/atomic-replace.test.js dist/test/process-stream.test.js`。Desktop：`rtk proxy node --test out/service.test.js out/thread.test.js out/unified.test.js out/sessions.test.js`。日志：`D:/PersonalAgent-data/snapshot-p2a-integration-v1/core-final.log`、`desktop-final.log`。

覆盖大型 Git/非 Git Direct、20,001 文件、512 MiB 资源、无内容基线/备份、旧数据、持久 Native 结果恢复、Project Context 定点检查、人工验收及 Delivery；双 Claude Code 独立 CLI 协议 Session、模型和调用绑定、0/1 轮及 A/B 主决策者、固定交换、最终 Plan、未完成讨论拒绝 Execute、失败/超时/中断和显式恢复；混合 Claude Code + OpenCode、双 OpenCode 原 SDK 对接本地 HTTP。所有 RealAgents 使用注入协议，绝无真实模型调用。

Electron 脚本：`desktop/validate-decision-discussion-electron.mjs`；证据：`D:/PersonalAgent-data/multi-decision-discussion-p2a/electron-f7abd572/result.json`。实际检查新会话中央双池、品牌、左下文件夹/方式、右下发送、双配置仅在决策池；正式聊天无双池、用户居中、Agent 靠右、A/B 角色阶段分开。覆盖单决策、一轮、零轮、混合品牌、发现失败不降级、长文本/Markdown、窄窗口、历史回放及审查/交付入口。已实际查看配置与讨论截图。

首次 Electron 在零轮完成后过早读取尚未载入的消息列表，失败证据保留在 `electron-47277f20`；夹具等待 Agent DOM 后全程通过，没有修改产品渲染。旧 13 项失败逐项适配，所有保护断言保留；详见问题文档。长路径 Git isolated 限制只缩短测试目录，保留失败 Run，未扩展生产修复。

## 范围、限制与正式收尾

这是本地确定性验证通过，不是远端双 Agent 协作通过，也不是内部 Controller 独立开发验收。真实 A/B 推理、账号模型可用性、真实服务 Session 恢复、混合后端远端协议及真实 Codex SDK 执行组合仍未验收。付费调用 0。

无完整变化清单、精确任务/轮次 Diff、全项目备份或自动恢复；非 Git/忽略/未跟踪/二进制内容未完整自动验证。clean Git isolated 可克隆；非 Git/dirty Git 自动复制和隔离建档不可用；isolated 不自动 Apply，Direct Delivery 人工审批只确认已有文件。Project Context 限定文档和 checked_files。较深 Windows Git Runtime 可能克隆失败。

正式更新前必须再次检查 DEV 前进和活跃写入，只用 `git merge --ff-only`。正式 DEV 构建后调用原 `Start-DEV.ps1`；最终 SHA、窗口及 MAIN/历史数据保留证据完成后补记。完成后停止，等待用户在 DEV 启动真实任务。
