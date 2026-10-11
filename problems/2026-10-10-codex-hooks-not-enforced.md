# 原生工具 Hook 覆盖与 Windows 传输边界

- 归属：独立 Codex 接入，以及 PersonalAgent 原生 Claude/OpenCode/Codex 工具层。
- 状态：已解决两套 Codex 运行时的 Windows Shell Hook 传输；修正后安全 Shell 放行、交互 Shell defer、CLI 源码 patch 均已验证。Claude invocation-local Hook、OpenCode V1 插件的 Bash 正反例也已由真实 CLI + 本地假模型验证。专用工具覆盖暂缓，全局安装待授权；SDK 内部原生工具尚无全覆盖技术保证。
- 初始现象：CLI 0.147.0、Desktop 内置运行时 0.162.0-alpha.2 可以列出 enabled/trusted，但带空格路径没有正确调用脚本；无空格路径返回 JSON deny + exit 2 的版本仍执行无害 echo。最终使用 PowerShell `&` 调用 Node，以 exit 0 的 stdout 返回 structured permissionDecision deny，持久信任复启后实际阻断。包装层非零退出的具体转换未进一步定位。
- 修正证据：Codex `D:/pa-gwi/bin-1791607626701/evidence.json`、`D:/pa-gwi/9691020b546a15b2-1791607612172/evidence.json`；Claude `D:/pa-cc-policy-zImiZY/evidence.json`；OpenCode `D:/pa-oc-policy-3b1gec/evidence.json`。可复现脚本为 `scripts/verify-codex-interaction.mjs`、`verify-claude-interaction.mjs`、`verify-opencode-interaction.mjs`，提交副本在 `docs/evidence/global-work-idle/`。
- 测试安全性：只有安全 echo、包含 ClipCursor 字面标记的无害 echo、源码 patch、本地 Node 验收。没有执行真实鼠标/键盘/剪贴板/GUI/系统或压力行为，未连接付费模型。模型在工具拒绝后继续，OpenCode 实际 Run completed。
- 剩余影响：live 用户 Codex 目录未安装，任意现有独立会话不自动受保护；SDK 原生工具主要依靠规则。Desktop 夹具缺少 apply_patch，Mock MCP 未注册，unsupported 不能算 Hook 拒绝。command/exec 的 Windows 基础设施错误不能算策略覆盖。code-mode、hosted/专用工具、插件/MCP 启动、已存在 write_stdin、原生后代进程仍未证明完整覆盖。普通 Shell 动态/混淆/下载代码与同用户策略文件写权限也没有 OS 边界。
- 下一步：获明确安装授权后核对最新原文件哈希、备份、合并 Hooks、精确信任并验证 live 所用工具。未覆盖的具体桌面工具延后，正常模型和安全开发继续，不能再次退回“work 禁止 Agent”。更强保证需 Windows 隔离。候选 `validation/codex-install-stage-semantic-final` 已含备份与回退清单，当前未安装。
