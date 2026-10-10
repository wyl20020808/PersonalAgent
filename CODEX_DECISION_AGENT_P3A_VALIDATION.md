# Codex Decision Agent P3A 验收报告

日期：2026-10-10。结论：技术实现及本地流程验证完成，等待人工真实模型验收与后续合并授权。

## 开发边界与提交

- 发起方式：独立 Codex Desktop，没有通过 PersonalAgent MAIN/DEV 内部 Run 开发自身。
- Git 基线：操作前核查的最新本地 `dev`，`ddb098aedff7a40dc4a161f2e8eda8722bf32598`。
- 分支：`feature/codex-decision-agent-p3a`。
- Worktree：`D:/PersonalAgent-worktrees/tasks/codex-decision-agent-p3a`。
- 最终 commit SHA：见提交后生成的 [最终提交记录](.validation/p3a-final-commit.json) 的 `commit` 字段，并在最终交付回复给出；可用 `git rev-parse feature/codex-decision-agent-p3a` 复核。报告纳入该提交，采用外部记录避免提交 SHA 自引用。
- 用户明确授权独立开发和本地提交，优先于仓库默认禁止 Agent 自行提交的约定；没有修改治理规则或取消产品 Delivery 审批。
- 没有合并、push、修改 MAIN/运行中的 DEV、其他任务分支、共享 Codex 配置、工作/空闲共享状态或全局 Hooks。MAIN 的既存修改和 DEV 的历史数据保留。

## 已实现能力

新增 `CodexDecisionAgent`，进入现有 Decision Adapter 路由。Plan、Review 和 Discussion 使用现有 Plan/Review/opinion Schema；Controller 最终 Plan 校验、讨论完成检查、Review Guard 和人工交付审批保持生效。

支持单 Codex 决策者＋Codex 执行者、Claude Code＋Codex、OpenCode＋Codex、两个独立 Codex 决策实例＋唯一 Codex 执行者。双决策继续顺序执行独立初稿、0/1 轮讨论和主决策者汇总，主决策者可为 A 或 B。OpenCode 沿用原 V1 兼容检查；原生接口缺少结构化能力时仍明确不可用，不降级为普通文本或假成功。

决策 Session 使用 `decisionSession` 和 P2A participant Session，执行 Session 继续使用 `codexThreadId`。Thread 启动事件立即持久化，失败后可按现有 Controller 人工恢复流程续接；拒绝决策/执行共享 Thread、双决策共享 Session、错误 Run/Task/workspace/backend/model 归属。无完成事件、无结构化输出、错误 Schema 或无可验证 Thread/调用归属时失败；不会自动替换后端或模型。

调用复用 Project Context manifest、reads、usage、活动与哈希审计。记录 Run、任务、阶段、实例 A/B、讨论阶段、Thread、调用计数、配置模型和 SDK 原生用量。历史 `claudeCalls` 字段继续兼容原总决策调用计数，Codex 使用独立调用事件；实际模型与内部请求总数保持未知。

UI 仅开放 Codex 决策选择、模型 ID 输入、双决策/主决策选择及正确消息身份。沿用官方 OpenAI 图标，两个实例显示 Codex A/B；决策模型不会显示成执行模型，两个池的设置面板分开。原双池、文件夹/工作方式、发送按钮、消息布局和唯一执行者保留，没有新增 Dashboard。

## 使用的正式 SDK 能力

正式安装及锁定版本：`@openai/codex-sdk@0.161.0`，没有升级依赖。

- `startThread`、`resumeThread`：独立决策 Thread 和原 Session 续接。
- `runStreamed(prompt, { outputSchema })`：原生结构化结果及流式事件；再次执行本地 Schema 校验。
- `ThreadOptions.model`、`workingDirectory`、`sandboxMode: 'read-only'`、`approvalPolicy: 'never'`：模型、真实项目目录与决策阶段读取权限。决策禁止实现、修改配置和交付；执行者原有权限保留。
- `networkAccessEnabled: false`、`webSearchMode: 'disabled'`：本地决策读取配置。
- `thread.started`、`command_execution`、公开 Agent 输出、`turn.completed.usage`、失败事件：归属、工具与用量审计；不展示 reasoning 内容。
- 独立 SDK worker 复用 `runProcess` 的超时、取消和受控子进程树关闭；返回结果与每个流事件携带 Run/workspace/阶段/实例归属。

