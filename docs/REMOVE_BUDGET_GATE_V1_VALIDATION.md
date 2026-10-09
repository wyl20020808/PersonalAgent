# 移除内部付费预算门槛 V1 验证记录

日期：2026-10-09。开发基线为最新 dev `d51985e2dcd6bee9fc3f1ef9c1525f34273905c2`，任务分支为 `feature/remove-budget-gate-v1`，唯一源码开发目录为 `D:\PersonalAgent-worktrees\tasks\remove-budget-gate-v1`。本任务由当前 Codex 开发会话执行，未通过 MAIN/DEV 发起付费 Agent Run。

用户本次明确授权移除内部付费预算保护、验证后本地提交，以及在实例空闲安全退出时依次快进 dev/main 并恢复启动。该指令覆盖旧规则中的预算预授权要求和一般禁止自行提交、合并的约束；远程推送、其他发布、历史数据修改均未获授权。正式产品的 Delivery Preview / Approve / Apply 人工审批保持不变。

## 实现

- 删除 Controller 的共享授权预约、真实调用前 CC 额度检查，以及共享和全局付费预算实现、初始化脚本。
- CC 调用计数移至 `agent-usage.ts`，保留派发前持久化计数和审计，不预约、不核验余额。Codex 原生配置、工具权限及观测记录保持原流程。
- Desktop 删除付费确认、额度追加入口、CC 上限输入及预算余额对返工按钮的拦截。真实 Run 可以省略付费额度和预授权字段；Session 后续 Run 不扣减累计余额，执行轮数按每 Run 的流程配置控制。
- 保留历史预算配置字段及文件；缺失或损坏的旧账本不阻止历史展示、创建 Run 或模型派发。没有伪造无限余额，也没有用极大数值代替原门槛。
- 保留任务执行轮数、每任务返工、超时、暂停、取消、恢复、项目写入锁与实例隔离。新增兼容的 `reviewRepairs` 可选计数，为 CC 修改后的复验循环提供独立防循环控制；至少允许一次小修复后复验，超限暂停并记录当前独立验收证据。
- 删除 CLI 的付费额度追加参数。运行文档和治理文件记录用户明确批准的预算策略修订；其他交付和数据保护权限不扩大。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| `rtk npm run build` | 通过 |
| `rtk proxy node --test dist/test/*.test.js` | 254/254，通过；0 失败、0 跳过 |
| 受影响预算、适配器、双实例、Context 审查、项目模式、流程契约专项 | 47/47，通过 |
| `rtk npm --prefix desktop run check` | 通过 |
| `rtk npm --prefix desktop run build` | 通过；仅已有 lucide-react 的 `use client` 打包警告 |
| Desktop service/thread/unified/sessions 回归 | 71/71，通过；0 失败、0 跳过 |
| `rtk proxy git diff --cached --check` | 通过 |
| 隔离 Electron 启动及界面检查 | 通过，独立测试数据目录，没有创建真实 Run |

所有验证均使用 Mock 或本地注入，不调用真实付费 Claude Code/Codex。真实模式注入覆盖完整 Plan / Execute / Review；CC/Codex 的认证失败、HTTP 429、订阅用量耗尽仍返回原错误分类与消息。同步 MAIN/DEV 子进程完成不同项目的 Mock 任务，同一规范化工作区的跨进程写入竞争仍被拒绝。测试检查旧额度耗尽、缺失、损坏及遗留预算锁不阻止新 Run，且历史账本内容未被改写。

第一次回归中的旧预算断言及审查复验边界失败已修复；最终结果来自重建后完整回归，未通过跳过断言掩盖失败。以上属于开发执行方自主验证和正式 Controller 的本地夹具流程，不冒充真实付费 Agent 验收或另一次双 Agent 独立验收。

## 历史和安全更新检查

只读检查 MAIN 的 5 个 Session、3 个 Run、1082 条审计记录全部可读；旧 Run 未提供 Token 观测事件，统计保持未知，没有补造。DEV 尚无历史 Run。检查时两实例均无活跃 Run 锁或未完成 Run，且没有运行中的 Electron 实例；历史目录、Session、Run、账本、凭据及审计未删除或迁移。

全量日志与隔离界面截图保留在任务 Worktree 的 `.validation/remove-budget-v1` 和 `.validation/budget-gui-1791550701676`。最终 SHA、快进和双实例恢复结果由交付报告记录。更新前须再次检查进程、目标项目写入锁、分支 HEAD 与用户修改；若出现冲突则停在已提交 feature，禁止强制结束用户进程。
