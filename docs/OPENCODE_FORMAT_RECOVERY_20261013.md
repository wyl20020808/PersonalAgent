# OpenCode format 协议错误修复与验证

日期：2026-10-13。执行方：外部 Codex 开发会话。采用治理规则 V2.1。

## 问题与原因

OpenWorld Run `922a7176-8dea-4269-977a-ab785b4927d0` 在从 Shell 恢复时暂停，错误为 `OpenCode service lacks official JSON Schema structured output (format); prompt refused`。恢复入口未继承 DEV 启动器的 `PERSONAL_AGENT_OPENCODE_EXECUTABLE`，自动解析到桌面自带的 V2 CLI；该服务不提供适配器需要的官方 JSON Schema format 协议。机器上已安装兼容的 1.18.35 CLI，DEV 启动器已指向它。

## 修复

- 没有显式配置 CLI 时，优先使用本机已有的兼容工具链，避免 CLI/resume 与桌面启动入口不一致。
- 决策、执行、两类模型发现默认共用兼容启动流程。
- 显式配置其他 CLI 时，先在独立 `.format-probe` 数据目录探测协议，关闭探测服务后才打开原 Session 数据目录。新旧 CLI 数据库格式不同，不能让不兼容探测服务初始化原数据库。
- 仅当服务成功启动但缺少 format 时，切换兼容 CLI 一次并重新验证协议。没有兼容工具链时继续明确拒绝；认证、启动失败、额度和未知工具结果不因此重试。
- 保留 provider、model、variant、Run、原 Session、调用计数和恢复规则；原 Session 所有权验证继续执行，不用新 Session 掩盖恢复失败。
- 恢复成功写入 `opencode-format-recovered` 审计，明确记录尚未提交 prompt。
- 可通过 `PERSONAL_AGENT_OPENCODE_COMPATIBLE_EXECUTABLE` 指定已安装的兼容 CLI；不自动下载或改写全局配置。

## 基线与范围

初始 TEST：`35a08a1`。开发分支：`fix/opencode-format-recovery-20261013`。独立目录：`D:/PersonalAgent-worktrees/tasks/opencode-format-recovery-20261013`。验证期间整合最新 TEST `53da0a4`，其新增文件仅涉及设置页面，与本次适配器无冲突。

改动限定为两个 OpenCode 适配器、恢复回归测试及本文。不修改 OpenWorld 源码，不改写历史审计，不替换运行中的 DEV 实例，不推送或发布。

## 验证

1. `rtk npm run build`：退出码 0，TypeScript 编译和 schema 导出通过。构建产生的无实际内容差异 schema 文件不纳入提交。
2. `rtk proxy node --test dist/test/opencode-format-recovery.test.js dist/test/opencode-compatibility.test.js dist/test/decision-agent.test.js dist/test/opencode-execution-agent.test.js dist/test/opencode-runtime-crash.test.js`：55/55，通过；这是加入探测数据库隔离前的适配器回归。
3. 加入隔离后重新构建，`rtk proxy node --test dist/test/opencode-format-recovery.test.js dist/test/opencode-compatibility.test.js`：11/11，通过。覆盖默认解析、单次回退、原数据目录保留、兼容显式 CLI 的探测和重启、取消、失败清理及禁止认证错误重试。
4. `rtk proxy node scripts/validate-opencode-execution-local.mjs D:/PersonalAgent-data/opencode-compatibility-v1/toolchain/node_modules/opencode-windows-x64/bin/opencode.exe`：退出码 0。真实 CLI 与本地确定性模型完成 Plan、原生 read/write/bash、Execute、Review 和 Delivery Preview；8 次本地模型请求，远端付费请求 0。不是远端模型质量验收或正式交付。
5. 无桌面启动环境的真实服务发现：默认解析到兼容 CLI，format=true，available=true，目标 `hgapi-openai/gpt-6.1-sol` 可用，6 个 provider，未提交 prompt。
6. 显式指定桌面 V2 CLI 的真实服务回退：`recovery=json-schema-format`，最终 format=true、available=true，目标模型可用；未提交 prompt。探测与正式数据目录隔离。证据：`D:/PersonalAgent-data/opencode-format-recovery-20261013/probe-result.json`、`fallback-result.json`。
7. 首次取得集成锁时发现 TEST 再次前进，未修改目标；先在任务 Worktree 正常合并新的自动监督修复，并重新构建及运行本次恢复、兼容转换和自动监督测试：23/23，通过，退出码 0，无源码冲突。
8. 从 DEV `e91d9e4` 创建独立候选 `fix/opencode-format-dev-candidate-20261013`，仅 cherry-pick 本次四个文件，候选提交 `a229998`。候选构建及恢复/兼容测试 11/11 通过，退出码 0。DEV 本身已有其他脏文件，未清理、覆盖或纳入候选。

前两次探测曾复用本任务测试目录，在 V2 初始化后 V1 报数据库无 session 表；因此补上探测隔离。该目录是本任务新建的诊断目录，未访问或修改原 Run 数据库；保留失败证据。

## 真实任务状态与未完成边界

调查期间，另一恢复进程已用兼容 CLI 续接原 OpenWorld Run，越过本错误并完成第 13 项验收，推进到第 14 项。随后 Codex 报模型容量不足及未知工具结果，Run 再次暂停；此问题不同于 OpenCode format，不能自动重放未知操作。本开发会话没有重复恢复该 Run，也没有更换它的模型或 Session。

本次验证属于开发者自测与真实 CLI 协议测试，不冒充决策者独立验收。未做 GUI 验收。永久修复先集成本地 TEST；DEV 更新及实例重启仍需要绑定具体候选与安全节点的批准。
