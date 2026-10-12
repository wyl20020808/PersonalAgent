# 模型上下文窗口与聊天圆环验证

日期：2026-10-12。执行方：外部 Codex 开发会话；没有冒充 PersonalAgent CC/Codex/Controller Run 或独立验收。

## 基线与范围

- 基线：本地 TEST `aa52a965e0855dcda40566228b8286cd3732e4a4`。
- 任务分支：`feature/model-context-window-20261012`。
- 工作区：`D:/PersonalAgent-worktrees/tasks/model-context-window-20261012`。
- 增加模型窗口观测、原生会话压缩调度及聊天右上角决策者/执行者圆环。开发聊天与只读讨论都覆盖，多决策分别保留数据，主圆环采用主决策者。
- 没有更换正在运行的实例、修改全局模型设置、迁移历史会话、更新 DEV/MAIN 或远程推送。

## 数据与操作语义

窗口大小优先采用当前运行时的模型元数据，而不是按模型名字猜测 API 规格。Codex 消费 App Server `thread/tokenUsage/updated` 的 `last.totalTokens` 和 `modelContextWindow`；不使用 `total` 累计消耗，也不重复加缓存输入。Claude 主请求的普通输入、缓存读取和缓存写入形成最近请求估算；`result.modelUsage` 只提取窗口，恢复调用的累计 token 不用于占用。OpenCode 保留提供商模型目录的 `limit.context`，最近完成的 assistant token 形成估算。子会话不污染主 Claude 会话。未知值保持未知，估算有明确标识。

按角色、参与者、后端、配置模型及 Session/Thread 隔离并保存派生观测；重启后恢复，新模型或新会话不沿用旧占用。压缩完成时清除旧占用，等下一次原生报告，不伪造“清零”结果。审计哈希验证仍由既有实现负责。

首次尚未获得窗口时使用原生模型默认压缩。获得窗口后默认在窗口的 85% 设置阈值，保留生成和工具结果余量。调用前以 UTF-8 字节数 / 3 估算新 prompt 的量；此估算不是官方 tokenizer，不包含全部原生系统内容或附件，不据此硬裁剪项目内容。既有 CLI/SDK 在单次调用内继续负责原生自动压缩。

- Codex 在已知占用加新 prompt 估算达到阈值时，先调用同一 Thread 的 `thread/compact/start`，等待对应压缩 turn 完成后才开始业务 turn。自动压缩阈值通过调用局部配置设置，压缩事件原样观测。
- Claude 两个角色都使用 `--autocompact`，移除仅决策者固定 `100k` 的限制，改为首次 `auto`、后续已知窗口的比例阈值。保留原 Session、用户设置文件和交互 Hook。
- OpenCode 隔离服务启用原生 `compaction.auto`；已恢复且接近阈值的 Session 在订阅原生事件后先 `session.summarize`，再发送新任务，记录 `session.compacted` 回执。
- 上下文超限单独分类为 `context`，不进入 transport 自动重放；保留人工调整后恢复的能力。工具结果未知时继续遵守既有禁止重放规则。

可选配置：`contextManagement.compactRatio` 范围 0.5–0.95，默认 0.85；`contextManagement.modelWindows` 可按精确配置模型 ID 补充自定义模型的窗口。原生已报告窗口优先；未知模型不使用臆测的通用窗口。这是用户声明的兼容配置，不是官方模型目录。

官方依据：

- [Codex App Server](https://developers.openai.com/codex/app-server)：窗口用量通知及 `thread/compact/start` 的异步生命周期。
- [Codex 配置](https://developers.openai.com/codex/config-reference)：`model_auto_compact_token_limit`。
- [Claude 上下文](https://code.claude.com/docs/en/context-window) 与 [CLI 参数](https://code.claude.com/docs/en/cli-reference)：原生自动压缩与 `--autocompact`。
- [OpenCode 模型](https://docs.opencode.ai/docs/models/)；接口参数另以安装的 `@opencode-ai/sdk` 1.18.35 类型核验，使用项目实际的 V1 兼容服务，不套用 V2 文档的不同协议。

## 实际验证

- 根 `npm run build`、桌面 `npm run check` 和 `npm run build` 成功。桌面构建既有的大 chunk / lucide 指令提示仍存在。
- `model-context.test.js`：6/6，包括角色/Session 隔离、恢复、窗口阈值、未知值、Claude 主请求/缓存、OpenCode 完成用量和超限分类。
- `model-context.test.js`、`codex-live.test.js`、`decision-token-efficiency.test.js` 合计 15/15，包含等待原 Thread 原生压缩完成再派发业务 turn、局部阈值配置。
- `call-observation.test.js` 中与本次观测直接相关的明确名称过滤：11/11。未删除或改写失败的历史固定回归。
- Codex/Claude/OpenCode 适配器、模型兼容、执行和恢复组合：95/95。
- 桌面 service/thread/workbench 复跑：70/70。首次并行扩大检查有失败，复跑全通过；不将首次结果改为 PASS。
- 补充讨论与上下文 IPC 检查：9/9，包含本次新增“每角色最新占用”数据链及讨论缓存刷新。
- `node scripts/check-context-meters.mjs`：隔离 headless 浏览器验证两个角色圆环、展开详情、未知不冒充 0%、位于计时左侧。截图在 `.validation/context-meters/meters.png`。使用合成数据，未控制用户浏览器，也不是可见 Electron 验收。
- `node scripts/check-model-context-live.mjs`：真实安装的 Codex App Server，两次只读短调用，同一个新建的验证 Thread。首次报告 `25237 / 475000` tokens，主动压缩收到开始及完成事件，续跑报告 `25498 / 475000`。压缩后占用不一定降低（此小会话原生启动内容占比高）；不以此证明长任务压缩质量。真实证据在 `.validation/model-context-live/evidence.json`。

Claude/OpenCode 压缩的真实远端长会话、本次完整 Electron 实例试用及极大上下文质量验收尚未执行；上述适配器检查使用明确的本地协议夹具。没有声称所有提供商精确实时占用均可观测。

## 基线失败与交付边界

扩大 `call-observation.test.js` 有 4 项固定 Context 回归失败：旧断言期待逐任务暂停，现行决策者验收后自动完成。干净原 TEST 基线工作区独立构建并运行 T1，同样复现 `completed` 与 `paused` 不符；相关生产验收代码及固定回归脚本没有被本次修改。记录于 `problems/2026-10-12-legacy-acceptance-regression-waits.md`。本次匹配改动的必要专项均通过；不宣称全库回归全绿，不据此交付 DEV 或发布 MAIN。

本地 TEST 仅整合源码，运行构建、GUI 试用与正式交付边界分别保留。集成使用 Git common directory 的共享 `personalagent-test-integration.lock`，持锁重新核对目标提交、干净工作区与最终组合，记录实际提交并核查后只释放本任务锁。

最新组合：依次正常合并 `test@6586625` 与 `test@7294770` 到任务分支。OpenCode 模型目录冲突逐字段保留双方的图片能力与窗口元数据；自动监督、Runtime 能力和夹具等待修正均保留。完成核心与桌面受影响组合复验后才推进 TEST。相同旧验收问题已与最新 TEST 的既有问题记录合并，删除本任务重复登记文件。

最终组合验证：核心模型窗口、Codex 原生压缩、OpenCode 能力与自动监督 23/23；桌面 `supervision/thread/service/sessions` 串行组合 120/120；根构建、桌面类型检查与构建、headless 圆环检查通过。新增 IPC 测试使用独立 service 数据目录，避免污染已有 Mock profile 夹具。此结果绑定最终组合，不覆盖历史失败批次。
