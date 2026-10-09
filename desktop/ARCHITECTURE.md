# V0.3A 桌面适配架构

Electron 主进程通过正式 createRun 创建状态，随后以 Windows 原生 Node 运行现有 CLI resume。它不执行另一份 drive，也不重写规划、依赖、预算、验收、返工或恢复逻辑。停止通过现有 stop.request 检查点；用户主动“暂停 / 停止”保留为 Controller 的 stopped 状态，之后提交明确决策恢复。Controller 的 ASK_HUMAN 等暂停继续显示 paused。

交付直接调用现有 previewDelivery、approveDelivery、applyDelivery、deliveryStatus。GUI 对绑定字段进行展示，正式 Controller 再进行内容、规则摘要、目标仓库和审批校验。批准与应用是不同 IPC 操作，各自需要用户触发与原生确认。

Renderer 使用 React、TypeScript、Lucide，通过 sandbox preload 暴露的唯一 invoke 请求白名单访问主进程。每种操作有独立 JSON Schema，禁止额外字段、任意命令、任意文件读取、路径型 Run ID。主进程核验 IPC sender、mainFrame 和精确应用 URL；禁用 Node integration、webview、窗口打开、外部导航和权限请求，启用 contextIsolation、sandbox、webSecurity 与 CSP。静态资源仅由 personalagent://app 的限定目录提供。

用户通过 Windows 文件选择器导入 D 盘可信 Controller JSON，原生确认后注册文件摘要。配置变化必须重新导入，不能静默接受新命令或新预算。GUI 表单只能下调上限，不能编辑验收命令。历史 CafeGame 配置默认只读，不延长之前的授权。真实开始需 Renderer 明确确认和 Windows 原生授权；恢复保留原预算并再次明确提示真实消耗。本阶段验收不触发真实服务。

GUI 数据默认 D:\PersonalAgent\.desktop-data，Electron session、日志、crash dump、临时文件、配置注册表均在该目录。PERSONAL_AGENT_DESKTOP_DATA 可在启动前指定其他 D 盘目录，用于隔离验证。Agent 数据仍使用各可信配置原有 runtimeDir。认证文件不读取进 Renderer，仅检测安装存在性；服务认证和额度是否有效不能通过本地存在性推断。

轮询读取真实 state.json，每 1.5–2 秒刷新。日志只展示审计链验证后的字段，Diff 和测试输出做敏感字段隐藏；不渲染任意 HTML。配置、服务和审计错误均真实显示。关闭活跃窗口先请求安全停止，Controller 的持久化和恢复机制负责处理未完成调用。

同一 Run 的交付查询、预览、批准和应用在适配层排队，避免自动刷新与用户操作争抢正式 Run 锁；Controller 锁保持有效，其他进程的冲突仍由 Controller 拒绝。停止请求单独记录于 GUI `user-actions.jsonl`，不与运行中的 Controller 并发追加同一审计链。

本次实窗测试还修复了两个原 Controller 缺陷：HTTP 状态码分类必须使用数字词边界，避免 UUID 中的 401/403/429 误分类；Windows 原子 JSON 替换遇到短暂 EPERM/EACCES/EBUSY 时最多重试五次、累计等待 300ms，保留 rename 原子替换，不删除目标、不降级为覆盖写入。持续失败保留现场并停止，不重试 Agent 调用。

参考：[Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)、[contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge)。

## V0.3C 活动、消息与证据适配

`thread.ts` 将已验证审计链投影为统一群聊消息，以审计哈希作为稳定 ID，保留时间、Run、任务、轮次与源记录。前端分页读取、合并去重并定期核对完整快照，避免同毫秒或时间回拨导致新增记录落到游标之前而遗漏。运行阶段、预算、返工和交付仍由原 Controller 决定。大规模历史尚未采用增量文件索引，这是性能上的已知限制。

`telemetry.ts` 只保留 CLI/SDK 公开事件，排除 Claude thinking/signature 块；公开输出脱敏，事件键仅保存 SHA-256，每调用最多保留 120 条公开活动，超限明确记录。稳定键和上限从持久化审计恢复。阶段、最终提案、独立测试与审查的正式证据不受该展示上限影响。`claudeStreaming` 为可选配置，最终 result 仍使用原 JSON Schema；工具、MCP、hooks 和权限开关不放宽。

新增 IPC 仅为 `thread`、`note`、`pictures`；`resume` 增加受校验的 intent 与截图 ID。补充需求保存在 GUI 数据目录的 notes JSON，不向运行中的 Controller 追加审计或修改 feedback。正式决策仍由 CLI resume 记录 human-decision；GUI 额外保存用途、图片 ID 和脱敏说明。原生真实恢复确认、单独交付批准和应用保持有效。

`screenshots.ts` 从可信外部测试脚本确定截图根，拒绝工作区、其他路径和文件链接，核验 PNG 尺寸、大小与 SHA-256。新 Run 的截图元数据随独立验收保存；旧 Run 首次导入仅写 GUI evidence 缓存，明确标注历史来源，后续替换失效。图片通过限定 profile/run/image ID 的 `personalagent://app/evidence/…png` 提供，每次读取重新检查路径与哈希。没有任意文件 API，也没有给 Claude 开放截图工具。当前 imagesToClaude 固定为 false，人工视觉确认是正式回退路径。