SDK 没有模型发现接口，界面不硬编码模型目录；配置模型由真实服务验证。SDK 没有原生 Read、实际模型或完整内部请求数事件。Context 传入和原生命令可追溯，但不把路径或命令推断成文件全文已读，更不宣称已验证模型理解质量。

## 必要验证结果

所有模型输出来自 SDK 注入、CLI 协议夹具或本机 HTTP 模拟服务。付费模型调用为 0；没有控制鼠标、键盘、浏览器或前台窗口。

1. Controller `rtk proxy npm run build`：通过。
2. 决策/讨论/能力/审计组合：66/66 通过。命令为 `rtk proxy node --test --test-reporter=spec dist/test/codex-decision-agent.test.js dist/test/decision-agent.test.js dist/test/decision-discussion.test.js dist/test/agent-capabilities.test.js dist/test/call-observation.test.js`。
3. 最终 Codex 专项：20/20 通过。覆盖单决策 Plan/Review、三类双决策组合、0/1 轮和双方主决策、独立 Thread、失败前禁止 Execute、错误归属/结构化输出、超时/中断/人工恢复、Context 与用量、模型持久化及 Review Guard。
4. 正式安装 SDK 的本地 Node 替身：真实经过 SDK 的参数序列化、临时 Schema 文件、JSONL 解析和续接；本地挂起子进程验证超时、中断、关闭及恢复。没有启动模型 CLI 或调用远端服务。
5. Desktop `rtk proxy npm run check`、`rtk proxy npm run build`：通过。构建保留 lucide-react 的 `use client` 非致命警告。
6. Desktop `rtk proxy npm test`：85/85 通过，包括 Codex 单/双决策会话与模型恢复、Mock 路由、历史身份和消息角色。未启动 Electron 或浏览器。
7. `rtk proxy node validate-codex-decision-static.mjs`：React 静态服务端渲染通过，验证原双池、Codex 选择/模型输入/官方图标、双 Codex B 配置和主决策者 B。该检查不等于真实桌面交互或像素验收。
8. `rtk proxy git diff --check`：通过。

日志保留在本 Worktree 的 `.validation/p3a-controller-final.log`、`p3a-codex-final.log`、`p3a-desktop-final.log`；静态 UI 证据为 `desktop/.validation/p3a-static/result.json`。

额外检查现有 `native-agent.test.js` 为 16/19 通过。原始 dev 源码在独立导出目录编译、使用相同工作目录再次运行，也是同样 3 项失败、同样断言结果，确认不是 P3A 引入。没有声称全库回归全绿，也没有删除或跳过失败断言。

## 待人工验收与问题记录

真实账户模型可用性、真实 Codex Plan/Review/Discussion 成功、项目内容读取与质量、真实服务失联及进程重启后的原生 Thread 恢复尚未调用模型验证。OpenCode 组合还依赖实际安装版本满足原 V1 结构化契约。本次验证技术接口和流程，没有开展模型效果或性价比实验，也不冒充 Controller 独立验收。

- 更新 [历史 Snapshot 夹具问题](problems/2026-10-10-snapshot-era-regression-fixtures.md)：原 13 项已解决，另有 3 项 Native 历史失败待处理；影响历史全量回归结论。
- 新增 [Codex SDK 观测边界](problems/2026-10-10-codex-decision-sdk-observation-boundary.md)：状态为暂缓扩展；影响逐文件读取、实际模型和内部请求数的完整审计，当前保留未知值。

提交后停止，等待人工验收；本报告不授予 dev/main 合并或发布权限。
