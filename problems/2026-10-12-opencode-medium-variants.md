# OpenCode 兼容配置丢失推理强度

状态：转换缺陷已修复并通过针对性验证，DEV 应用更新及真实任务切换尚未执行。

执行方：外部 Codex；基线为本地 TEST `9f5d4781363ac1497de5c7c5e6c76340d07766bb`，任务分支 `fix/opencode-variants-20261012`。DEV 运行版本为 `46d81b45d78f9b8c582cf87b689a1137ae389808`。

用户要求将校园任务的 Claude Code 决策者、小地图任务的 Claude Code 执行者切换为 OpenCode `hgapi-openai/gpt-6.1-sol`，推理强度 medium。两个原 Run 均因 Claude session limit 暂停。

此前外部脚本未继承 `Start-DEV.ps1` 的 OpenCode 可执行文件和独立 runtime 配置，误选择桌面版 V2.0.26。该版本实际 OpenAPI 没有 V1 JSON Schema format 接口；保留拒绝保护，不绕过接口校验。DEV 启动器已有明确的 V1.18.35 兼容路径，独立 V1 runtime 下模型发现正常。默认目录先运行 V2 后又运行 V1 曾导致 V1 启动失败；本任务保留现场，使用任务所属独立目录，未删除用户缓存或数据库。

另一个真实问题是 `v1ProviderConfig` 转换用户 V2 provider 配置时丢弃声明的 variants 数组，造成 6.1 Sol 可发现，但 medium 不可选。修复仅保留已声明的数组条目，转换为 V1 keyed options。OpenAI compatible 的已声明标准 effort 名称映射为 SDK `reasoningEffort`；显式 settings/body 保留，body `reasoning_effort` 转为 V1 SDK 字段。没有创建未声明强度，没有改变全局配置、凭据、Hook 或 V2 接口能力判断。

验证：根构建、Desktop 构建与类型检查通过；配置转换与角色切换测试通过；SDK variants 与不可用协议拒绝用例通过。实际 V1 CLI 加本地确定性 HTTP 模型完成 Plan、Execute、Review；8 次请求均为 `reasoning_effort=medium`，原生 read/apply_patch/bash 成功，测试程序由外部独立再次执行通过。真实已配置 provider 的只读模型发现列出 gpt-6.1-sol 的 low/medium/high/xhigh/max。该本地夹具不是远端模型验收，也不是两个 OpenWorld Run 已恢复。

验证证据位于 `D:/PersonalAgent-data/project-parallel-dev-update-20261012/evidence/variant-wire-final.log`、`opencode-v1-discovery.json`、`variant-contract-tests.log`、`variant-sdk-tests.log`；本地夹具的独立 Run 为 `D:/PersonalAgent-worktrees/tasks/opencode-variants-20261012/.validation/p3c-native-f008e48a/runtime/runs/` 下的保存记录。

额外回归：OpenCode adapter 合计 38 项，36 通过、2 失败。未修改 TEST 基线再次运行同两项，均复现：多决策者 Review 为 `OpenCode Session mode permissions mismatch`；历史 fixture 的 `userAccepted=true` 断言不符合现行决策者自动验收行为。本次没有修改这两个既有问题，也不把完整回归报告为通过。两个真实任务当前都为单决策者，不触发已观察的多决策者权限故障；正式整批 DEV 交付仍须处理其验收边界。

DEV 手动入口已存在：打开暂停会话，输入框上方的“决策者”或“执行者”按钮，选择 OpenCode、provider/model、推理强度后确认。手动和脚本使用同一后端校验；当前 DEV 的转换缺陷仍会阻止 medium，手动无法替代本修复。主窗口可继续正常使用，两个原 Run、历史 Session、任务进度保持暂停状态。
