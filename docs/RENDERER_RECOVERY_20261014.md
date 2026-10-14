# 渲染器白屏恢复修复（2026-10-14）

## 现场与结论

- 外部 Codex 执行。依据当前 V2.1，从 TEST `08f4d5f0cd9349bbb0c7825604d26d41da4a49c0` 创建 `fix/renderer-recovery-20261014`，工作树为 `D:/PersonalAgent-worktrees/tasks/renderer-recovery-20261014`。
- 故障实例为 DEV，主进程 PID 49680，自 2026-10-13 22:22:11 运行；DEV 检出提交为 `a7bcaa4f3631496330eabab4c740b8a3ddc6b48c`。检出提交不等于已证明的构建来源。
- 诊断时 `webContents.isCrashed()` 为 true，Electron 渲染子进程不存在，主进程仍响应。原 Controller PID 55984、Run `5533ffed-a330-4229-873f-d05785e9e4e8` 仍存在，锁归属一致，审计日志继续写入。
- `renderer-failures.jsonl` 显示本次主进程运行期间发生三次崩溃，分别为北京时间 10 月 13 日 22:50、10 月 14 日 03:06、03:37。旧逻辑 `rendererRecoveries >= 2` 是整个主进程生命周期的永久上限，第三次崩溃后不再恢复。
- 10 月 12 日历史日志曾记录临时安装恢复处理器；当前源码和当前进程仍是旧永久上限逻辑。由此确认此前临时处理没有持久覆盖当前运行版本。
- 已确认持续白屏的恢复缺陷；底层 Chromium 原生崩溃原因仍未定位。退出码不能证明某个 React 组件、显卡驱动或内存不足是根因。本次不声称消除了所有原生崩溃。

## 恢复与改动

通过本机主进程 inspector 核对 PID 和窗口身份后，仅重新加载 `personalagent://app/index.html`。未重启主进程或 Controller，未重建、恢复派发或改写 Run/Session。

恢复后 `isCrashed=false`，实际页面 DOM 可读取，最后核对文本长度 7317、节点数 1589。窗口像素抓取返回 `Current display surface not available for capture`，因此没有截图或完整可见 GUI 验收结论。

新模块以滚动十分钟内两次自动加载限速；密集崩溃进入冷却，冷却后自动重试，不再永久耗尽。加载失败继续受限重试，销毁与真正退出时清除定时器。诊断写入失败不妨碍恢复。work 模式延后加载，idle 后继续；不修改交互策略。新增主进程菜单及 `Ctrl+Shift+R` 恢复入口，渲染器崩溃时仍可用。初始加载前注册保护，初始加载失败不跳过任务关闭保护的注册。

同一恢复模块已临时安装到当前 DEV 主进程内存，替换的仅是旧恢复处理器，保留原线程订阅清理与 Controller。安装事件已追加到原恢复日志。DEV 源码及构建产物未覆盖，重启 DEV 后临时保护会消失；持久源码交付在 TEST。

一次后续调整当前进程退出监听器的命令被 PreToolUse Hook 以 `requires_system_authorization` 拒绝，未绕过。当前临时保护仍使用 before-quit 注销：若用户发起应用退出后取消，临时保护可能被注销；永久源码改为 will-quit，不存在该问题。已关闭本次临时打开的 inspector 监听。

## 验证

- Controller `rtk npm run build`：退出码 0。构建重写的非本任务 schema 已恢复。
- desktop `rtk npm run check`、`rtk npm run build`：退出码 0；最终 main.ts 调整后再次编译并类型检查通过。
- `rtk proxy node --test out/rendererRecovery.test.js out/windowPlacement.test.js out/interaction-policy.test.js`：14/14 通过。
- 隔离 Electron、独立 userData、隐藏窗口：真实 `forcefullyCrashRenderer()` 三次，每次恢复后读取 DOM `ready`，主进程保持同一 PID。测试时钟跨越十分钟用于验证配额恢复；不是真实长时间稳定性验收。最终证据：`D:/PersonalAgent-validation/renderer-recovery-20261014/electron-smoke.json`。
- 首次测试脚本模块导入错误，已修正；最终三次崩溃断言通过，但测试进程未在等待时限内退出，已按记录的测试 PID 清理。未将进程退出检查报为通过。
- 当前真实 DEV：恢复后 DOM 正常，原主进程及 Controller PID 未变。未在真实用户 Run 上注入崩溃。
- 自审：恢复模块只持有 BrowserWindow，不调用 stop/resume 或操作任务数据；重试受限、关闭可取消、日志失败隔离。自测不冒充独立决策者或用户验收。

## 清理报告

- 已删除：本任务临时目录 `D:/PersonalAgent-tmp/renderer-recovery-20261014`，约 9.1 MB，含探针、测试脚本、临时 Electron 数据及模块副本。
- 已保留：本报告、源码、回归测试，以及上述最终 Electron 证据 JSON。
- 未能清理：无临时目录残留；任务工作树构建缓存留至本地集成检查完成后回收。
- 进程：本任务测试 Electron 进程已结束，临时 inspector 已关闭；用户 DEV 与 Controller 保留。当前 DEV 内存中的恢复处理器属于恢复结果，继续服务原实例。
- Worktree 处置：本地 TEST 合并后移除任务工作树及其可再生缓存，保留任务分支。共享依赖只删除本任务 junction，不删除目标。
- DEV 已有未跟踪文件及历史工作树不属于本任务，未清理。未更新 DEV/MAIN Git，未推送或发布。
