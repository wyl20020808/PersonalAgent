# MAIN/DEV 双实例运行隔离 V1

MAIN 用于 PersonalAgent 自我开发，应选择基于最新 dev 创建的独立 feature/fix Worktree。DEV 用于其他独立项目。实例身份由进程级 `PERSONALAGENT_INSTANCE=main|dev` 指定，与 Git 分支无关。没有新增模型、认证或计费渠道。

## 启动

在两个独立 PowerShell 进程中分别执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\PersonalAgent\Start-MAIN.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\PersonalAgent\Start-DEV.ps1
```

也可在资源管理器中对入口选择“使用 PowerShell 运行”。MAIN 固定启动 `D:\PersonalAgent`；DEV 固定启动 `D:\PersonalAgent-worktrees\dev`。入口只设置当前进程及其子进程环境，不修改全局环境变量。更新前正常退出对应实例并确认没有仍在写入的 Controller/Agent 进程，再合并、构建和启动。

## 数据目录

| 资源 | MAIN | DEV |
|---|---|---|
| 实例业务数据根目录 | `D:\PersonalAgent\.desktop-data` | `D:\PersonalAgent-data\instances\dev` |
| Electron userData、单实例锁 | 根目录下 `electron` | 根目录下 `electron` |
| Chromium sessionData | 根目录下 `electron\session` | 根目录下 `electron\session` |
| Session、实例配置 | `sessions.json`、`profiles.json`、`projects` | 同名文件位于 DEV 根目录 |
| 新项目 Run/Controller runtime | `projects\<项目键>\runtimes\<轮次>` | 同结构位于 DEV 根目录 |
| 日志、临时文件、缓存 | `logs`、`tmp`、`cache`、`crash-dumps` | 同结构位于 DEV 根目录 |
| 窗口位置和大小 | `window.json` | 独立 `window.json` |

MAIN 原有外部配置、历史 Run、预算和审计仍在原处，没有迁移、清空或复制认证。DEV 新建空白运行目录，不能导入位于 DEV 数据目录外的可写 Controller runtime；显式只读历史回放可并存。目录的 `instance.json` 防止 MAIN/DEV 误用同一业务目录。窗口标题与侧栏始终显示 MAIN/DEV。

产品仅使用 Electron IPC 与自定义 `personalagent://` 协议，没有 HTTP 监听端口；因此无需固定端口分配。验证工具的调试管道不作为产品服务。

## 真实调用与写入保护

跨实例项目锁继续使用 `D:\PersonalAgent-data\project-locks`，按项目真实绝对路径规范化并忽略 Windows 大小写。直接开发、隔离工作区执行、正式文档写入、人工验收和 Delivery 应用均受对应工作区/目标锁保护。读取历史或不同项目可以并存。异常锁、无法判定存活状态或竞争失败时拒绝写入；不自动绕过锁。此机制用于遵守正式 Controller 流程，不是操作系统权限沙箱。

2026-10-09 按用户明确决定移除内部付费预算保护。MAIN、DEV 和 CLI 可直接使用已配置的真实 Agent，无需共享预算授权文件或余额预约。原有预算文件保留在磁盘上，但不参与新 Run 的运行许可判断；历史字段和用量仍可读取。服务商认证、限流和订阅额度耗尽正常报告。

执行轮数、返工次数、审查修复循环、超时与交付审批继续生效。今后预算若重新设计，应作为独立可选功能；本次不实现。

## 验证

`test/dual-instance.test.ts` 检查数据误用、无预授权的真实模式本地注入、同步 MAIN/DEV Mock 子进程、数据隔离和跨进程项目写入冲突。`desktop/validate-dual-instance.mjs` 使用隔离测试数据和真实 Electron 窗口、正式 IPC/Mock Controller，检查同时启动、独立 Session/Run、历史读取和单实例退出。没有调用真实模型。
