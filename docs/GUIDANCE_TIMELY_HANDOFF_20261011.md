# 中途引导及时交接验证记录

日期：2026-10-11。任务：`prompt-steering-immediate-20261011`。执行者：外部 Codex 开发会话。

基线：TEST 明确提交 `cfc8271`；分支：`fix/prompt-steering-immediate-20261011`；独立工作区：`D:/PersonalAgent-worktrees/tasks/prompt-steering-immediate-20261011`。未修改 MAIN、DEV 或 TEST 集成工作区源码，未提交、合并或发布。

## 问题与最终行为

原 Controller 只在执行完成、独立验证和 Review 通过后领取引导。命令完成事件只是观察信息，不能促使 Controller 接管，返工还会继续推迟交接。因此“已引导”实际表示消息仍在排队。

最终链路是：用户点击引导 → Controller 在调用边界接管 → 决策者结合原目标、追加需求和已有成果重新规划 → 执行者继续剩余工作。没有把用户引导直接注入执行者。

Controller 每 250 毫秒检查消息。没有活动工具时立即开始交接；有活动工具时优先等工具或独立验证命令完成。持续没有边界时，55 秒触发受控取消；必须等待旧调用退出，确认 OpenCode 远端空闲，才能调用决策者。远端清理未确认则保留现场并暂停，禁止并行写入。

一分钟目标指开始介入与交接，不保证模型在一分钟内完成新计划。长命令可能被受控取消；已有修改和 Session 保留，但中途结果不能视为验收通过。决策者需检查已有工作，不能重复已执行操作。明确停止优先于引导。

多个追加消息按顺序交给决策者；调整期间的新消息也能再次介入。附件继续按用户材料处理，不获得系统指令权限。界面区分“发送中”和“决策者处理中”。

## 适配与验证

决策者支持 Claude Code、Codex、OpenCode；执行者支持项目当前已有的 Codex、OpenCode。六种组合的 Controller 测试使用本地注入代理，不能当作六组真实模型验收。

- 根项目 `npm run build`：通过。
- 桌面 `npm run check`、`npm run build`：通过；构建有既有 Vite 提示。
- 七个适配与恢复相关测试文件：120/120 通过。
- 最终源码五个相关文件测试：69/69 通过。
- 最后新增独立验证期间引导用例后，`guidance-handoff.test`：10/10 通过，包括六组合、超时取消、清理失败、停止优先、连续消息和验证命令交接。
- `git diff --check`：通过。构建产生但与本任务无关的 schema 漂移已恢复。

真实探针脚本：`scripts/verify-guidance-handoff-real.mjs`。通过正式 `createRun` / `drive` 和真实后端调用，在隔离仓库内执行。初始计划固定，后续调整、执行和 Review 为真实调用；独立文件验证检查原命令只运行一次、已有文件保留、结果符合新需求。探针不替代整套产品验收。

| 决策者 / 执行者 | 引导到交接 | Run | 证据目录（工作区相对路径） |
| --- | --- | --- | --- |
| Claude Code / Codex | 6003 ms | `9dc1e053-e46d-4b6e-a431-d14ae6d98149` | `.validation/real-handoff-claude-code-codex-187bd22a-2fc5-4885-8324-53496264ba62` |
| OpenCode / Codex | 6209 ms | `72af97c9-453b-4960-aa66-496bfa090306` | `.validation/real-handoff-opencode-codex-264f22a4-adce-404e-bc1f-d02f918dfcc8` |
| Codex / OpenCode | 7021 ms | `75ca719d-c73d-4b6a-8143-e55ffcc4fb79` | `.validation/real-handoff-codex-opencode-910af5f2-bf70-4530-be08-c4f1bca0741c` |

三组均为正常命令边界交接，未触发强制超时；Run 完成，追加需求已应用，独立文件检查通过。各目录的 `evidence.json` 记录 Session、Run、时序与验证结果。早期直接向 Codex 注入消息的实验已撤销，其探针记录不属于最终实现证据。

最终源码加入独立验证进程边界后，再次运行 Claude Code / Codex 真实探针：Run `bfccbae4-7694-46ab-b6e2-96b03f5f8ae5`，正常边界交接 5911 ms，Run 完成，独立文件检查通过。证据目录为 `.validation/real-handoff-claude-code-codex-17a20ef5-3e09-4630-a57d-bb30f9741518`。另外两组真实探针在此前运行；最终新增路径由 69 项回归和 10 项交接测试覆盖。

## 交付状态

用户随后追加排队消息编辑需求，并明确授权“做完这个任务之后，测试完之后就可以合入 Test”。该授权覆盖本会话的及时引导修复与排队消息编辑，不覆盖 DEV、MAIN、推送或发布。

队列右侧“⋯”使用原生浮层菜单，避免被队列滚动容器裁切；点击“编辑”在原卡片内打开文本框，支持保存、取消、Escape 取消、Ctrl/Cmd+Enter 保存。主输入框草稿和原消息附件保留。保存失败保留编辑内容；后端已领取的消息拒绝修改。保存尚未领取的引导会撤回旧内容并恢复为普通排队消息，用户可再次点击引导。

`node desktop/verify-queued-edit.mjs` 使用生产 React 组件、明确标注的桥接数据，在独立用户数据目录的 offscreen Electron 窗口验证菜单可见、取消、空白禁止保存、保存失败保留内容、保存成功、主草稿与附件保留、不新增消息、Escape 取消。全部通过；这是实际渲染与交互检查，数据桥为 fixture，没有 Agent 调用，不是完整产品 GUI 验收。记录在 `.validation/queued-edit-ui/evidence.json`。桌面类型检查和构建通过；三个队列／领取／编辑冲突后端测试通过。

外部开发会话按上述明确用户授权进行 Git 集成，不制造 PersonalAgent 业务 Run 或 Controller 独立验收记录。TEST 当前有后续更新，须先整合并验证最终组合，再交付 TEST。正在运行的 DEV 保持不变。
