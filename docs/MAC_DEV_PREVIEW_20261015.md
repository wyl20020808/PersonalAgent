# Mac DEV 适配草稿与交接

日期：2026-10-15。开发方式：外部 Codex，Windows 本机独立 Worktree。用户明确指定 DEV 基线，并明确要求将本次内容提交到 DEV、推送远端及将仓库改为公开；本次按该授权交付草稿，不冒充完成的 Mac 安装包或稳定版本。

基线：`dev` / `6b845f98405d7b6f6d7be68db8861e76242d23e3`。任务分支：`codex/mac-dev-preview-20261015`。

## 已有改动

- macOS 使用用户 `Library/Application Support/PersonalAgent` 存放共享运行目录、实例数据和策略；Windows 保留原 D 盘目录。项目写入锁使用用户共享运行目录，避免安装目录不可写和工作目录变化。
- 桌面入口只在 Windows 校验 D 盘。Finder 启动时补充常见工具目录，不执行用户 Shell 启动脚本；支持查找本机 Node 或候选应用包中的 Node。
- 增加 Claude/npm 可执行文件发现辅助函数，供 Mac 后续接入。Windows 默认路径保留。
- 补充 macOS 剪贴板、截图、AppleScript、打开应用和系统高风险命令分类；不修改用户全局策略，不关闭 Hook 或扩大 idle 权限。
- 新增路径、Finder PATH、工具发现与 macOS 命令策略测试。

## 尚未完成

这不是可直接安装的 Mac 版本。`desktop/src/service.ts` 和 `desktop/src/sessions.ts` 中的 Windows Claude 路径、选定测试工具的路径尚未替换；Agent 指导文本仍需与 Mac 策略实际路径对齐。缺少 .app/DMG 打包入口、Mac 依赖安装及实际运行证据。

下一步应在 Mac Codex 克隆仓库，检出包含本草稿的 `dev`，建立独立任务分支和 Worktree，完成剩余适配；不要复制 Windows 的 node_modules、凭据或运行历史。验证终端与 Finder 启动、项目创建、真实 Agent 调用、暂停恢复、历史记录及本机架构安装包。登录使用用户在 Mac 本机授权的配置。构建、Mock、真实 Agent、GUI 和长期稳定性结论分别记录。

## 本机验证

所有命令在独立任务 Worktree 执行，未构建或重启 Windows DEV 实例。

| 检查 | 实际结果 |
| --- | --- |
| 根目录 `npm run build` | 退出码 0 |
| desktop 目录 `npm run check` | 退出码 0 |
| desktop 目录 `npm run build` | 退出码 0；有既存 use-client 与 chunk-size 警告 |
| `node --import ./scripts/regression-policy.mjs --test dist/test/platform-runtime.test.js dist/test/dual-instance.test.js` | 退出码 0，11/11 |
| desktop 目录 `node --import ../scripts/regression-policy.mjs --test out/interaction-policy.test.js out/supervision.test.js out/rendererRecovery.test.js` | 退出码 0，13/13 |
| 现有 interaction-policy 回归 | 16/17；`pending GUI cannot bypass human/fail Review or a failed safe acceptance check` 失败，`2 !== 1` |
| 原 DEV interaction-policy 模块对照 | 同一用例仍失败，退出码 1；未更改该用例或 Controller 来掩盖失败 |
| `git diff --check` | 通过 |

策略对照日志保留于本机 `D:/PersonalAgent-validation/mac-dev-preview-20261015/baseline-policy.log`。Mac 实机、真实 Agent 调用、GUI 和安装包验证未执行，不能据此宣称 Mac 可用或稳定。

## 公开前检查

已对 origin 远端可达历史中的 2046 个文本对象扫描常见私钥、GitHub、模型服务、AWS 和 Slack 密钥签名，未命中；53 个二进制对象未作文本凭据分析。这是有限的签名检查，不是完整的凭据或隐私审计。检查结果保留于本机 `D:/PersonalAgent-validation/mac-dev-preview-20261015/publication-scan.json`。未将本地未跟踪文件、认证配置或运行数据加入本次提交。

## 清理报告

- 已删除本任务重新安装的依赖、构建输出、缓存及测试夹具，共 845156309 字节（约 806 MiB）；Schema 构建输出恢复为原 DEV 基线，避免夹带无关变化。
- 源码、测试和本交接文档保留为正式内容；本机仅保留最终补丁、交接说明、基线失败日志和公开前检查结果。
- 所有本任务构建及测试进程已结束；未操作用户或其他任务实例。
- 合入 DEV 后移除本任务 Worktree，保留任务分支；不清理其他任务或历史未跟踪文件。一次性检查脚本在收尾删除。
