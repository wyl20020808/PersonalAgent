# TEST 批次交付 DEV：目标项目 test 分支硬性规则（2026-10-14）

用户在对话中明确授权“把 test 交付到 dev 并重启 DEV”。由外部 Claude Code 会话执行，不冒充 PersonalAgent 业务 Run 或独立决策者验收。

## 批次

- 冻结 TEST：`adc7ca2`（合并 `feature/project-test-branch-20261014`）。
- 更新前 DEV：`6b845f98405d7b6f6d7be68db8861e76242d23e3`（回滚版本）。
- TEST 相对 DEV 仅 3 个未包含提交：功能提交 `6a12c27`、问题记录 `956497b`、合并提交 `adc7ca2`。DEV 独有的 `4dccdf9`（State Schema 同步）与交付文档经正常 merge 保留，无冲突；重新构建生成的 Schema 与提交内容一致。
- 候选分支：`fix/test-to-dev-project-branch-20261014`，验证后快进 DEV。

## 新增行为

PersonalAgent 开发目标项目（真实模式，桌面端与 CLI）时：目标项目必须是 Git 仓库根目录且有本地 `test` 分支，否则 Run 以 `rejected` 失败、不改动项目，交用户决定是否新建 `test`；每个 Run 从目标项目的 `test` 新建 `personalagent/<Run>` 分支和独立工作树开发；全部验收后 Controller 提交并只合并到目标项目本地 `test`（集成锁、比较并交换，不推送），冲突或检出 `test` 的工作树有未提交修改时暂停交用户。准备阶段被拒绝的 Run 不再拦截会话下一条消息。

## 验证

- 候选：Controller 构建、桌面构建与类型检查退出码 0。
- 桌面全套 180/180 通过。
- Controller 相关 8 个测试文件 115 项：92 通过、23 失败。失败全部在 `controller.test.js`，原因为候选 Worktree 路径过长导致夹具 `git clone` 报 `'$GIT_DIR' too big`（该测试不使用 `PERSONAL_AGENT_TEST_ROOT`），与本批次无关；在 DEV 短路径复跑结果见下文。
- 功能开发阶段：新增测试 4/4；全量 593 项中剩余失败均在未修改基线复现或单独重跑通过；真实 Codex 运行验证拒绝与合并到 test，证据见 `D:/PersonalAgent-validation/project-test-branch-20261014/`。
- 本批次验证日志：`D:/PersonalAgent-validation/test-to-dev-project-branch-20261014/`。

## 安全更新

更新前 DEV 实例未运行（无 PersonalAgent 进程），DEV 数据中 17 个 Run 均不在活动阶段。运行数据不迁移；新 State 字段 `projectBranch` 为可选，历史 Run 按原行为恢复。未推送、未发布。
