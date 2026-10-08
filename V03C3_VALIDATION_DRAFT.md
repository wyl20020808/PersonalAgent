# PersonalAgent V0.3C.3 并行 GUI 阶段验证

本文件记录独立 Worktree 中的 GUI 成果。最终验收报告由集成阶段的 `V03C3_VALIDATION.md` 提供；实际 Electron 截图和全部 Controller 回归必须在该阶段补齐，不能把界面演示视为底层完成。

## 用户操作流程

1. 打开新建任务，点击“选择项目文件夹”，使用 Windows 原生文件夹选择器选择已有项目或创建空文件夹。
2. 输入自然语言开发目标。
3. 默认使用 Mock、直接开发。界面明确说明 Mock 只生成 `hello.txt`、`done.txt` 和每次 Run 的 `mock-result` 标记，不执行实际付费开发目标。
4. 点击“开始开发”。首次直接开发需在原生对话框中授权修改所选目录；真实模式还需勾选额度确认并在原生对话框中再次确认。
5. 启动后进入已有项目群聊；进展、任务和测试证据仍来自同一个 Controller。
6. 项目设置、目录授权和最近项目保存在 PersonalAgent 的 D 盘数据目录，重启后可再次选择最近项目。无需填写 JSON 或执行 Git 命令。

高级设置提供 Mock/真实、直接/隔离、调用次数和返工限制、Mock 场景以及独立测试命令选择。高级配置导入仍在设置页面保留。模型使用本机 Claude Code/Codex 默认模型，本阶段没有实现 GUI 模型覆盖。

## 已实现的 GUI 契约

自动配置使用 `executionMode: native`、`workspaceMode: direct|isolated`、真实 `allowedRepositories` 项目路径以及匹配路径的 `directAuthorization`。项目目录允许任意盘符，运行状态及快照继续存放在 D 盘。旧配置缺少 `workspaceMode` 时保留旧隔离语义。直接开发显示已写入目录的变更和证据，不显示再次应用交付流程。

项目检测仅读取顶层文件和 manifest，不执行脚本。Node 的 test/test:*、build/build:* 与 Python/Rust 标准命令显示为建议。只有用户在高级设置中明确选定并通过本次真实执行授权的测试才进入配置；缺少测试时明确说明需要人工验收。项目规则不构成原生 Shell 的技术隔离。

配置按每次 Run 保存，不覆盖历史配置；每份配置拥有独立 runtime，避免最近项目启动后重复枚举历史 Run。Mock 遇到内容不同的已有 marker 文件会拒绝覆盖。

## 并行阶段实际验证

- Controller 本地构建通过。
- Desktop TypeScript 检查通过。
- Desktop Vite/Electron 构建通过；lucide-react 有既有 `use client` 打包提示。
- 全部 30 项 service/thread 回归通过（含新增 2 项），测试已改为从本 Worktree 推导 Controller 路径，未调用主目录构建成果。
- 新增普通项目只读检测、首次直接授权、真实付费授权与 Mock marker 保护测试。
- 借入 V0.3C.2 稳定执行接口后再次构建并通过全部 31 项 GUI service/thread 测试。新增完整 `startProject` 闭环实际运行非 Git 已有项目的直接与隔离 Mock，验证原文件保留、未初始化 Git、真实工作目录、每 Run 独立变更文件、直接模式拒绝重复交付，以及重启后项目设置和授权恢复。

测试 fixtures 均位于本 Worktree 专用 `.v3c3` 目录。没有调用真实付费 Agent，没有修改既有游戏工程。测试初次失败发现 Windows Git 长路径问题，缩短专用 fixture 路径后既有回归全部通过。

## 集成阶段待验证

普通空目录和含未提交修改的 Git 项目的实际 Electron 操作、普通目录隔离交付、窗口重启最近项目恢复、完整新建任务 GUI 闭环、实际 Electron 截图和全部 Controller 回归。服务层已有项目直接与隔离闭环及重启恢复已实测通过，窗口操作仍需独立验收。
