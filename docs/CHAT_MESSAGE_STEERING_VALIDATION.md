# 消息队列与不中断引导验收

日期：2026-10-11。基线：DEV `d2fe3e67ee911c816070afca5010fcc6f76213a9`。
开发分支：`feature/chat-message-steering-20261011`。
工作区：`D:/PersonalAgent-worktrees/tasks/chat-message-steering-20261011`。

## 最终行为

- 执行期间普通发送进入消息队列，当前 Run 完成后按现有桌面调度逻辑处理。
- 点击“引导”将消息及其已验证图片、文件字节投递到当前会话拥有的 Run，不发 stop、不 abort 当前调用。
- Controller 在当前小任务的独立检查与 Review 通过后认领输入。需要返工时先完成返工；显式返工上限仍生效。
- 决策者调整剩余计划，已验收任务和成果保留；再次修改已完成成果需使用新任务 ID。随后原 Run 和执行 Session 继续。
- 多条引导按投递序号顺序处理，同毫秒点击仍保序。未认领消息支持删除、修改；认领后不允许撤回。修改先撤回原输入，再回队列。
- 中断、需要人工决策时保留输入和 Session，不自动重放；须明确恢复。损坏附件在认领前拒绝，仍可删除该消息后恢复。
- 队列位于输入框上方，每条单行截断，图片缩略图可预览、文件名可见。实测行高 30px，上下内边距各 2px，缩略图 24px。清除了更多菜单继承的全局上边距。当前为上下排列的独立行，尚未实现 Codex 卡片重叠视觉。

## 验证及证据

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| 根项目 TypeScript/Schema 构建 | 通过 | `npm run build` |
| 桌面 TypeScript 与生产构建 | 通过；lucide use-client 构建提示未影响退出码 | `desktop/npm run check`、`npm run build` |
| 桌面现有及新增测试 | 105/105 通过 | `npm test` 串行运行，新增会话引导、图片文件、撤回及投影检查 |
| Controller、决策讨论、决策适配回归 | 57/57 通过 | `.validation/steering-regression-final.log` |
| 最终引导专项 | 10/10 通过 | `.validation/steering-final.log`；包括返工、上限、同时间排序、损坏附件、完成后追加、恢复、真实原生输入序列化 |
| 首轮选择性组合 | 103/107；4 项旧 Direct 断言失败 | 包含 Controller/Direct/决策/多模态/恢复/引导；不是全库回归 |
| 干净 DEV 基线 Direct 对照 | 6/10；相同 4 项失败 | `.validation/steering-baseline-direct.log`；未修改 DEV 工作区 |
| 隔离 headless UI | 通过 | `.validation/steering-ui/result.json`；实测三行均 30px，预览、引导、删除、修改、发送、窄窗口，无页面异常 |
| 原生 Claude Code 代码 Review | 初次 180 秒超时，保留 Session 后续接；发现 5 项，修复后复核 findings=[] | `D:/PersonalAgent-validation/chat-message-steering-review-20261011/6aa17799-a122-4b4b-9254-8fcb02a8fd79/review-initial.json` 与 `result.json`；代码 Review 只读，未代替独立测试 |

真实 Controller 功能验收另存于：
`D:/PersonalAgent-validation/chat-message-steering-20261011/971e37c3-e657-4926-a5fb-95a0f0c56b38/result.json`。
Run：`d169e40f-2821-45d2-bb33-76b12a99cfb2`。使用正式 `createRun`、`drive`、`RealAgents`，真实 Claude Code 规划/审查和 Codex 原生执行；当前 first Execute 活跃时发送 PNG 与需求文件。独立脚本核验 `first.txt=FIRST\n`，最终 `final.txt=STEERED\n`，任务为 first、adjusted-final，loops=2。Run completed、引导 applied、独立验收通过。两次 Execute 保持同一 Codex Thread，Claude Code 使用独立 Decision Session。此验收先于最终边界修复；后续修复通过专项测试和原生代码复核，未重复调用收费功能验收。

## 限制与交付状态

未跑全库或禁止的大型 Snapshot/压力夹具；没有用户桌面 GUI 验收。截图来自真实组件和隔离示例数据，不能充当真实 Agent 运行截图。没有声称远程后端或所有模型组合均通过。

历史引导附件保留在当前 Run，后续原生调用会继续携带并按摘要去重；长对话可能增加上下文用量。完整性错误按原有附件规则暂停，不覆盖或修复历史字节。

未提交、合并、推送，未更新 MAIN/DEV 运行版本或全局策略。源码成果仍在独立工作区，正式 Controller 交付审批和 DEV 整合未执行。截图：`.validation/steering-ui/queue-rows.png`、`queue-desktop.png`、`queue-compact.png`。
