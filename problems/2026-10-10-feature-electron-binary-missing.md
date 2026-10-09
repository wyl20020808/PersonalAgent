# 新 Worktree 安装依赖后缺少 Electron 可执行文件

- 现象：本次 feature Worktree 执行 `npm ci --no-audit --no-fund` 成功，但 `desktop/node_modules/electron/dist/electron.exe` 和 `path.txt` 不存在；首次实窗检查无法启动。
- 场景：独立 Worktree 的 Desktop UI 自主验收，属于开发环境问题。
- 影响：依赖安装成功不能直接作为 Electron 已就绪的证据。
- 证据：本次目录中 `Test-Path`/`Get-Item` 核查；Playwright 启动报 `The system cannot find the path specified.`。`npm config get ignore-scripts` 为 `false`，`ELECTRON_SKIP_BINARY_DOWNLOAD` 未设置，因此不能断言是禁用 lifecycle scripts 导致。
- 处理：验收脚本增加二进制存在性检查和 `PERSONAL_AGENT_ELECTRON` 参数；本次只读使用本机现有 Electron 44.7.0 可执行文件，加载 feature Worktree 的构建及独立数据目录，没有替换 main/dev 的程序或配置。
- 状态：已绕过，根因待处理。
- 下一步：复查 npm 安装日志和 Electron postinstall 下载状态；不要为验收擅自改动全局 npm 配置。
