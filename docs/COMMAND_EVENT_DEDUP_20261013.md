# 命令操作重复统计修复

日期：2026-10-13。执行方：外部 Codex 开发会话；没有创建 PersonalAgent Run，也不属于 Controller 独立验收。

治理：V2.1。基线：本地 TEST `a60f6db908f0a8c8db243b0aabc4c95a04b1b8a5`。
任务分支：`fix/command-event-dedup-20261013`。
隔离目录：`D:/PersonalAgent-worktrees/tasks/command-event-dedup-20261013`。
当前运行实例的构建提交未核验；本任务不替换或重启实例。

## 原因与修复

Codex 命令的每个 `item.updated` 都携带累计输出。原公开活动转换为每次更新生成不同的 key，且没有 streamId，导致同一次执行不断新增操作。

命令公开活动仅保留开始和完成事件，并以原生 item.id 作为 streamId，投影成同一条命令记录。最终输出、退出码、失败状态和最新原始证据保留。原生 observation 与安全恢复判断保持原有流程；AI 文本的实时输出保持原有流程。

旧审计数据的 key 已散列，无法还原原生执行 ID。对缺少 streamId 的旧记录，仅折叠同一 scope、任务、轮次、角色下，相邻同命令的 running 更新。已完成的同名重复执行保持独立；交错旧记录缺少身份时不强行合并。原始审计文件不修改。

## 自测与审查

- `rtk npm run build`：根目录构建通过，退出码 0。
- `rtk npm run build`：desktop 构建通过，退出码 0；存在原有 bundle 大小和 use client 提示。
- `rtk npm run check`：desktop 类型检查通过，退出码 0。
- `rtk proxy node --import ./scripts/regression-policy.mjs --test dist/test/all-ai-streaming.test.js dist/test/native-agent.test.js dist/test/codex-live.test.js`：31/31 通过，退出码 0。
- `rtk proxy node --import ../scripts/regression-policy.mjs --test out/thread.test.js out/threadGrouping.test.js`：38/38 通过，退出码 0。
- `rtk git diff --check`：通过，退出码 0。

新增回归覆盖 2195 次命令输出更新、单条记录统计、成功和失败结果、最新证据、历史记录、跨调用隔离、相同命令不同执行，以及 AI 输出增量继续传递。

自审确认仅修改命令公开活动与历史投影；不改变实际执行、观察事件、恢复控制或 AI 文本节流。测试是本地 fixture 自测。没有运行可见 Electron GUI 验收，也未完成用户验收；GUI pending。未推送、发布或更新 DEV/MAIN。

## 最新 TEST 组合验证

取得共享 Git common directory 下的独占 TEST 集成锁后，发现 TEST 已前进到 `bedf684ac2b9470b7d01870954b0538c92f7f32b`（上下文悬浮说明 UI）。在任务分支正常合并该提交，无冲突。组合版本重新通过根目录和 desktop 构建、desktop 类型检查、AI 流式输出与 Codex live 10 项回归，以及命令投影、实时消息和紧凑分组 7 项针对性回归，所有退出码为 0。

`rtk proxy node scripts/check-context-meters.mjs` 在隔离 headless Chromium 中通过上下文悬浮 UI 检查，退出码 0；这不属于可见 Electron 验收。
