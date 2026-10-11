# 决策者验收与用户最终确认

日期：2026-10-11。执行方：外部 Codex。基线：TEST `c520648`。任务分支：`fix/decision-review-first-20261011`；工作区：`D:/PersonalAgent-worktrees/tasks/decision-review-first-20261011`。采用用户提供的治理规则 V2.1，不更新 DEV/MAIN 实例。

## 修复目标与行为

DEV 原汽车任务的执行结果被 `tests: []` 阻断，没有到达决策者。本次删除 Controller 参与成果验收的判断链。程序仅收集观察信息，决策者自行核查成果、选择验证手段并给出 pass/rework/human/fail，用户再做最终确认。通过或要求人工决定均停在当前任务，只有明确用户确认才记入 completedTaskIds；不会将“继续”识别为验收通过。

配置 tests 作为决策者可参考的命令传入提示词。Controller 不运行这些命令，Diff、Context 和空白告警仅作为观察信息转交；passed=false 表示没有机器测试验收结论。路径、锁、审计完整性、Session 恢复、成果摘要绑定和正式交付授权保持有效。新流程的交付依据决策者报告与用户确认的审计记录，不再自动测试一遍。

## 实际验证

- `rtk npm run build`：通过；包含状态 Schema 导出。
- `rtk npm run check --prefix desktop`、`rtk npm run build --prefix desktop`：通过。构建有既有依赖 use-client 与 chunk-size 提示。
- `node --import ./scripts/regression-policy.mjs --test dist/test/decision-user-acceptance.test.js`：10/10；验证故意失败的配置命令也不执行、空测试、观察告警不自动否决、用户确认、决策者各类结论、旧暂停 Run 不重放、陈旧批准被拒绝及交付审计不可伪造。
- `desktop/out/thread.test.js`：25/25；证据事件不显示 Controller 裁决，原 Mock 场景已更新为等待用户。
- `--test-name-pattern='chat final acceptance' desktop/out/sessions.test.js`：1/1；通过正式 Session/IPC 两次确认任务，无新增 Run 或执行重放。
- 独立真实 Claude/Codex Run：`e9d766c8-220e-4832-a486-fb2b096864ea`。审计包含 plan/execute/review 独立调用，Claude 亲自用 Node 核对文件。它因 Serena 工具副产物与规划标准的差异返回 human，Controller 原样交用户，independent-check 数量为 0，userAccepted=false。该结果证明真实转交顺序，不代表用户已批准小仓库成果，更不是游戏修车验收。

证据位于本任务 `.validation/` 及 `D:/PersonalAgent-data/decision-user-acceptance-20261011-real/`。当前未做可见 Electron GUI 验收，也未恢复或修改 DEV 原汽车 Run。

## 验证范围

以上是新职责契约的定向回归与独立真实小场景验证。旧全量用例中要求 Controller 自动测试、自动否决或自动完成任务的断言与用户的新要求相冲突；不声明旧全量回归通过。后续完整回归需要将这些历史用例迁移到决策者验收和明确用户确认的契约。
