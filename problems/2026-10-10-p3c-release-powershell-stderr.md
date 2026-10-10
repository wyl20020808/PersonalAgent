# P3C 发布脚本将构建警告误判为终止错误

归属：本次独立集成发布脚本，不是 P3C 执行者或 Desktop 业务源码。当前状态：已解决；不阻断集成。

## 现象与影响

DEV 已安全关闭空闲窗口并通过 `git merge --ff-only` 更新。Controller 构建与 Desktop 类型检查完成后，PowerShell 发布脚本在 Desktop 构建输出 lucide 的 `MODULE_LEVEL_DIRECTIVE` / `use client` 警告时，以 `NativeCommandError` 停止，导致该次脚本未执行历史升级及窗口启动。

## 已确认原因与处理

脚本设置 `$ErrorActionPreference = 'Stop'`，并将原生命令的 stdout/stderr 合并重定向到文件。此 PowerShell 环境将 stderr 包装成错误记录，构建警告触发终止；不能据此断言 npm 构建本身失败。

改用 Node 子进程分别接收 stdout/stderr，并按实际进程退出码判断成功。正式 DEV Desktop 重新构建退出码为 0，保留了原警告；没有修改 lucide、业务代码或全局 PowerShell 设置。随后继续进行只读历史兼容升级及正常窗口恢复。

## 证据

- `D:/PersonalAgent-data/p3c-dev-integration-v1/release.ps1`：原发布脚本。
- `D:/PersonalAgent-data/p3c-dev-integration-v1/formal-desktop-build.log`：首次输出。
- `D:/PersonalAgent-data/p3c-dev-integration-v1/formal-build.mjs`：修正后的独立构建调用。
- `D:/PersonalAgent-data/p3c-dev-integration-v1/formal-desktop-build-retry.log`、`formal-build-retry.json`：正式构建退出码 0。

建议后续发布脚本统一按原生命令退出码判定，保留 stderr 作为诊断，不把普通警告自动升级为发布失败。
