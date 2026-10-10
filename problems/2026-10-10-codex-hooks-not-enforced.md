# 独立 Codex Windows Hook 传输问题及未验证工具覆盖

- 归属：独立 Codex 本机接入及 PersonalAgent 集成边界。
- 状态：Shell 拦截与 CLI 源码 patch 已解决；专用工具覆盖暂缓，全局安装待授权，独立 Desktop 的完整防护未实现。
- 初始现象：npm CLI 0.147.0、Desktop 内置运行时 0.162.0-alpha.2 的隔离 app-server 都能列出 enabled/trusted PreToolUse。带空格的可执行文件命令没有成功调用脚本；改为无空格路径后审计确认 deny，但 JSON deny 与 exit 2 同时返回的版本仍执行无害命令。
- 场景：隔离 CODEX_HOME，独立工作区，本地确定性 Responses 服务发出一条 echo 工具调用；未连接付费模型、未执行危险交互。去除 matcher、替换启动路径、审查后的临时 trust bypass 仍未证明阻断。
- 修复及验证：用 PowerShell `&` 调用带空格路径，以 exit 0 返回 stdout 的结构化 permissionDecision deny。两套真实运行时通过持久信任拒绝 Shell，未使用 trust bypass；CLI 的 apply_patch 新增源码成功。非零退出在包装层的具体转换仍未定位，不依赖这条不可靠传输方式。
- 证据：`scripts/verify-codex-interaction.mjs` 可复现。最终原始证据在 `D:/pa-gwi/bin-1791605278829/evidence.json` 和 `D:/pa-gwi/9691020b546a15b2-1791605274619/evidence.json`；整理副本在 `docs/evidence/global-work-idle/`。保留初始失败证据，不将脚本决策单测冒充真实运行时拦截。
- 剩余影响：live 用户目录未安装；任意独立启动的当前会话不因此受到技术保护。Desktop 本地模型夹具未提供 apply_patch，Mock MCP 也未进入注册工具目录，均为 unsupported；不能当作 Hook 拒绝。MCP、浏览器/桌面、code-mode、工具启动阶段及已存在的输入会话未证明覆盖，模式写文件权限仍需 Windows 隔离加强。
- 下一步：在获授权的实际全局配置下安装与信任，再验证所用模型及专用工具目录；未覆盖入口继续采用 work 下暂停。需要强保证时使用进程隔离，不能靠规则或 trusted 元数据代替。候选已有备份及回退清单，当前不安装 live 用户配置。
