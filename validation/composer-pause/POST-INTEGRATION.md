# DEV 组合验证

日期：2026-10-11。用户批准后，功能提交 `0babb51` 与 dev 侧栏任务转圈提交 `c2caff4` 无冲突合并，组合提交 `926ff66f6a57adb3b80212e52c8321f3346f6775`；dev 快进到该提交。

- DEV 根目录 build、desktop build/check 通过；desktop 串行回归 104/104 通过（94.3 秒），根目录 decision-switch 专项 4/4 通过。
- 组合源码的隔离 Electron 聊天 UI 检查 21 项通过，实际 DEV 构建的侧栏转圈 headless 专项通过。首次侧栏检查误用了任务目录尚未重建的旧 App 产物，超时；改为检查已重建的 DEV 产物后通过，没有修改检测程序或降低断言。
- DEV 原有 schema 未提交字节与全部无关未跟踪文件保持；根目录导出构建后恢复原 schema 字节，没有纳入交付。
- 更新前确认无 Controller 子进程和存活 Run 写锁，正常关闭原 DEV 窗口后更新。PowerShell 启动尝试未留下 DEV 进程；随后用等同 Start-DEV.ps1 的实例、数据、OpenCode、TEMP/TMP 环境直接启动现有 Electron，确认 PID 42764 及 renderer/utility/GPU 子进程使用真实 DEV 目录和 DEV 数据目录，启动日志无报错。未自动恢复或重放暂停任务。
- 重启后 profiles.json、sessions.json 和 6 个完整历史 Run 的 state.json SHA256 与更新前一致。服务可读取 7 个会话、6 个 Run；另有一条缺少 state.json 的历史目录，明确显示不可用，未伪造修复，见问题记录。
- main 未修改、未推送、未发布；本轮整合无新增付费模型调用。源码正式 Controller 独立验收/Claude 审查未由本次制造；这些测试属于本会话自测，整合依据用户直接批准。

组合 UI 截图和数据更新前快照位于任务目录的 Git 忽略路径 `validation/composer-pause/dev-update-backup-1791694842540/`；用户 Session 原文不纳入 Git。真实调用及审批前验证材料保持原始快照。
