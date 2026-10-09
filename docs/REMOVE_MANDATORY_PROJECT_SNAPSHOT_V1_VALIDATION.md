# 移除强制 Project Snapshot V1 验证记录

日期：2026-10-10。开发状态：独立 fix 分支完成，等待合入 dev。

## 来源与授权

- 发起环境：独立 Codex Desktop；不是由 PersonalAgent MAIN/DEV 或真实 Agent Run 发起。
- Git 基线：实际最新本机 dev `86a5f91bb7f79b39fdc7ae23e266b5c6962d0811`。未配置 Git remote；不存在需要拉取的远程 dev。
- `fix/large-project-snapshot-v1` 与 dev 同指该提交，祖先检查通过；没有重复合并、覆盖或重置旧分支。
- 任务分支：`fix/remove-mandatory-project-snapshot-v1`。
- Worktree：`D:\PersonalAgent-worktrees\tasks\remove-mandatory-project-snapshot-v1`。
- 已全文读取 AGENTS、统一工作规则、治理 V1、问题反馈规则及 RTK；治理文件与 dev 相同。用户本次明确要求提交独立 fix 分支及提供提交 SHA，因此仅该分支提交获得授权。没有合入 dev/main、push、发布或调用真实付费 Agent。

## 行为与依赖处理

新 Run 固定记录 `snapshotPolicy: none`；旧状态不要求该字段，旧快照和既有 Delivery 读取逻辑保留，不做迁移或清理。

- `workspace/prepare`：Direct 只验证目录授权和记录已有 Git HEAD，不读取项目全量内容，不创建 project-baseline 或 snapshot-objects。Clean Git isolated 使用 Git 克隆；非 Git/Dirty Git 自动复制不可用，明确提示授权 Direct，不静默切换模式。
- `incremental/Controller`：不建立 Agent、任务、轮次内容基线；不每轮 fsck；不产生 Direct 完成恢复快照。保留调度、状态、审计、Session/Thread、测试、返工上限、人工决策和 Review。
- Project Context：保留模块、契约、checked_files、确认及盖章；仅自己的文档目录和明确 checked_files 定点读取。导航只列根目录有限条目，不递归扫描项目。Git 变更路径辅助模块映射；非 Git 非盖章源码及 Git 未跟踪/忽略内容不保证自动发现。
- Review：Git 跟踪 Diff 是辅助证据，包含任务前已有修改；不声称精确任务/轮次差异。证据、审计、提示和桌面均标注未验证范围；超长 Diff 降为明确未验证的摘要。配置测试通过不等于完整变化核验。
- Recovery：已有 Native 结果进入新测试与 Review，不重放 Execute，不恢复或覆盖项目文件；新 Run 不复用旧 Review 回执。没有全项目备份的 Run 明确拒绝 project-restore。
- Delivery：Direct 保留显式摘要审批，只确认当前成果，重跑配置测试，不重复写入。空 changes 明确表示没有完整变更清单。无快照 isolated 自动 Apply 不可用，须审查后手动集成。独立建档隔离入口暂不可用；已有 Context 可在授权 Direct 开发中维护。
- Native 工具：未修改 CC/Codex 原生工具配置、Shell、文件编辑、测试、默认模型、认证或工具调用事件逻辑。未修改 OpenCode、多决策者 UI 或并行任务实现。

兼容字段 `snapshotDigest` 在新 Run 中只绑定有限 Git/Context 观察，不是全项目内容指纹。历史 Run 的原实现仍可读取及按原路径处理；新 Run 不启用旧内容扫描。

## 必要验证

所有测试是当前 Codex 会话的自主测试及本地注入式夹具，不冒充真实付费 Agent 审查或 Controller 独立交付审批。

| 命令 | 最终结果 |
| --- | --- |
| `rtk proxy npm run build` | 通过，TypeScript 和 Schema 导出成功 |
| `rtk proxy node --test dist/test/no-project-snapshot.test.js dist/test/atomic-replace.test.js dist/test/process-stream.test.js` | 14/14 通过，其中 10 项无快照专项 |
| `rtk proxy npm run check --prefix desktop` | 通过 |
| `rtk proxy npm run build --prefix desktop` | 通过，仅依赖已有的 use client 构建提示 |
| `rtk proxy node --test desktop/out/thread.test.js` | 16/16 通过，包含实际本地 Mock Controller 和审计回放 |
| `rtk proxy git diff --check` | 通过 |

10 项专项覆盖：512 MiB 稀疏资源与硬链接不触发全量准备，Git/非 Git Direct Plan/Execute/Review，明确审批且零写入的 Direct Delivery，Project Context 定点检查与原生环境保留，显式人工验收，拒绝无法保证的隔离复制和建档入口，旧 State/内联 Snapshot 读取，持久 Native 结果恢复不重放，clean Git isolated 开发与自动 Apply 拒绝，20,001 文件启动无 Snapshot 门槛，以及损坏 Context 文档仍保留审计且不能通过验收。

最终日志（当前任务生成，未纳入提交）：

- `.validation/final-snapshot-regression.log`：14/14，0 失败。
- `.validation/final-thread-regression.log`：16/16，0 失败。

早期专项失败已修复：Delivery 的旧 minItems 与预览一致性约束、未选择模块的导航断言、环境断言对象原型差异，以及过长测试目录触发 Git 自身 `$GIT_DIR too big`。测试环境断言使用布尔比较，避免失败日志输出环境值。最终专项全部通过。

额外尝试的旧固定回归组合为 5/18 通过、13 项失败，未声称全量回归通过。12 项依赖已取消的非 Git 自动隔离复制，1 项依赖源目录与 Git 克隆字节相同。已登记 `problems/2026-10-10-snapshot-era-regression-fixtures.md`，按用户要求暂缓整套旧夹具迁移。现有 Git 克隆检出规则可能使 checked_files 过期，属于应核对的实际差异。

## 交付边界与问题状态

`problems/2026-10-10-large-project-snapshot-limit.md` 已更新为强制机制决定取消、实现完成等待合入 dev；保留旧修复及合入记录。旧回归夹具问题状态为暂缓。源码、测试、契约和问题记录只提交本任务分支；main/dev 的用户修改、历史 Run、Snapshot、其他项目和并行 Worktree 不改动。

本次没有真实大型项目端到端付费验收，没有新增备份系统、缓存、监听器或数据库，没有重新建立大规模测试工程。完成后停止，等待用户批准合入 dev。

## 收尾时的并行 dev 更新

实现提交为 `5cd1a266072d39d19a5dea2ae647547389f8259b`。提交后只读核对发现并行任务已将 dev 更新到 `4ac263eadb280b4f52ebafea0b23ff89e9d15e87`（已批准的 multi-agent role board P1 合入）；这不是本任务执行的合并。任务创建时 dev 为上述 `86a5f91`，没有改用 main 或重复整合 Snapshot 分支。

新 dev 与本修复在 `desktop/src/GroupWorkspace.tsx`、`desktop/src/thread.ts` 有文件重叠。按本任务“不修改其他并行任务、完成后等待合入 dev”的要求，不在本分支重放或合并其他 UI 成果。后续获得合入授权时应核对并组合新的 UI 与本次未验证范围提示，并补做相应桌面验证。本次测试只证明独立 fix 的当前内容，不代表与新 dev 组合后已通过。
