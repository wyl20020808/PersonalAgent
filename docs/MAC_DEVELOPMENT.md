# macOS DEV 试用与持续开发

本机任务以 `dev/cd178cb99250192b06996c2c39d33c31fda834bc` 为明确基线，在 `feature/mac-dev-trial-20261015` 独立 Worktree 实施。这是 DEV 全量源码的 Mac 试用适配，不是稳定版发布。原有三种 Agent、多决策者、Controller、项目/会话、流式输出、附件/图片、上下文、历史/用量、调度、监督、恢复、验收与交付入口保留；验证状态见本次验证报告，保留入口不代表全部真实服务已验收。

## 开发环境

要求本机 arm64 Node.js 22+（包含 npm）、Git、Apple Command Line Tools。已有合适工具可直接复用，不复制 Windows 依赖或登录数据。

```sh
# 在独立任务 Worktree 中
./scripts/macos-dev.sh setup
./scripts/macos-dev.sh start
# 开启工具 PATH，使用本机已授权认证；不修改用户 shell 配置
./scripts/macos-dev.sh shell
# shell 中可运行 claude / codex / opencode
```

`setup` 按锁文件安装根目录及 desktop 依赖，显式安装 Electron（当前 Electron npm 包不自动执行安装），依次构建 Controller 与桌面。若 GitHub 下载很慢，可以仅为这次安装设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`；下载由 Electron 包中的校验和核对。不要跳过完整性校验。Node/npm 全局版本不被脚本更改。

独立校验：根目录 `npm run build`、`npm test`；desktop 中 `npm run check`、`npm run build`、`npm test`。DEV 上存在的失败应与同提交对照记录，不应关闭门禁来消除失败。

## 数据与路径

| Windows 约定 | Mac 对应 |
| --- | --- |
| D:/PersonalAgent-data | ~/Library/Application Support/PersonalAgent |
| MAIN/DEV/TEST 运行数据 | 上述根目录下 instances/main、instances/dev、instances/test |
| 全局交互策略 | 上述根目录下 global-interaction-policy.json |
| D 盘任务 Worktree/临时/证据 | 用户选定的 Mac 工作根目录中独立任务 Worktree、临时目录和证据目录 |

本次完整仓库、任务 Worktree 与证据的绝对位置见交付报告。应用包内只读源码与运行依赖，数据放在包外。TEST 为安装包默认实例；可用 `PERSONALAGENT_INSTANCE` 和绝对路径 `PERSONAL_AGENT_DESKTOP_DATA` 明确选择其他独立实例。实例 owner 标记、单实例锁、项目写锁和 Run 恢复逻辑继续生效，不共享可写数据目录。

全局策略缺失默认 work。Agent 不得修改策略；用户可在应用中切换 idle 才执行可见 GUI 验收。切回 work 不停止普通模型推理、开发和后台构建。Hook、系统操作限制与正式交付门禁保持生效。

## 安装与登录

1. 解压 ZIP，将 `PersonalAgent DEV Trial.app` 拖入 Applications 或其他用户可写目录。先退出本试用实例再替换应用，不覆盖正在写入的应用或运行数据。
2. Finder 双击 `.app`；也可终端 `open -a '/完整路径/PersonalAgent DEV Trial.app'`。应用带有原生 Node/npm、Claude Code、Codex、OpenCode V1 与全部桌面功能。
3. 试用包仅 ad-hoc 签名，未 Apple Developer ID 签名或公证。若系统阻止打开，使用 macOS 的“隐私与安全性”确认可信来源后允许打开；不要关闭 Gatekeeper 或删除系统安全策略。
4. 认证使用当前 Mac 用户现有原生 CLI 配置。包内不携带任何凭据。终端进入开发 shell 后执行 `claude auth login`、`codex login` 或 `opencode auth login`，由用户在官方登录流程中授权。不要把 Windows 凭据或整个运行目录复制过来。
5. 仅使用应用包时，可运行其 `Contents/Resources/node/bin/node`，把 `Contents/Resources/node/bin` 和 `Contents/Resources/app/node_modules/.bin` 加到当前终端 PATH，然后执行同样登录命令。Finder 不读取 `.zshrc`；应用显式提供工具路径，不执行用户启动脚本。
6. OpenCode 配置读取本机 `~/.config/opencode/opencode.json`（或显式 `PERSONAL_AGENT_OPENCODE_CONFIG_FILE`），为 Controller 创建私有运行目录和本地服务；不会连接或改写其他 OpenCode 服务。配置中需有有效 provider、model、认证及工具/结构化输出能力，发现成功与真实调用成功分别记录。

## 打包与升级

提交源码后完成两级构建，再执行：

```sh
PERSONAL_AGENT_PACKAGE_OUTPUT='/绝对路径/新输出目录' ./scripts/macos-dev.sh package
```

脚本拒绝带有未提交跟踪文件的构建，记录准确提交和基线；只打包生产依赖及构建资源，不打包仓库历史、用户配置、Run/Session 或开发缓存。产物包括 `.app`、原生架构 ZIP 和 SHA-256 manifest。使用新输出目录，避免覆盖现有产物。默认 ad-hoc 签名；对外分发的 Developer ID 签名、公证应另行完成。

升级前停止任务或到安全暂停节点、退出应用并备份包外运行目录。保留旧 `.app`，将新包放到同一安装位置。首次启动核对历史与恢复；不要只回退应用就声称数据已回滚。Git fetch 与源码升级不自动合并 DEV/MAIN、不推送、不替换活跃实例。
