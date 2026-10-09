# 双实例运行隔离 V1 验证记录

日期：2026-10-09。执行方为独立 Codex 开发会话，基线为 dev `e2d24ffb692c97f6bd6b0149a9136cc63ab2befa`，任务分支为 `feature/dual-instance-runtime-v1`，开发目录为 `D:\PersonalAgent-worktrees\tasks\dual-instance-runtime-v1`。

V1.1 发布作为独立里程碑，已由另一获授权会话完成 main 快进。原 main 标签 `personalagent-before-project-context-v1.1` 指向 `be878bdc5e606a1461ef7085e4b1daa197147084`；发布证据位于 `D:\PersonalAgent-validation\v11-main-release-20261009\PERSONALAGENT_V11_MAIN_RELEASE_REPORT.md`。本任务复核 main/dev 的 SHA 与 tree 一致，没有重做 Project Context 或真实付费回归。

## 本次结果

- Controller 构建、Desktop 构建、Desktop 类型检查通过。lucide-react 的既有 `use client` 警告不阻断构建。
- `node --test dist/test/dual-instance.test.js`：6/6，通过正式 Controller 的缺少共享授权拒绝、CC 历史账本复用不重复扣数、MAIN/DEV 目录误用、6 进程同步并发额度、损坏/遗留锁和跨进程项目冲突检查。
- `node --test dist/test/recovery.test.js`：20/20。测试使用独立持久化共享授权账本，全部 Agent 仍为注入的假 Agent 或故障适配器；没有真实模型调用。
- Delivery 21 项与本地预算 2 项通过。首次组合运行的恢复测试被新增共享预算门禁提前暂停；补充隔离测试授权后，20 项恢复断言全部通过。没有削弱生产门禁。
- `node --test desktop/out/service.test.js desktop/out/unified.test.js`：27/27，通过 DEV 外部可写 runtime 拒绝、显式只读回放、配置、IPC、原审批和直接开发检查。首次 Desktop 全量为 71/72，唯一失败为配置检查提前受预算门禁阻断；门禁移至实际 launch 和 Controller 付费操作前后，该配置检查恢复通过，另新增 1 项 DEV 归属检查。先前另外 46 项 Session/thread 检查全部通过。
- 受影响直接开发、Project Context phase2、双实例和项目模式组合首次 59/61；两项失败为 Windows 长路径的 `fatal: '$GIT_DIR' too big`。在独立短验证目录重新执行项目模式检查，13/13；其他 48 项组合检查已通过。没有修改产品 Git 实现或扩大功能范围。
- `desktop/validate-dual-instance.mjs`：实际同时启动两个 Electron 窗口，标题、侧栏与数据目录分别为 MAIN/DEV；两边各创建隔离本地会话并并行完成正式 Mock Run，Session/Run 不串用。正常退出 MAIN 后 DEV 窗口与 IPC 仍可用。5 个历史 MAIN 会话和关联 Run 可读取，原 profiles/sessions/user-actions 哈希不变。

详细日志与截图保存在 `D:\PersonalAgent-validation\dual-instance-runtime-v1`；失败现场也保留。验证仅操作明确创建的隔离项目、数据和进程。原用户应用未结束，原数据未迁移、覆盖或清理。

这些结果属于开发执行方的自主专项验证和正式 Controller/Mock 流程检查，不冒充新的 Controller 独立全量验收或付费 Agent 验收。用户本次指令已明确授权验证通过后的本地提交、dev 整合及 main 发布；没有远程推送授权。

## 运行约束

共享预算文件固定为 `D:\PersonalAgent-data\global-budget-policy.json`，生产 CLI 与 Desktop 不提供改选私有账本的参数。底层 Controller 函数保留显式测试注入参数，恢复测试在自身 runtime 下使用同一正式预约实现；测试没有操作生产共享预算。若 CC 共享账本恰为既有 Run 的 globalBudget，沿用原预约，避免重复扣数；历史记录不清零。

本次没有新付费额度授权，因此没有初始化生产共享账本。未配置可靠共享授权时，新增付费调用被拒绝；Mock 和历史读取可正常使用。共享账本的损坏、忙锁或异常退出遗留锁均不会静默恢复空额度。

Windows Git 长路径以及原有真实调用观测 PARTIAL 限制仍保留，属于既有非阻断问题。本次正式双实例 Smoke 使用短隔离目录，没有触发长路径错误。
