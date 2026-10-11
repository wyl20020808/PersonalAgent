# MAIN/DEV/TEST 运行接口与验收边界

2026-10-11 分工按 [三分支治理规则 V2](PERSONALAGENT_DEVELOPMENT_GOVERNANCE_V1.md) 更新：MAIN 暂留稳定版本，DEV 执行真实任务，TEST 持续集成和试用。当前由外部 Codex 开发会话迭代，不要求 MAIN 启动。新功能和普通修复从 TEST 创建独立 feature/fix Worktree，先整合 TEST；完整候选验收及正式审批后，在安全节点更新 DEV。DEV 紧急修复从 DEV 创建并同步 TEST；MAIN hotfix 从 MAIN 创建并同步必要修复到 DEV、TEST。

以下描述现有 MAIN/DEV 接口：实例身份由进程级 `PERSONALAGENT_INSTANCE=main|dev|test` 指定，与 Git 分支无关。TEST 与 MAIN/DEV 使用相同模型、认证和计费入口；业务数据分别隔离。

## TEST 启动与验收边界

TEST Worktree 为 `D:\PersonalAgent-worktrees\test`。`Start-TEST.ps1` 设置 TEST 身份和 `D:\PersonalAgent-data\instances\test` 独立业务目录；窗口与侧栏显示 TEST。构建产物位于 TEST Worktree；Electron userData、单实例锁、Session、Run、Controller runtime、日志、缓存和临时目录均从独立数据目录派生。TEST 拒绝 MAIN/DEV 的默认数据目录和已有实例标记，写入 Controller runtime 须留在自己的数据目录。headless 的三进程 Mock 与实例标记测试不代表三个真实 Electron 窗口并存验收；真实 GUI 与完整运行隔离仍待验收。不得迁移或清空 DEV 真实任务历史。

## 现有 MAIN/DEV 启动

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

MAIN 原有外部配置、历史 Run、预算和审计保留在原处，不迁移、清空或复制认证。DEV 使用其独立运行目录，不能导入位于 DEV 数据目录外的可写 Controller runtime；显式只读历史回放可并存。目录的 `instance.json` 防止 MAIN/DEV 误用同一业务目录。现有窗口标题与侧栏显示 MAIN/DEV；此描述不代表 TEST 标识已实现。

产品仅使用 Electron IPC 与自定义 `personalagent://` 协议，没有 HTTP 监听端口；因此无需固定端口分配。验证工具的调试管道不作为产品服务。

## 真实调用与写入保护

跨实例项目锁继续使用 `D:\PersonalAgent-data\project-locks`，按项目真实绝对路径规范化并忽略 Windows 大小写。直接开发、隔离工作区执行、正式文档写入、人工验收和 Delivery 应用均受对应工作区/目标锁保护。读取历史或不同项目可以并存。异常锁、无法判定存活状态或竞争失败时拒绝写入；不自动绕过锁。此机制用于遵守正式 Controller 流程，不是操作系统权限沙箱。

2026-10-09 按用户明确决定移除内部付费预算保护。MAIN、DEV 和 CLI 可直接使用已配置的真实 Agent，无需共享预算授权文件或余额预约。原有预算文件保留在磁盘上，但不参与新 Run 的运行许可判断；历史字段和用量仍可读取。服务商认证、限流和订阅额度耗尽正常报告。

按 2026-10-11 用户修订，桌面端 Run 不设执行轮数、返工次数和审查修复次数上限；脚本或 CLI 显式配置的 maxLoops、maxReworks 才生效。用量计数、超时、写入锁、隔离与交付审批保留。执行模型、单决策者切换和连接恢复遵循治理 V2 中保留的最新修订。今后预算若重新设计，应作为独立可选功能；本次不实现。

## 验证

`test/dual-instance.test.ts` 检查数据误用、无预授权的真实模式本地注入、同步 MAIN/DEV Mock 子进程、数据隔离和跨进程项目写入冲突。`desktop/validate-dual-instance.mjs` 使用隔离测试数据和真实 Electron 窗口、正式 IPC/Mock Controller，检查同时启动、独立 Session/Run、历史读取和单实例退出。没有调用真实模型。

TEST 启动：`powershell -NoProfile -File D:\PersonalAgent-worktrees\test\Start-TEST.ps1`。桌面 PersonalAgent TEST 快捷方式使用无控制台启动包装器；不会自动启动任务或更新 DEV。
