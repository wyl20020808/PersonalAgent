# OpenCode 证书校验错误的有限自动恢复

日期：2026-10-12。执行方：外部 Codex 开发会话。任务分支：`fix/certificate-transport-recovery-20261012`。独立 Worktree：`D:/PersonalAgent-worktrees/tasks/certificate-transport-recovery-20261012`。

基线为本地 TEST 的明确提交 `f60f95cad319641d5b4f6dc690e7b2e4e87dba5b`。按用户提供及工作树中的治理规则 V2.1，满足检查和互斥条件后自主提交并集成本地 TEST；DEV/MAIN、远程推送和运行实例更新不在本次交付范围。

## 问题与变更

实际 OpenCode 调用返回 `UnknownError: unknown certificate verification error` 时，原分类回退为执行者或审查者错误，未进入自动连接恢复。现将精确错误文本（大小写不敏感）归为 `transport`，复用现有恢复机制。

默认最多自动重试五次，基础等待为 5、15、30、45、60 秒，保留原有随机抖动及配置覆盖。继续沿用确认归属的原 Session，保留已有产物、调用记录及业务计数；持续失败则记录耗尽并暂停，重启不会自动重开恢复窗口。

未关闭 TLS 校验，未修改代理、CA、认证或 OpenCode 运行环境。未泛化匹配所有证书错误。认证、额度、安全、工具结果未知及显式失败类型的分类优先级保持不变；执行服务退出和工具结果未确认时仍不能自动重试。

## 验证

- `npm run build`：退出码 0，TypeScript 编译及 schema 导出通过。
- `node --test dist/test/transport-recovery.test.js dist/test/opencode-execution-agent.test.js dist/test/opencode-transport.test.js dist/test/opencode-compatibility.test.js dist/test/opencode-runtime-crash.test.js`：退出码 0，53/53 通过。
- `git diff --check`：退出码 0。
- 审查范围：生产代码仅修改错误分类的一处匹配；现有恢复、Session 归属、有限重试、未知工具保护和 TLS 配置均复用原实现。

新增确定性测试覆盖：精确错误分类；执行和审查恢复成功；部分产物保留；原 Session 复用；五次恢复耗尽及重启阻止再次派发；认证、额度和安全分类优先级；其他未知及证书错误不扩大匹配范围。OpenCode SDK 与本地 HTTP 故障注入还覆盖真实适配器的执行和审查路径，以及未知工具结果禁止重试。

这些是开发者自测及本地故障注入，不是远端真实证书故障复现，也不冒充独立决策者或用户验收。远端 TLS 故障的具体诱因未在本任务中修复。未恢复或改写此前三个真实 Run，未替换运行中的 DEV/TEST 实例，未做 GUI 验收。

## 本地集成证据

TEST 集成通过 Git common directory 下的 `personalagent-test-integration.lock` 互斥执行，持锁重新核对 TEST 提交、干净状态及未完成 Git 操作。若基线前进，先在独立任务工作树整合并验证最终组合；合并后再次运行新增证书恢复测试。

集成前后 TEST 提交、任务提交、检查输出与运行边界保存在 `D:/PersonalAgent-data/validation/certificate-test-integration-20261012.json`。该记录由实际集成步骤生成；如记录缺失，不代表已经完成集成。
