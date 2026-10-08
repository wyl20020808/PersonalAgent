# V0.3C.2 原生执行与项目目录底层验收

验证日期：2026 年 10 月 8 日。开发和测试位于独立 Worktree `D:\PersonalAgent-worktrees\v03c2`，未合并主分支，未运行真实付费 Agent，未修改既有游戏工程。

## 执行接口

- `executionMode: native | proposal` 保留原有含义。原生模式直接使用 Agent 原生工具执行，Controller 不重复应用文件提案；旧提案模式仍保留日志及恢复机制。
- 新增可选 `workspaceMode: direct | isolated`。旧配置没有此字段时继续使用原来的干净 Git 克隆隔离流程，历史 Run 和交付证据继续兼容。
- `allowedRepositories` 保留字段名称；显式使用新模式时，其中的授权路径可以是普通目录，不要求 Git。
- 直接开发要求 `directAuthorization: { projectPath, acknowledgedAt }`，路径必须匹配选择目录，时间必须可解析。State 的 `source` 是真实项目路径，`workspace` 是实际执行目录；直接模式二者相同。
- 内部快照、基线、增量差异、恢复记录及测试缓存在 D 盘 runtime；普通项目不新增内部 Git 仓库。新隔离模式对普通目录复制项目文件；对已有真实 Git 仓库执行独立 clone，再覆盖用户当前修改、未跟踪文件和删除状态，保留原生 Git 上下文且不提交。`node_modules` 不复制，不能声称保留依赖安装状态。
- 项目互斥锁位于 `D:\PersonalAgent-data\project-locks`，跨 runtime 防止同项目的直接 Run、恢复与新模式隔离交付互相写入。

## 原生能力

Codex SDK 使用 `danger-full-access`、`approvalPolicy: never`、网络访问及实时 Web 搜索，并新增 `skipGitRepoCheck: true` 支持普通目录。Claude 保持原生工具和 `bypassPermissions`。两者继承本机环境、认证、配置、扩展和默认模型；未用临时 HOME 代替用户配置，也未禁止 Shell、Skills、hooks 或 MCP。

Controller 顺序调度规划、执行及审查。CC 必要的小修复也进入真实文件差异，审查修改后重新进行独立验收。Agent 内部一次调用中的失败命令、调试修复与后续成功不会被误当成整个调用立即失败。预算、Session/Thread 续接、公开工具事件和人工决策流程保留。

这些参数给予本机原生权限，不提供项目目录技术隔离。项目规则是协作约定，无法阻止完整 Shell 权限访问其他目录；尤其文件工作区也不能被宣传为安全沙箱。

## 本地测试

所有 Agent 输出均为本地 Mock 或 SDK/CLI 注入夹具。验收执行了真实 Node 子进程及真实文件读写，未调用模型服务。

- `rtk npm run build`：通过。
- `rtk proxy node --test dist/test/native-agent.test.js`：11/11 通过，覆盖工具权限、失败后修复、CC 规划/审查修改、重复应用拒绝、原生结果恢复、预算限制、原生 CLI/SDK 参数及工具事件。
- `rtk proxy node --test dist/test/project-modes.test.js dist/test/process-stream.test.js`：最终 16/16 通过，其中项目模式 13 项、进程异常 3 项。覆盖两种模式下的空普通目录、已有普通项目及含未提交修改的 Git 项目；真实 Git HEAD、用户修改/未跟踪文件/删除状态保留；CC 审查阶段非法提交后独立复验；显式授权；恢复冲突；跨 runtime 项目锁；隔离交付；没有独立测试时暂停；空文件新增/删除差异；同项目重复原生 Mock Run。
- `rtk proxy node --test dist/test/v03c.test.js`：13/13 通过，覆盖原有流式输出、截图证据、SDK 活动及旧配置兼容。
- `rtk proxy powershell -NoProfile -Command 'npm test *> .validation/v03c2-full-final.log; exit $LASTEXITCODE'`：127/127 通过。此前 hardlink 拒绝诊断兼容问题已修复，未削弱实际拒绝行为。随后补充的原生 Git 上下文、进程管道异常与长路径检查另行执行针对性回归，并由最终集成再次执行全量检查。
- `rtk proxy node --test dist/test/process-stream.test.js`：3/3 通过，stdout/stderr 的 `ENOTCONN` 变成受控失败，过长 Windows cwd 在启动前明确拒绝。
- `rtk proxy claude --help`：本机 CLI 支持现有权限、追加系统提示及 system-prompt-snapshot 参数；仅读取帮助，未调用模型。

自动 Mock 每个任务写入带 Run ID 的标记，并明确注明它仅代表本地 Mock 夹具。最近项目重复打开时确有可核验的新改动；该标记不能作为真实项目功能完成的证据。

## 变更、交付与恢复

直接模式的结果已经写入选定项目。`previewDelivery` 拒绝这种 Run，避免对同一结果再次应用。运行结束、暂停或失败后保存恢复检查点；`restoreProject` 和 `project-restore --checkpoint ... --decision ...` 提供显式恢复接口。恢复前比对检查点与当前全部文件，有外部后续修改则拒绝覆盖，且恢复和另一个 Run 共用项目锁。

隔离模式通过既有 preview/approve/apply API 交付，不建立另一套 Controller。预览记录原项目文件基线、完成证明和批准摘要；预览、批准和写入前都检查冲突，拒绝覆盖运行后新增的用户成果。未批准不会写入源项目。重复应用验证原交付结果。旧 Git 隔离交付仍保留真实 Git HEAD、分支和索引检查。

`tests: []` 可以用于尚无测试的项目，但不会被标记为独立验收通过：Controller 在 verification 阶段暂停，明确要求人工验证。GUI 的项目发现和配置体验属于 V0.3C.3，并由集成验收统一确认。

## 已知限制

1. 文件快照上限为 100 MiB、20,000 个文件，拒绝 symlink、junction、hardlink 和特殊文件。尚不支持超过该限制的项目；这不是无条件支持任意大小目录。
2. 文件快照不包含 `.git`、`node_modules` 或空目录元数据；真实 Git 隔离目录保留独立 clone 的 Git 元数据及 HEAD 基线，普通目录继续保持无 Git。依赖需要在工作区重新安装。旧 Git 隔离配置继续保留旧行为。
3. 自动隔离交付仅支持 UTF-8 文件新增与修改，最多 50 个变更、总内容 2 MiB；二进制结果及删除需要人工处理，不能宣称自动交付成功。直接模式实际二进制写入及删除可以进入文件快照和变更证据，但恢复仍受快照限制。
4. 文件快照保存在本机 runtime，可能包含项目内敏感文件；没有新增加密存储。原生权限下，外部进程和人工编辑无法由协作锁强制阻止；恢复只能拒绝已检测到的检查点后修改，不能提供文件系统事务保证。
5. 没有真实 CC/Codex 服务验收，也没有宣称本机所有扩展均已逐一运行验证。当前证据来自接口参数、注入事件和本地 Mock 的真实开发闭环。
6. 恢复目前提供 Controller API/CLI；普通用户可见的恢复入口及最终 Electron 操作体验须由集成结果单独报告。
7. Windows 子进程当前工作目录限制为 259 个字符，达到 260 个字符时明确拒绝启动，要求缩短项目或 runtime 路径。Git 文件操作启用本次调用的 `core.longpaths`，不能据此宣称 Windows 的任意超长 cwd 均已支持。进程管道发生 `ENOTCONN` 时保留失败和已有文件变更，不以无日志崩溃掩盖异常。
