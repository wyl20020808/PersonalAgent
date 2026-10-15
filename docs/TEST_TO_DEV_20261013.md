# TEST 批次交付 DEV（2026-10-13）

用户明确授权把 TEST 当前全部已提交内容交付 DEV，包括全自动模式修复和 Codex 用量修复。由 Claude Code 外部会话执行，不冒充 PersonalAgent 的真实 Run。

- 冻结 TEST：`ce96b5962893584858b5512d5e86a3416209c1b6`。
- 更新前 DEV：`3b9dcbbbe2faedfa7e3d1cc0bf6f516ad93bb54b`；更新后 DEV：`c79f74c`（候选分支 `fix/test-to-dev-20261013` 的正常合并提交，DEV 快进到该提交，保留两侧历史）。
- 候选工作树：`D:/pa-dev-1013`。合并无冲突；依赖文件无变化，未重装依赖。

## 本批次内容

- 全自动模式边界加固：同一问题三次接管上限在集成路径上生效，另加每个 Run 在两次用户输入之间最多十次接管；Claude “session limit” 归为额度问题不再接管；自动重规划不能用空计划结束未验收任务；委托后仍要求用户决定的问题留给用户；已结束的连接或超时失败原地恢复。
- Codex 用量：实时通道改为记录回合合计；用量报告不计入 10-12 22:37 至本次更新之间的 Codex 记录。
- 上下文预算：压缩阈值取窗口比例和角色预算的较小值，默认决策者 120000、执行者 160000，可配置；用量报告增加上下文占用和压缩次数。
- 其他 TEST 提交：上下文仪表对齐、Codex 命令执行去重计数、聊天中断恢复入口及其验证记录。

冻结之后的 TEST 提交（任务台账、决策 Session 轮换等）不属于本批次。

## 验证

候选工作树：根构建、桌面构建和桌面类型检查通过；桌面测试 170/170。Controller 全量回归 547 项中 531 通过、16 失败；`opencode-transport.test.js` 在全量运行中卡住后被终止，单独重跑三次均为 4/4，其余失败项均在未修改 TEST 基线的失败集合内，不记为通过。

DEV 更新前：DEV 软件已由用户正常退出（owner 文件 `quitRequested: true`），没有来自 DEV 工作树的 Controller 或 Agent 进程；17 个 Run 的状态和配置通过新 schema 检查；54 个未跟踪文件与新增路径无碰撞；两处 schema 修改只有换行差异。持有 Git common directory 中的 `personalagent-dev-integration.lock`。检查点位于 `D:/PersonalAgent-data/test-to-dev-20261013/checkpoint`，含原构建产物、源码状态、注册表、Session 文件和各 Run 状态哈希。

DEV 更新后：重新构建 Controller 和桌面，关键构建产物哈希与候选一致；13 个项目 Run 的状态文件、`sessions.json` 和 54 个未跟踪文件均未变化；新 CLI 可只读读取 DEV Run。

## 边界

- 没有启动 DEV 软件，没有恢复或启动任何 Run，没有调用真实模型；MAIN、远程仓库和业务项目未改动。
- Run `40d0e93a-4787-49cf-a3b0-954f7d79aa2a` 停在 executing，`922a7176-8dea-4269-977a-ab785b4927d0` 停在 review，两者的锁文件指向已不存在的进程。按既有恢复规则，需要用户在软件中明确恢复，不会自动重放。
- 上下文预算、Session 轮换和全自动模式修复都没有经过真实模型端到端验证；预算数值是估计。GUI 没有做可见窗口验收。
- 回滚：DEV 分支回到 `3b9dcbb`，构建产物可从检查点恢复。
