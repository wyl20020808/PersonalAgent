# 连接恢复修复验证

日期：2026-10-11。开发基线：dev `d2fe3e6`。修复分支：`fix/transport-recovery-20261011`。工作目录：`D:/PersonalAgent-worktrees/tasks/transport-recovery-20261011`。开发会话为 Codex Desktop；真实验收 Run 使用本修复编译的 PersonalAgent Controller。

## 实现

- Codex 执行和决策消费流不再因非终态 `error`（包括重连通知和配置警告）提前抛错。真正失败、不完整结果和进程异常仍拒绝成功。保留最后连接诊断，但收到后续非 error 进展即清除；明确失败和协议错误不受旧重连诊断污染。
- Codex 执行、Codex 决策、Claude 流式决策的已结束且确认归属的传输失败，默认额外恢复最多三次，等待 5/15/30 秒并加入最多 1 秒抖动。可通过 `transportRetryDelaysMs` 设置至多三次等待，空数组关闭。认证、额度、超时、安全、结构化输出错误不自动重试；没有确认 Session 不猜测恢复。
- 重试沿用原 Session/Thread，每次调用生成新 Context receipt 和用量记录；业务 loops/reworks 不增加。每个逻辑操作的计数、等待时间、运行/耗尽/取消状态单独持久化于 Run 目录。成功为 success，其他确定结束为 closed；不把失败写成成功。
- 未完成命令、文件操作、MCP 工具的结果未知时进入可人工恢复的 interrupted，不自动重放。Claude 仅凭已确认 init 或匹配的结果 envelope 绑定 Session；首次传输失败且 Session 未确认时清除预留 UUID，真实调用历史保留。非流式模式的未知工具结果不自动重试。
- 软件崩溃后的 running/waiting 状态不自动重放；明确人工决策改变反馈后可开启新的恢复窗口。正常停止或超时取消等待记录 cancelled，不误报为仍在途。总超时仍遵守 Controller 原有授权窗口，不为重试扩大超时。
- OpenCode HTTP 失败可能仍有服务端 prompt 运行，继续使用其原有状态/abort/人工恢复流程，本次不重发不确定请求。
- 新增用户持续授权真实调用验收及节省 Token 的项目规则；不扩大交付、提交、合并、推送、发布和系统权限。

## 本地验证

`npm run build` 通过。相关五文件串行回归最初 79/79 通过；根据真实审查补强后，最终源码的完整相关五文件串行回归 84/84 通过，日志为 `related-regression.log`，退出码 0。该命令正向选取 transport-recovery、native-agent、codex-output-schema、codex-decision-agent、recovery 五个测试文件，不包含大项目快照或压力夹具。

最终源码的聚焦命令：

```
node --test --test-concurrency=1 dist/test/transport-recovery.test.js dist/test/codex-output-schema.test.js
```

16/16 通过，证据：`focused-tests.log`。其中 13 项新增恢复测试，3 项已有输出 Schema 测试。安装 SDK 的真实子进程夹具在发出重连通知后延迟输出完成，执行与决策均到达完成标记，证明消费流没有提前终止 CLI；该夹具不调用远程模型。

Claude 相关既有回归定向执行 8/8 通过，证据：`claude-regression.log`。中途发现一项旧认证测试要求保留预留 Session ID，已将清理范围限制为首次、未确认的传输失败；另一个夹具固定返回 local-cc 而非 CLI 实际派发 ID，已改为返回派发 ID 并断言续接 ID 相同，没有弱化生产归属校验。最终定向及相关五文件重跑均通过。

故障注入覆盖：终态失败、不完整流、旧诊断污染、未知工具、原 Session 续接、独立调用计数与 receipt、部分写入保留、次数耗尽与重启、停止/取消竞态、确认前失败、非流式人工恢复，以及同一业务轮恢复后独立验收。

以上是聚焦与相关回归，不是全库通过；未运行大项目快照、压力测试或 GUI 验收。

## 真实场景验收

真实 Run：`cb2a189c-4bc1-4fff-b02f-692cfcc5119c`。证据根目录：`D:/PersonalAgent-data/transport-recovery-20261011/5adcd500-fdcb-452b-8b42-90f73408ab8b`。

使用正式 createRun、RealAgents、drive；Codex Plan、原生工具 Execute、外置脚本独立验收、Codex Review 完成。结果 completed、evidence.passed=true、loops=1、reworks=0。决策 Session 与执行 Thread 不同。实际读取 seed.txt、写 result.txt、执行命令，核验 result.txt 严格为 `ok\n`，seed.txt 不变。未批准 Delivery。

使用进程级 `PERSONAL_AGENT_CODEX_DECISION_WINDOWS_SANDBOX=unelevated` 兼容设置，未修改共享安全或认证设置；其网络隔离弱于 elevated。正常真实链路中有非终态配置警告，最终正常完成。没有人为造成服务商断网；不能声称真实远程断线后自动恢复已经验收。

三次 Controller Agent 调用的 SDK 用量合计：inputTokens 249624、outputTokens 1527，其中 cacheReadTokens 160000 是 inputTokens 的子集，不重复相加。模型内部请求数不可观测。尽管项目和输出很小，继承本机默认模型、Instructions、Skills、MCP 的输入开销仍较高。真实修复验收仅运行这一条正常业务链路，避免重复远程调用；故障分支优先本地验证。

`result.json`、`manifest.json` 和 Run 的 `audit.jsonl` 保存实际证据。初版验收脚本筛错了用量事件名，已改为 agent-usage 并从原 audit 重建 result.json 的 usage 字段；没有重新调用模型。

## 真实代码审查

Claude Code 使用真实已配置服务，只读审查本修复；原始结果：`D:/PersonalAgent-data/transport-recovery-20261011/claude-code-review.json`。续接同一审查 Session 的第二轮记录：`claude-code-review-final.json`。

审查指出：连接诊断丢失、旧诊断污染后续错误、Claude 本地 UUID 尚未确认、非流式错误 Session 保留、取消等待的竞态。均已在最终源码修复并增加针对性本地验证。讨论模式的总超时窗口保持原 Controller 约束；不为了自动重试扩大授权窗口。首轮提到的 failure.ts 版本差异来自审查期间已完成的增量，最终 interrupted 分类已确认。

最后的短增量确认记录在 `claude-code-review-confirmed.json`，verdict=pass。该轮明确基于提供的增量说明，没有再读最终源码，不将它称为完整最终代码复审。其两项待确认点已对照源码：入口同时放行 success/closed；Claude Session 相等检查覆盖 resume，刻意拒绝未经授权的新身份，三次真实审查续接同一 CLI Session，并有本地归属验证。仍保留首次非传输失败的历史 UUID 行为，避免扩大本修复范围。代码审查与微型 Run 的 Controller 独立验收分别记录，不混称为修复的全库验收。

Claude 三次真实审查调用的原始用量按 CLI 原始字段保存在各 JSON 中；cache_creation/cache_read 与 input_tokens 的定义与 Codex SDK 不同，不直接合并为同一种输入统计。为减少消耗，后两次续接同一 Session，最后仅发送短增量说明，没有再运行真实业务验收。三轮审查均未修改项目源码。

## 交付边界

源码、规则、测试和验证脚本均留在独立修复 Worktree。未提交、未合并 dev/main、未推送、未更新运行软件、未恢复历史故障 Run。dev/main 的现有用户改动和其他任务保留。正式交付仍需依照 AGENT_WORK_RULES.md 第 5 条及开发治理规则审批。
