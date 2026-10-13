# Work/Idle 延后节点文档仍描述已移除的 Controller 调度

- 归属：PersonalAgent。状态：待处理。优先级：P2，契约与兼容维护问题。来源：用户要求复核外部审查。
- 复核基线：TEST `a2d3f95`。
- 已确认事实：`docs/GLOBAL_WORK_IDLE_MODE_V1.md:48-50` 仍描述 Controller 登记 `deferredTaskIds`、跳过 pending 节点继续独立任务、idle 后从延后节点 verify 恢复。全库定向搜索仅发现字段声明/schema、`src/controller.ts:210-214` 恢复读取、`src/automatic-supervision.ts:20` 阻挡读取、`src/decision-acceptance.ts:31` 移除条目及测试断言；没有新延后任务的入队写入。
- 历史证据：`git show bef844b -- src/controller.ts` 显示旧的入队与 `task-acceptance-pending` 分支被有意移除。当前 AGENTS.md、统一规则及治理补充改为由决策者自主验收，不由 Controller 固定检查否决 pass。
- 定性修正：确认文档与实现不一致；不能据此认定应直接恢复旧 Controller 验收机制。保留读取分支可能是历史状态兼容，并非所有相关代码都是死代码。
- 当前行为证据：`test/interaction-policy.test.ts:97-103` 用决策者 human 表达 GUI 延后，Run 保持 paused，未自动登记 deferredTaskIds；`src/controller.ts:377-380` 根据 pass/human 分别推进或暂停。GUI 未验证仍不能虚报 PASS。
- 影响：按旧文档预期的独立节点调度和自动登记在新 Run 中不可依赖；历史 deferred 状态及监督阻断的兼容意图不清楚。
- 下一步：按最新决策者自主验收契约修订说明，明确 pending GUI 的证据、恢复责任与依赖节点行为；若仍要求显式延后节点调度，需重新设计并验收，不能把移除旧代码简单当成恢复需求。删除历史兼容分支前先验证旧 Run。
- 验证边界：静态代码、历史 diff、现有夹具核对；没有真实 work/idle GUI 验收。
