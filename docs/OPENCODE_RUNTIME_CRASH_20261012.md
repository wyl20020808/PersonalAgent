# OpenCode 本地连接异常与长路径修复

## 范围与基线

任务分支 `fix/opencode-runtime-crash-20261012`，独立工作树 `D:/PersonalAgent-worktrees/tasks/opencode-runtime-crash-20261012`，基线 TEST `01c40d25a1be8a1b8d375b3a32f99098a3ee71f1`。仅修复 PersonalAgent 的 OpenCode 私有运行配置与退出诊断，不修改游戏源码、Session 数据库、计数或交付门禁。

## 已确认的现场

小地图原 Run `fbd7645c-e909-47e6-86f1-ad4bca135515` 于 2026-10-12 16:20（北京时间）暂停。执行调用报 `fetch failed / ECONNRESET`，原生 Session 的 abort/status 未确认；最后一个 apply_patch 是 pending，输入为空。Controller 停止继续派发是正确的，不能仅凭网络错误自动重放未知写入。

同一私有服务日志反复记录 Git `fatal: '$GIT_DIR' too big`。OpenCode 内部快照目录在深层 Run runtime 下附加两个 40 字符键，触发 Windows Git 路径限制。该长路径错误已确认，但旧版本没有服务退出码，不能证明它就是连接重置的唯一原因，也不能断言订阅额度耗尽或原生进程自行崩溃。

## 原 Run 恢复

先核对原执行进程已退出、原 Session `ses_ed17bbec7ffea3kt4FHkD2KePw` 空闲、所属工作树一致，并保存 state/audit/checkpoint。仅在该 Run 私有配置中设置 `snapshot:false`，通过实际原生服务读取验证生效；不修改全局配置或搬迁数据库。

通过正式 DesktopService 恢复原 Run，要求执行者先核对 pending 补丁的实际落盘结果，再继续。r01/t01/t02 不重跑，模型与原 Session 保留。恢复后真实 Controller 完成这一轮执行并进入 t03 review；新执行日志未再记录上述快照错误。校园及其他业务 Run 保持运行。

现场证据位于 `D:/PersonalAgent-data/project-parallel-dev-update-20261012/evidence/minimap-local-reset-diagnosis.json` 与同目录 `minimap-local-reset-1791796448920`。此恢复不是小地图最终游戏验收。

## 软件修复

- Windows 私有快照最终路径预计达到 240 字符时，在本次服务配置里关闭可选 OpenCode Git undo 快照。保留原 XDG、数据库、Session 和项目工作树路径；Controller 检查点、Writer 与项目备份约定继续有效。
- 自有服务记录 PID、实际退出码、退出信号、关闭状态与是否请求主动清理。Plan/Review/Execute 清理后写入 `opencode-service-exit` 审计；不写入认证、请求内容或原生 stderr。
- 不放宽未知工具结果的自动重试条件，不把连接异常伪装为完成。前一 TEST 批次的五次重试仍只适用于可安全续接原 Session 的临时错误。

## 验证与限制

核心构建、桌面构建、桌面 TypeScript 检查通过。真实本机 OpenCode 无付费 prompt 的隔离服务探针读取到 `snapshot:false`；主动清理后 closed=true、requestedClose=true、退出码 1，正确区分主动终止与未经请求的异常退出。

最终串行组合 48 项全部通过（失败 0），耗时 164.261 秒。该证据是开发者回归与原生服务探针，不冒充 Controller 独立产品验收或游戏 GUI 验收。

最终组合回归结果保存于 `.validation/final-regression-2.tap`；覆盖 OpenCode 执行、协议兼容、传输、五次重试及本修复。探针证据 `.validation/native-runtime-result.json`，真实业务恢复快照 `.validation/business-recovery-result.json`。初次构建有测试 fixture 类型转换错误，已修复；一次依赖恢复与串行测试重叠导致模块未找到，依赖已按项目 npm 锁文件恢复，不使用失败结果冒充通过。完整组合中两项非超时语义的 Controller 测试曾在 Review 的 3000ms fixture 限制下超时，仅将这两项 fixture 改为 15000ms；专门测试超时和取消的原限制保持不变，最终组合重新执行。

GUI 未运行：改动不涉及 UI，桌面构建/typecheck 仅证明编译兼容。DEV 仍为 `5d257797131266a7542cdb8f9d3d73c0b94a90b6`，不替换活跃 DEV 源码、构建或实例；长期源码修复仅先整合 TEST。现有冻结 TEST 到 DEV 等待交付监控保持原冻结提交，不自动夹带本修复。
