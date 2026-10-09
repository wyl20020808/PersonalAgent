# Multi-Agent Role Board 第一阶段验证

## 交付范围与基线

本次在独立 Codex Desktop 会话开发，仅修改 `feature/multi-agent-role-board-p1`，Worktree 为 `D:\PersonalAgent-worktrees\tasks\multi-agent-role-board-p1`。创建时重新核对的最新 dev 为 `039a2fd10623d09e2aac66c9fa201edcde2697b4`。

开发期间 dev 独立推进至 `86a5f91bb7f79b39fdc7ae23e266b5c6962d0811`，新增大型项目 Snapshot 修复及记录。与本次修改文件无重叠；本分支未自行合并或变基，后续集成仍需授权并基于届时 dev 检查。main、dev 和其他 Worktree 均未修改，未 push 或发布。

按照用户后续纠正，聊天布局最终为：用户消息居中、气泡文字左对齐；Claude Code / OpenCode 决策消息在左侧；Codex 执行消息在右侧。此要求覆盖最初“所有 Agent 右侧”的描述。

## 实现

- 左右双池只存在于新会话初始化，窄窗上下排列；保留项目、标题、底部输入框和现有聊天结构。按用户最新视觉反馈删除中央重复标题、说明、三个标签、运行模式选择、工作方式文字及未来功能占位按钮；仅保留工作方式下拉框、文件夹按钮、池标题和必要状态。新会话固定使用既有 Real 默认，Mock 接口与历史会话仍保留。
- 两池展示三个 Agent，当前只激活一名决策者和一名 Codex 执行者；未实现的角色组合及添加决策者明确禁用。
- Provider / Model 收进卡片设置面板。OpenCode 复用现有动态发现接口，刷新或项目改变时旧结果不能继续验证；失败不回退 Claude，发送按钮与 Enter 均阻止新任务。
- Claude Code / Codex 只展示现有真实配置能力，不编造模型选项。
- 新增轻量能力描述：Plan、Review、Execute、原生工具、结构化输出和讨论。没有修改 Controller 调度、Config Schema、默认认证或工具权限。
- 消息身份使用冻结 Run 决策配置、可信配置回退和实际事件；旧无标记会话按既有 Claude 默认显示，不从消息文本猜测。
- 卡片、消息头像、项目详情共用本地官方 SVG 组件。来源、哈希和许可边界见 `desktop/src/assets/agents/README.md`；OpenCode MIT 许可原文一并维护。

## 实际验证

| 验证 | 结果 |
| --- | --- |
| Controller `npm run build` | 通过；生成 Schema 无语义变更，未纳入提交 |
| Desktop `npm run build` | 通过；已有 lucide 指令警告，无构建错误 |
| Desktop `npm run check` | 通过 |
| Desktop 原回归 `npm test` | 79 / 79 通过 |
| 新增历史身份定向测试 | 1 / 1 通过 |
| 决策后端与 OpenCode 兼容定向测试 | 17 / 17 通过 |
| 新增角色能力与配置兼容测试 | 2 / 2 通过 |
| 实际 Electron 窗口脚本 | 9 / 9 通过；无错误；付费模型调用 0 |

上述测试共 99 项，分批执行；新增身份测试不包含在前述 79 项回归统计中。Controller 定向测试只使用本地假 Agent / Mock，没有调用远端付费模型。

Electron 最终证据目录：`D:\PersonalAgent-data\multi-agent-role-board-p1\electron-c8709fe9`。机器可读结果为该目录的 `result.json`，截图包括：

- `01-initialization-wide.png`：默认 Real、双池和禁用候选。
- `02-opencode-settings.png` / `03-opencode-unavailable.png`：动态发现、详细设置、失败与刷新。
- `04-initialization-narrow.png`：760 × 860 窄窗无横向溢出。
- `05-chat-centered-user.png`：居中用户消息、长文本与 Markdown。
- `06-chat-agent-roles.png`：Claude 决策消息左侧；脚本同时断言 Codex 执行消息右侧。
- `07-approval-unchanged.png` / `07b-apply-confirmation.png`：原审批页面与确认窗口。
- `08-opencode-chat.png`：OpenCode 决策身份、左侧消息和详情。

脚本使用隔离项目和数据目录，仅允许隔离 Mock Run 启动；测试专用服务拦截先断言 UI 请求为 Real，再仅在隔离夹具改为 Mock；生产源码没有此拦截。分别验证旧 Claude + Codex 与 OpenCode + Codex 创建、完成和身份保存。Preview / Approve / Apply 经正式 Controller 流程验证，包括重新验收和已有成果未重复写入。历史切换、Run 详情、消息筛选、证据和折叠保留。

复现脚本：构建 Controller / Desktop 后，在该 Worktree 执行 `node desktop/validate-role-board-electron.mjs`。本机此次通过环境变量 `PERSONAL_AGENT_ELECTRON=D:/PersonalAgent/desktop/node_modules/electron/dist/electron.exe` 只读复用已安装的 Electron 44.7.0；Playwright 来自现有本地验证依赖。发现接口注入确定性测试数据，仅证明 UI 分支正确，不宣称验证了远端模型发现服务。

## 问题与限制

新建问题记录，均为待处理、非本次功能阻断：

1. `problems/2026-10-10-agent-brand-permission.md`：Anthropic 品牌公开分发许可尚未取得。当前素材为官方原件；公开分发前必须解决许可，不能视为自由授权。
2. `problems/2026-10-10-feature-electron-binary-missing.md`：独立 Worktree 安装依赖后缺少 Electron 二进制，根因未确认；本次使用明确路径绕过，未修改依赖认证或主 Worktree。
3. `problems/2026-10-10-new-session-delivery-rail-selection.md`：既有新会话的侧栏交付入口可能没有 selected Run；项目详情入口可完成完整交付。记录后保留原 App 逻辑，未扩大修改范围。

第一阶段仍只允许一名决策者（Claude Code 或实验性 OpenCode V1）及一名 Codex SDK 执行者。没有真实多决策讨论、其他执行者或 Codex 决策实现。Real 默认未改变；本次仅隔离 Mock / 本地兼容验证，未重跑远端真实模型。

第二阶段只规划独立身份与 Session 的 1～3 名决策者、0～2 轮讨论及主决策者汇总，仍由 Controller 校验并独立验收。第三阶段只规划真实兼容验证后的角色互换，执行池仍一名。两阶段均未实施。

本报告为开发会话自测记录，不代替独立正式交付审批。源码、官方素材、必要测试和本报告按用户明确要求提交独立 feature；保留其他未跟踪文件，等待后续合并授权。
