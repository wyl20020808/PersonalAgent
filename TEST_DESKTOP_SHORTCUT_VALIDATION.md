# TEST 桌面启动入口

用户要求创建 PersonalAgent TEST 桌面快捷方式。原程序仅接受 main/dev，直接创建 test 启动链接会报错。为提供可用入口，本任务新增 test 实例身份、Start-TEST.ps1 和无控制台 Start-TEST.vbs；不修改 DEV/MAIN 运行版本，不自动启动应用。

执行方为外部 Codex，无 PersonalAgent Run。已按当前治理 V2.1 全文接入本任务。基线 TEST `a71d7cc3e2e1fd26cfe0dfea3b4f3e80342266a1`，分支 `feature/test-desktop-shortcut-20261011`，独立工作区 `D:/PersonalAgent-worktrees/tasks/test-desktop-shortcut-20261011`。

TEST 默认业务目录为 `D:/PersonalAgent-data/instances/test`。Electron 状态、Session/Run、Controller runtime、日志、缓存、临时目录和 OpenCode discovery runtime 使用独立 TEST 目录；拒绝 MAIN/DEV 默认业务目录及不同实例的 ownership 标记。窗口标题和 overview 身份由 test 自动显示 TEST。原生产写入门禁保留，错误消息按实际实例标注。

检查通过：根目录 npm run build、desktop npm run check/build、dual-instance 7/7 定向测试、desktop MAIN/DEV ownership 2/2 回归、validate-test-runtime.mjs 的 TEST 身份/自有 runtime/外部 runtime 只读/跨实例拒绝检查、PowerShell 启动脚本语法解析和 git diff --check。三进程 Mock 为 headless 测试，不是实际三 Electron 窗口验收；未调用付费模型。无可用 Serena 语言服务器，使用定向文本查询。

桌面链接计划为 `PersonalAgent TEST.lnk`，目标 wscript.exe，参数为 TEST Worktree 的 Start-TEST.vbs，工作目录为 TEST Worktree。保存后重新读取目标、参数、工作目录核验。源码使用共享 Git common directory 集成锁整合本地 TEST；构建后再创建链接。真实 Electron 打开与完整三实例 GUI 共存验收 pending，不自动打开应用。
