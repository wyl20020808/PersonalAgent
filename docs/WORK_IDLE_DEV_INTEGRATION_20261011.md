# Global Work / Idle V1 合入 DEV 验证记录

日期：2026-10-11。执行方：当前外部 Codex 开发会话。

用户在本聊天明确要求将工作／空闲模式与问题告知规则逐项合并到 DEV，并明确冲突以当前最新 DEV 为准。本次先处理工作／空闲模式，第二项另作合并。该直接合并授权只用于这两项；不扩大到 MAIN、远程推送、全局 Hook 安装或运行实例重启。

## 基线与范围

- DEV 基线：`b65b359596711f0fc7e457a0b71c02b23891102a`。
- 来源：`feature/global-work-idle-mode-v1`，`3a1da629655deed4b6b65417acbe0ef693827c3b`。
- 独立集成工作区：`D:/PersonalAgent-worktrees/tasks/work-idle-dev-integration-20261011`。
- 集成分支：`fix/work-idle-dev-integration-20261011`。
- 使用完整来源历史；15 个文件的冲突逐项以最新 DEV 为基础处理。

保留 DEV 已有聊天附件、用户引导、无限轮数及超时、角色切换、文件预览、原生断线重连与传输恢复。合入模式策略、用户模式设置入口、验收延后与独立节点继续执行，以及运行时 Hook/Plugin 支持。对后来进入 DEV 的 Codex 决策者和 OpenCode 执行者补入相同策略提示，保留原有权限和角色边界。

最终节点推进仍处理用户引导队列；GUI pending 不算成功，不允许跳过 Review 或失败的普通验收。共享模式文件不由本次任务修改。

## 验证

- Controller TypeScript 构建、Schema 导出通过。
- Desktop 类型检查、构建通过。
- Desktop 七个测试文件：114/114 通过。
- Controller 定向回归九个文件：118/118 通过，串行。覆盖用户引导、恢复、传输、进程流与三种决策者、两种执行者。
- 最终组合复验三个文件：55/55 通过，串行。包含模式专项 17 项、Codex 决策者与 OpenCode 执行者；新增最终 Review 边界收到引导的回归检查。
- 初次模式和 Native 组合：36 项中 35 通过，唯一失败为新分支测试夹具使用固定 Claude Session ID；按最新 DEV 的预留 Session 合约修正后，最终模式专项全部通过。Native 文件的其余 20 项在初次组合中全部通过。
- `git diff --check` 通过；冲突标记检查通过。

以上为外部 Codex 自主集成验证，未创建 PersonalAgent 开发 Run，不冒充 Controller 正式独立验收。没有调用付费模型，没有进行全库回归、大型夹具、压力测试或可见 GUI 验收。GUI 验收仍为 pending；源码合并不表示已运行新版本，也不表示独立 Codex 已安装全局 Hook。

## 现场与证据

更新前未发现属于 DEV 的活跃 Controller/Agent 写入进程。可读历史 Run 为 paused/failed，未发现 Run 锁。DEV 的两个 Schema 状态标为修改，但逐字节内容与 HEAD 相同；本次仅随构建生成必要的新 Schema。

既存文件与共享策略哈希记录：`D:/PersonalAgent-data/work-idle-dev-integration-20261011/dev-preservation.json`。原有未跟踪文件保留，不纳入本次提交。

日志目录：`D:/PersonalAgent-data/work-idle-dev-integration-20261011/`，包含 `desktop-build.log`、`desktop-tests.log`、`controller-regression.log`、`policy-native-tests.log`、`final-integration-tests.log`。

兼容问题记录：`problems/2026-10-11-work-idle-dev-integration-compatibility.md`。旧问题和来源验收材料保留原历史，不改写为本次验收结果。
