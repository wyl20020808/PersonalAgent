# DEV 成果同步回 TEST（2026-10-15）

## 目标与基线

用户要求 TEST 作为 DEV 的后续版本，保留两侧所有已提交功能并合并同步。本次由外部 Codex 在 macOS 独立 Worktree 执行，不属于 PersonalAgent 业务 Run，也不声称独立决策者或 GUI 验收。

- 原 TEST：`adc7ca23073778caeace47294152ddca221c6966`。
- DEV：`cd178cb99250192b06996c2c39d33c31fda834bc`。
- 共同祖先：`410229ee226203dd7f4c48efae253f860838fad0`。
- 任务分支：`fix/sync-dev-into-test-20261015`，从原 TEST 创建。
- 任务 Worktree：`../sync-dev-into-test-20261015`；正式本地 TEST 集成时使用单独的临时集成 Worktree。

## 分叉原因与处理

同步前 DEV 独有 20 个提交，TEST 独有 3 个提交，数量包含合并提交。TEST 批次交付 DEV 后，DEV 留下独有的交付记录，并增加 review follow-up Schema 修复及 Mac 运行路径适配；TEST 随后增加目标项目必须具备 test 分支、在独立 Worktree 开发并只集成 test 的能力。DEV 后续提交没有完整回合 TEST。

采用正常双亲 Git merge 将明确 DEV 提交整合进 TEST 任务分支，无文本冲突，没有使用 reset、rebase、强制覆盖或任选一侧解决冲突。保留两侧提交历史、TEST 项目分支隔离能力、DEV Mac 适配及交付记录。构建后两个已跟踪 Schema 无额外漂移，DEV 的 Schema 修复与 TEST 新字段兼容。

组合验证发现测试仍假定 Windows 路径。本次只修正两处测试文件：实例数据路径断言按当前平台判断；桌面策略测试在非 Windows 使用系统临时目录，并沿用测试结束清理。没有改变产品权限、验收门禁或运行逻辑。

`feature/mac-dev-trial-20261015` 是另一个已有任务分支，其尚未进入 DEV/TEST 的额外成果不属于本次两分支同步范围，保留原分支及 Worktree，未覆盖或清理。

## 验证

- 根目录 `npm run build`：退出码 0。
- 根目录 `node --import ./scripts/regression-policy.mjs --test --test-concurrency=1 dist/test/project-branch.test.js dist/test/platform-runtime.test.js dist/test/dual-instance.test.js dist/test/review-follow-ups.test.js`：18/18，通过，退出码 0。
- 桌面 `npm run check`、`npm run build`：退出码 0；既有 use-client 和较大 bundle 警告保留。
- 桌面 `node --import ../scripts/regression-policy.mjs --test --test-concurrency=1 out/rendererRecovery.test.js out/supervision.test.js out/interaction-policy.test.js`：13/13，通过，退出码 0。
- 暂时以符号链接复用已有 Mac 试用 Worktree 的依赖，仅在本任务目录产生构建与测试输出；这不是从锁文件全新安装验证。
- 最初并发执行桌面检查早于根目录构建完成，缺少 dist 导致失败；按依赖顺序重跑通过。最初根目录两个 Windows 路径断言及桌面 Windows 临时目录测试失败，修正测试后复验；未隐藏这些失败。
- 未运行全量回归、真实模型调用、GUI 或长时间稳定性验收；本次结果不授权更新 DEV 运行实例或发布 MAIN。

## 远端与后续同步

本地 `origin/dev`、`origin/test` 分别与本次旧 DEV、TEST 相同，因此最近获取的远端记录也分叉。实际 `git fetch origin`、HTTP/1.1 fetch、`git ls-remote` 和限时 GitHub API 请求均发生 TLS 连接失败或超时，不能据此确认远端当前状态。本次未推送。

本地集成后的必要条件是 `git merge-base --is-ancestor dev test` 成功，且原 TEST 也仍是新 TEST 的祖先。以后 DEV 新增修复、适配或交付提交后，应及时通过独立分支正常合并回 TEST，避免遗留单侧提交。日常功能继续从 TEST 建独立任务分支，先交付 TEST；成熟批次再按原交付规则更新 DEV。不要为了让提交号一致而把未验收 TEST 功能直接送入运行中的 DEV。

远端恢复连接后，先 fetch 并复核实际远端两分支；若已前进，保留并整合远端新增提交后重新验证。本报告不是远程推送授权。

## 清理报告

- 已删除本任务 `.cache/`、`.validation/`、`.v3c3/`、`desktop/.cache/`、`desktop/out/`、`dist/`、`validation/global-interaction-regression/`，共 6,188,559 字节（约 5.90 MiB）。已单独解除两个依赖符号链接，未删除其目标。
- 正式保留：正常合并历史、两个跨平台测试修正及本报告；用于追溯本次同步。
- 未能清理：无。工作区无本任务残留的未跟踪缓存。
- 进程：本任务构建、测试及网络检查均已结束，无后台写入进程。
- Worktree：本地 TEST 集成后移除本任务和临时集成 Worktree，保留任务分支；不清理既有 Mac 试用 Worktree。
- MAIN、DEV 分支及运行数据不变，不推送、不重启实例。
