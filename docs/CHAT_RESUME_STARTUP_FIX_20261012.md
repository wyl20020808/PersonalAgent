# 聊天继续未恢复与模型容量重试修复

## 现场与原因

2026-10-12，DEV 的 ConjoinedTwins Session `5182a79e-c85b-408a-b763-06dfbeecda56`、Run `a95c93e3-d954-4bb6-abe6-fddb96abbdf2` 在暂停后收到两次“继续”。聊天正确选择 resume，消息却被标记为 executed，而 Controller 子进程日志显示 `ERR_MODULE_NOT_FOUND: Cannot find package 'ajv'`，实际未进入恢复流程。启动派发未检查 CLI 的运行依赖，是本次误报的直接原因。现场依赖随后重新可用，原 Run 已保留原 Session 恢复并完成决策者验收；没有创建替代 Run。

另一个触发暂停的真实错误是 `Selected model is at capacity`。已有 TEST 五次额外重试修复 `cb2a41e` 当时不在运行中的 DEV，且其错误分类仍未识别这条容量错误；仅合入旧修复不足以覆盖现场。

## 修改范围

- 在新建和恢复 Run 之前，通过本实例 Node 执行 CLI `--help` 检查导入依赖；超时、启动错误、非零退出均明确反馈“Controller 未启动”。检查不调用模型，不创建任务、不修改原 Run。
- 检查失败交由已有聊天失败记录机制处理，保持 Run 状态和线程，依赖修复后再次“继续”恢复同一 Run。
- 将模型 at capacity 归类为 transport，复用既有同 Session 有界重试；订阅额度及认证分类、未知工具状态保护仍按原规则处理。

该检查覆盖本次缺失导入依赖故障，不保证检查完成之后发生的任意异步子进程故障都能同步反馈。

## 验证

独立工作树基线：TEST `01c40d25a1be8a1b8d375b3a32f99098a3ee71f1`。

- 根工程 build、desktop build、desktop check：通过。
- transport-recovery：17/17 通过，包含容量不足五次额外重试、保留线程和额度优先分类。
- desktop service、sessions、unified：90/90 通过，包含真实 Node 缺失模块启动失败，以及失败后同 Run 再次继续。
- `git diff --check`：通过。

上述为本地回归与原 Run 恢复证据，不代表修复版本已经完成可见 GUI 验收，也不代表模型服务容量故障已被真实在线重试验证。

## 集成边界

按用户要求先修复 TEST，再交付 DEV。用户提示另一个会话正在执行 TEST → DEV，因此本会话不替换 DEV 构建、不重启 DEV、不同时写入 DEV；应在其交接完成后按当前实际提交核对修复是否包含。MAIN、远程推送不在本次范围。
