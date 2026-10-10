# 后续三项可靠性修复验证

日期：2026-10-10。用户要求继续处理遗留恢复锁、验收启动预检、测试与文档一致性；Work Mode 保留，用户仍在上课。

## 归属与状态

延续 `fix/safe-reliability-v1`，基线 dev `95d5a71f88c4f14a975e3566135a152ea304f536`，工作区 `D:/PersonalAgent/.task-worktrees/safe-reliability-v1`。当前 Codex 会话直接开发；未发起真实模型 Run，不制造 Controller 独立验收记录。源码修复和本地定向回归完成，尚未提交、交付或合并运行版。

## 修改

1. 恢复 guard 保存 PID，以独有 claim 序列化多个新版本恢复者。明确死持有者的 guard/claim 可以回收；活动、无法查询、空或损坏的身份保留。仍使用旧项目锁位置，保持活动项目互斥，不根据锁年龄清理。
2. 新 Run 准备后、模型调用前，按交付相同的文件解析规则预检验收可执行程序与外部路径约束。预检不执行测试、不读取可执行文件内容，失败记录 Run ID。空 tests 仍允许显式人工验收；旧 Run 不迁移。
3. 已报告的六项失败改为明确构造历史快照状态，原有断言保留，没有修改生产 Snapshot 策略。新增新 Run 的有限观察回归：文件实际保留、未跟踪内容不声称进入完整 Diff、verificationScope 明示范围、不创建 task/round baseline 或 snapshot-objects。README 区分当前能力与历史 MVP，并说明预检及恢复限制。

## 最终验证

```text
rtk proxy node node_modules/typescript/bin/tsc -p tsconfig.json
rtk proxy node --test --test-concurrency=1 dist/test/process-stream.test.js dist/test/safe-reliability.test.js dist/test/atomic-replace.test.js dist/test/failure-path.test.js
rtk proxy node --test --test-concurrency=1 --test-name-pattern="legacy snapshot:|snapshot-free Run" dist/test/controller.test.js dist/test/native-agent.test.js
rtk proxy git diff --check
```

编译通过。第一组 20/20 通过；第二组仅执行明确匹配的 7 项，7/7 通过；共 27 项定向本地测试。差异空白检查通过。六项原失败已在正确历史夹具中通过，并非放松原断言或恢复强制 Snapshot。

首次新增新策略断言错误地期望 beforeExecution 为空，实际该兼容字段记录有限 Git/Context 观察摘要。核对 observeWorkspace 后修正为检查摘要格式，同时断言没有全项目内容基线；最终整组复测通过。保留首次 6/7 的事实，不将其归为生产缺陷。

锁测试只使用临时项目对应的专属锁；死 PID 用模拟 ESRCH。实际 PID 查询均 signal=0，不终止进程。历史夹具只使用小型临时 Git 仓库、本地注入 Agent 和后台 Git/Node。未执行整个 controller.test 文件，未运行其中的杀进程测试；未执行大型快照、稀疏文件、压力或 benchmark 用例。

## 边界

- Work Mode、全局交互策略、Hook 均未改动；不宣称 Work Mode 验收完成。
- 未操作用户桌面、鼠标键盘、剪贴板、浏览器或焦点，未启动 Electron、真实模型或用户项目任务。
- 不删除真实项目锁、不迁移或清理历史 Run/Session，不替换 main/dev 源码、产物或正在运行的软件。
- 旧空 guard、损坏身份及 PID 复用仍可能保守阻挡，需要另行检查；不提供任意崩溃自动恢复保证。
- 验收预检不递归证明脚本依赖、内联代码、环境或外部服务可信；旧 Run 仍可能在原交付预检遇到旧配置约束。
- 桌面详情的全量审计读取、带回调的超长单行仍是已知后续优化项。
- 未完成全库回归、GUI 验收、跨版本真实并发验收或 Controller 正式审查交付；本地通过不扩大为整体软件安全保证。

后续遵守正式审查、Controller 验收及交付审批，再在安全时机整合运行版。
