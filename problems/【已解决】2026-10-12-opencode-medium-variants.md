# OpenCode 兼容配置丢失推理强度

状态：已解决。转换缺陷修复、TEST 验证、获批 DEV 完整批次更新和两个真实角色切换已完成；游戏成果验收另外进行。

执行方：外部 Codex；基线为本地 TEST `9f5d4781363ac1497de5c7c5e6c76340d07766bb`，任务分支 `fix/opencode-variants-20261012`。DEV 运行版本为 `46d81b45d78f9b8c582cf87b689a1137ae389808`。

用户要求将校园任务的 Claude Code 决策者、小地图任务的 Claude Code 执行者切换为 OpenCode `hgapi-openai/gpt-6.1-sol`，推理强度 medium。两个原 Run 均因 Claude session limit 暂停。

此前外部脚本未继承 `Start-DEV.ps1` 的 OpenCode 可执行文件和独立 runtime 配置，误选择桌面版 V2.0.26。该版本实际 OpenAPI 没有 V1 JSON Schema format 接口；保留拒绝保护，不绕过接口校验。DEV 启动器已有明确的 V1.18.35 兼容路径，独立 V1 runtime 下模型发现正常。默认目录先运行 V2 后又运行 V1 曾导致 V1 启动失败；本任务保留现场，使用任务所属独立目录，未删除用户缓存或数据库。

另一个真实问题是 `v1ProviderConfig` 转换用户 V2 provider 配置时丢弃声明的 variants 数组，造成 6.1 Sol 可发现，但 medium 不可选。修复仅保留已声明的数组条目，转换为 V1 keyed options。OpenAI compatible 的已声明标准 effort 名称映射为 SDK `reasoningEffort`；显式 settings/body 保留，body `reasoning_effort` 转为 V1 SDK 字段。没有创建未声明强度，没有改变全局配置、凭据、Hook 或 V2 接口能力判断。

验证：根构建、Desktop 构建与类型检查通过；配置转换与角色切换测试通过；SDK variants 与不可用协议拒绝用例通过。实际 V1 CLI 加本地确定性 HTTP 模型完成 Plan、Execute、Review；8 次请求均为 `reasoning_effort=medium`，原生 read/apply_patch/bash 成功，测试程序由外部独立再次执行通过。真实已配置 provider 的只读模型发现列出 gpt-6.1-sol 的 low/medium/high/xhigh/max。该本地夹具不是远端模型验收，也不是两个 OpenWorld Run 已恢复。

验证证据位于 `D:/PersonalAgent-data/project-parallel-dev-update-20261012/evidence/variant-wire-final.log`、`opencode-v1-discovery.json`、`variant-contract-tests.log`、`variant-sdk-tests.log`；本地夹具的独立 Run 为 `D:/PersonalAgent-worktrees/tasks/opencode-variants-20261012/.validation/p3c-native-f008e48a/runtime/runs/` 下的保存记录。

额外回归初次发现两项 TEST 基线既有失败：测试 HTTP 服务未实现原生 Session PATCH permission 更新，因此多决策者 Review 被生产检查正确拒绝；历史 fixture 的 `userAccepted=true` 断言不符合现行决策者自动验收行为。仅修正测试服务的权限更新响应，并断言 decisionAccepted=true 且未伪造用户审批，没有弱化生产权限校验。最终 OpenCode adapter、配置与角色切换回归合计 42/42；Desktop 全回归 152/152；聊天文件与终端的隔离 headless fixture 通过。最终日志为 `variant-final-tests.log`、`variant-desktop-tests.log`。真实 Electron 可见界面与远端模型调用没有在本修复中冒充已通过。

DEV 手动入口已存在：打开暂停会话，输入框上方的“决策者”或“执行者”按钮，选择 OpenCode、provider/model、推理强度后确认。手动和脚本使用同一后端校验。2026-10-12 用户批准完整 TEST 候选 5c03edd 并安全更新 DEV，两个原 CC 角色正式切换为 hgapi-openai/gpt-6.1-sol variant medium。校园真实 Review 已调用成功。另一个此前未覆盖的 Claude→OpenCode 中断恢复问题补齐后，经用户批准更新完整后续候选 5d25779，小地图在原 Run、t01、任务工作树中实际执行 OpenCode 工具。校园当前的资产 Owner 授权停点没有被假冒批准。主窗口已安全恢复，同一 OpenWorld 项目下两个会话和所有既有进度保留。
