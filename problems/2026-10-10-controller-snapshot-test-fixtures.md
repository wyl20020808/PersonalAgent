# Controller 旧快照测试与新 Run 策略不一致

状态：已报告的六项失败已在局部修复候选中迁移为明确的历史快照测试；尚未交付运行版。下文保留原失败证据，不表示全库回归通过。

## 现象与场景

扩大恢复回归时，`test/controller.test.ts` 的三项测试失败：

- `no change cannot pass`
- `later task cannot pass using previous task diff`
- `test mutating untracked content invalidates evidence`

这些夹具通过 `createRun` 创建新 Run。新 Run 的 `snapshotPolicy=none` 已取消全项目内容扫描和完整变化保证，但以上断言仍按历史快照机制判断无变化、跨任务复用或未跟踪文件内容修改。

## 影响与证据

相关回归不能被宣称为全部通过。2026-10-10 从 dev 基线 `3c32ebb34534da3c566c64a42621a75717cc00c1` 提取未修改的 Controller，使用相同依赖、相同三项测试和本地隔离夹具复查，三项也全部失败。

证据保存在本次修复工作区 `.validation/baseline-controller.log` 与 `.validation/controller-regression.log`。没有使用真实服务，没有读取或改写外部项目运行状态。

## 确认原因与下一步

已确认：失败在修改前基线存在；这三项旧断言要求的保证与 `PROJECT_EXECUTION_CONTRACT.md` 的新 Run 策略不一致。本次不修改这三个测试或快照政策，不将它们记为通过。

建议：后续明确拆分历史快照 Run 的完整变化验收与新 Run 的有限 Git/Context 观察验收。历史能力测试应明确建立历史夹具，新策略测试应覆盖有限观察范围和未验证范围提示，保留人工验收及正式交付审批边界。

## 2026-10-10 长任务通信扩大回归补充

扩大检查 native 执行时，另外三项旧夹具失败：

- native controller includes planning, executor and reviewer modifications and revalidates review
- interrupted native changes survive resume with same thread and task baseline
- repeated CC review modifications are bounded by repair control across recovery

它们分别仍断言新 Run 的未跟踪 plan-note 等文件出现在完整差异、恢复保存 beforeExecution 内容基线，以及由完整内容比较检测重复审查写入。新 Run 的有限观察不提供这些历史快照保证。

把相同测试切换为从原 dev 提取的未修改 Controller 后，三项同样失败，断言差异一致。只使用隔离生成的 dist/test/native-agent-baseline.test.js，不改写原测试。日志 .validation/unlimited-native-baseline.log；扩大回归 .validation/unlimited-controller-compat.log 共 74 项，68 通过、6 失败。此前三项 Controller 失败已另行对照基线。当前六项未修复，不宣称完整回归通过。

## 后续局部修复候选

用户授权继续处理后，上述六项以 `legacy snapshot:` 明确标识，夹具显式采用历史状态（无 snapshotPolicy 字段），原断言全部保留。新增 `snapshot-free Run` 用例确认新策略的有限观察提示、文件保留和未创建内容基线。最终明确过滤的 7/7 通过；恢复锁、预检及此前局部回归 20/20 通过。未跑全库、大型夹具或进程终止测试，未将本地自测称为 Controller 独立验收。详情见 `docs/SAFE_RELIABILITY_FOLLOWUP_V1_VALIDATION.md`；尚未交付运行版。
