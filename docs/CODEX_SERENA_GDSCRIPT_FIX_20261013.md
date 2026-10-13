# GPT 调用 Serena 的 GDScript 语言服务修复

日期：2026-10-13。执行方：外部 Codex 开发会话。任务分支：`fix/codex-serena-20261013`。独立工作区：`D:/PersonalAgent-worktrees/tasks/codex-serena-20261013`。基线：`test@a2d3f95a645320afcb86fa79cc29b08432308c1f`。

## 原因与证据

软件内 GPT 能调用 Serena MCP。DEV 历史 Run `40d0e93a-4787-49cf-a3b0-954f7d79aa2a` 的工具回执明确显示 `get_symbols_overview` 已执行，返回 `gdscript: Could not connect to 127.0.0.1:6008 within 30.0s`。对应 Serena 日志为 `C:/Users/WYL20/.serena/logs/2026-10-13/mcp_20261013-091338_35724.txt`。

Serena 已安装的 GDScript 适配器只连接现有 Godot 编辑器，不会自行启动编辑器；默认连接端口为 6008。调查时该端口无监听；运行中的 Godot 是游戏测试进程，不提供编辑器 LSP。外部 Codex 激活 PersonalAgent 时使用 TypeScript，成功不能代表 GDScript 服务可用。

参考：[Godot 官方命令行文档](https://docs.godotengine.org/en/4.6/tutorials/editor/command_line_tutorial.html) 中的 `--headless`、`--editor`、`--lsp-port` 和 `--recovery-mode`。

## 改动

- GPT 执行者与决策者共用的 `streamingCodex` 在调用前，为明确配置 Serena GDScript 的 Godot 项目准备 headless 编辑器；项目及全局 Serena YAML 的端口设置按项目优先解析。
- 使用 `--recovery-mode` 禁止工具脚本和编辑器插件自动执行，限制帧率，日志写入独立临时文件。会创建 Godot 导入缓存，因此只读讨论不启动该服务。
- 优先使用 `PERSONAL_AGENT_GODOT_EXECUTABLE`，其次 PATH；Windows 可发现既有 `D:/Tools/Godot` 下的 Godot 4 控制台版本。没有引擎时不下载或安装。
- 仅对 `config_version=5` 的 Godot 4 项目启动服务；其他项目不自动选择错误版本或转换。
- 每个端口通过独占租约管理；未知端口或其他调用持有的锁不复用、不接管。调用结束、模型错误及正常中断都清理本次进程树和本次租约；被替换的租约不删除。
- 将 LSP 准备状态及具体故障作为调用上下文传给模型，要求通过实际 Serena 工具结果确认可用性。局部语言服务故障不再泛称 GPT 或整个 Serena 不可用。

## 验证

以下均为开发者自测，不是 Controller 独立验收或真实游戏 Run 验收。现有 DEV 实例及游戏 Run 未被重启、恢复或修改。

1. `rtk npm run build`：退出码 0，类型检查及构建通过。构建生成的无关 schema 文件未纳入提交。
2. `rtk proxy node --import ./scripts/regression-policy.mjs --test dist/test/godot-language-service.test.js dist/test/codex-live.test.js dist/test/native-agent.test.js dist/test/codex-decision-runtime.test.js dist/test/shared-skills.test.js`：34 项通过，退出码 0。
3. 增补清理归属、就绪后中断、只读讨论保护后，重建并复验 GDScript 服务与 App Server 两个测试文件：11 项通过，退出码 0。
4. `rtk proxy node scripts/validate-godot-serena.mjs D:/PersonalAgent-data/codex-serena-20261013/real-1`：真实 GPT 决策 worker 成功通过 Serena 激活 GDScript 并读取 `serena_probe_marker`；执行 worker 收到提供商容量错误，总退出码 1。
5. 同一真实探针的 `real-2`：真实 GPT 执行 worker 成功读取同一函数；决策 worker 收到容量错误。直接 MCP 检查未指定 depth，工具成功但只返回类，探针断言失败。修正探针为 depth=1，没有修改生产代码以掩盖错误，总退出码 1。
6. `rtk proxy node scripts/validate-godot-serena.mjs D:/PersonalAgent-data/codex-serena-20261013/real-3 --mcp-only`：真实 headless Godot、Serena bridge、项目激活与符号读取成功，退出码 0。检查确认 6008 无遗留监听，本次租约已释放。
7. `rtk git diff --check`：退出码 0。

两个真实 GPT worker 已分别成功；未取得同一批次二者同时成功的结果。容量错误原文：`Selected model is at capacity. Please try a different model.`，属于提供商模型可用性，与 GDScript LSP 故障分开记录。

## 集成与边界

首次排查时本地任务分支保留未提交的修复。检查时 TEST 工作区存在未跟踪 `.delivery-locks/`，内容记录 PID 6668；当时锁归属及清理授权未确认，因此暂缓提交和整合。随后处理见下一节。DEV/MAIN 未更新；运行中实例未替换；未推送、发布或进行可见 GUI 验收。

### 后续锁修复

用户随后明确要求修复残留锁。通过文件名 SHA256 反查，锁目标精确匹配 `D:/PersonalAgent-worktrees/test/.validation/v02c-fb06b186-dcc2-45bf-af81-bb955e8a5521/cli/target`，属于交付 CLI 回归测试；该测试交付的 journal 停在 `applying`。两次核验 PID 6668 均不存在。它不是 TEST Git 集成锁，也不代表实际业务项目仍在写入。

根因是旧交付锁保存在源码根 `.delivery-locks/`，进程强制终止不能执行 finally，留下只有 PID 的锁记录。此次将新交付锁移至共享的仓库外运行目录 `D:/PersonalAgent-data/delivery-locks`，记录 target、runId、deliveryId、token 与时间；释放时核对 token，避免删除被替换的锁。显式 resume 时兼容核对旧目录的同一目标锁，仅在有效 PID 明确不存在时回收，活跃、无效和无法确认的所有者仍保留。交付 journal 的 `--resume` 要求与批准检查未改变。

持有共享 TEST Git 集成锁后，对已确认的这一个测试残留锁进行备份归档；原锁与归属证据保存于 `D:/PersonalAgent-data/codex-serena-20261013/lock-recovery`。测试源码、目标文件、Run journal 及业务历史均未清理或重放。TEST Git 工作区已恢复干净。

锁修复后的构建退出码 0。交付、App Server 与 Godot LSP 联合自测首次运行 33 项：32 项通过，新加的锁归属测试因复用已被撤销的批准而失败。产品正确拒绝复用批准，未修改该保护；修正测试为每次重新预览和明确批准后，重建并定向复验该项，退出码 0。覆盖强制终止恢复、旧锁迁移、活跃及无效 PID 保护、被替换租约保护、交付 CLI 与内容冲突保护。

最终内容按用户要求提交并整合本地 TEST；整合证据（提交、合并前后 HEAD、类型检查及目标状态）记录在 `D:/PersonalAgent-data/codex-serena-20261013/integration.json`。Git 集成不更新或重启当前 DEV 实例。

未知外部编辑器即使可能属于同一项目，也不会自动采用。强制结束整个 worker 时可能留下租约；遇到已有租约只报告原因，不擅自清理其他所有者。需要核实其所有者与进程后处理。只读讨论保持不启动会写入缓存的编辑器。
