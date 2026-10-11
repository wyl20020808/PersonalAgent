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

## 最新 TEST 组合验证

最终组合基线为 `9d069b1615440db16a2cb9ce00234d8b163769e5`，保留 TEST 新增的 Claude Code 执行端、模型设置、文件折叠、面板尺寸和 TEST 启动入口。Claude CLI 决策与执行共用事件协议，均按工具结束边界交接；分别保留 Session。合并冲突同时保留取消前未确认 Session 的清理，以及 TEST 的执行 Session 隔离。Claude 执行端只有匹配原调用轮次的引导中断记录并且决策者已应用新计划，才能恢复；未知失败仍需明确人工恢复。

最终验证：根构建、桌面构建与类型检查通过；五个流程文件 59/59 通过，Claude/OpenCode 两个执行文件 21/21 通过；桌面三个领取／编辑测试通过；合并后 offscreen Electron 编辑交互再次通过。Controller 注入代理的引导组合扩展为三种决策端乘三种执行端，共九种，全部通过。外部 Codex 进行了代码核对，不将该核对称为独立模型审查或 Controller 独立验收。

新增真实 Claude Code 决策 / Claude Code 执行验证：Run `8d5cc7a6-e2f9-4698-b5d0-fd213fcab394`，正常工具边界交接 5778 ms，决策与执行 Session 不同，Run 完成、追加需求应用、独立文件检查通过。目录 `.validation/real-handoff-claude-code-claude-code-dd981527-8dc3-475c-9cdf-ba99b40b8e0a`。初始固定计划的限制与前三组相同。

此前 Codex / Claude Code 探针的旧触发器只识别 Codex/OpenCode 命令记录，未投递引导；已明确停止该探针并保留其记录，不能记为引导通过。探针现同时识别隔离命令实际生成的 `partial.txt`，重跑上述 Claude / Claude 组合成功。产品实现未依赖该探针触发器。

用户授权满足本会话成果经测试后合入 TEST 的条件；整合使用正常 Git 历史，TEST 必须干净、无关联写入进程，提交来源可追溯。仅更新 TEST，不推送、不发布、不更新 DEV 或 MAIN。
