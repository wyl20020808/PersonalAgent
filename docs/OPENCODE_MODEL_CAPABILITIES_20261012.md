# OpenCode 逐模型能力适配修复

执行方：外部 Codex 开发会话。基线：本地 TEST `aa52a965e0855dcda40566228b8286cd3732e4a4`。任务分支：`fix/opencode-model-capabilities-20261012`。独立工作区：`D:/PersonalAgent-worktrees/tasks/opencode-model-capabilities-20261012`。采用治理规则 V2.1 的本地 TEST 集成授权，不更新运行实例、DEV、MAIN 或远程仓库。

## 核查结论

当前 TEST 已有 `OpenCodeDecisionAgent`、`OpenCodeExecutionAgent` 和 `RealAgents` 路由，实际通过隔离的 `opencode serve` 与官方 SDK `session.prompt` 执行 Plan、Execute、Review，无需另建重复的 `opencode run` 通路。

OpenCode 内的模型使用 OpenCode 的工具、Session 和协议；选择 OpenAI/Codex 或 Anthropic/Claude 模型不等于调用 Codex CLI 或 Claude Code CLI。模型能力应以逐模型配置和实时发现结果为准，而不是继承这些独立工具的能力表。

缺口位于自定义 V2 配置转 V1：丢失工具、推理等声明，并对未声明图片能力的模型强制开启图片输入。Provider 启用范围和已有对象形式的模型变体也未保留。

## 修改

- 保留模型 `tool_call` 或 V2 `capabilities.tools`，包括显式 `false`；现有 V1 字段优先。
- 将 `modalities` 或 V2 `capabilities.input/output` 映射为 V1 输入输出声明；未声明时保守使用文本，不猜图片支持。
- 保留 `reasoning`、`temperature`、`interleaved`，保留不同 Provider 的显式推理参数和已声明变体，不猜模型家族。
- 保留 Provider 的 enabled/disabled 范围。
- V2 发现读取实际图片输入声明，但没有官方结构化输出协议时仍然拒绝运行。
- 所有已连接模型均缺少工具/结构化输出能力时，发现结果为不可用。现有模型选择和 Plan/Execute/Review 的派发前检查继续生效。

未声明工具能力时由 OpenCode 的模型元数据/原生默认值解析，不能将这些默认值解释为远端实测。结构化输出依赖 OpenCode 服务的 JSON Schema 协议和模型工具调用，运行结果仍须通过原有 Schema、Session、工作区和模型身份校验。

## 验证

- `rtk npm run build`：退出码 0。
- `node --import ./scripts/regression-policy.mjs --test dist/test/opencode-compatibility.test.js dist/test/decision-agent.test.js dist/test/opencode-execution-agent.test.js dist/test/agent-capabilities.test.js`：47/47 通过。
- 最后补充 Anthropic 显式 thinking 参数及 V2 图片发现断言后，复跑 compatibility 和 decision-agent：22/22 通过。
- `node scripts/validate-opencode-execution-local.mjs D:/PersonalAgent-data/opencode-compatibility-v1/toolchain/node_modules/opencode-windows-x64/bin/opencode.exe`：退出码 0。真实 CLI 经 V2 配置转换发现文本、图片、无工具和未声明模型；无工具模型的 structuredOutput 为 false，未声明图片模型的 images 为 false。8 次本地确定性模型请求完成真实 Plan/Execute/Review、read/write/bash 和 StructuredOutput，决策与执行 Session 独立。
- 原生执行测试输出 `lightweight test passed`；额外开发者检查实际启动 Node 验证结果，退出码 0，输出 `independent test passed`。决策验收 decisionAccepted=true，Controller 固定测试 evidence.passed=false，交付预览 approval=null；这些状态分别记录，没有伪造 Controller 测试或用户批准。

本地 CLI 证据：工作区 `.validation/p3c-native-50110681/result.json`，Run `0286807a-f9e4-4191-b7ff-4a57efcda46e`。首次脚本使用过时的 Controller 固定测试判据，虽然链路完成仍返回失败；更新为当前决策验收加实际开发者检查后重跑通过，首次证据保留。

远端模型调用 0 次；未逐个实测用户配置的远端模型，也未进行 Electron GUI 验收。图片支持为声明及协议发现验证，不是远端视觉质量验收。未声明图片支持的自定义模型需要在对应模型配置提供实际 `modalities.input` 或 `capabilities.input`，不修改用户全局配置来替模型承诺能力。
