# 旧隔离快照回归夹具需要适配新开发流程

- 归属：PersonalAgent 测试夹具及固定 Project Context 回归，不是外部项目问题。
- 状态：暂缓；不阻断已验证的无快照 Direct 开发。不得把当前结果称为全量回归通过。
- 发生场景：取消强制 Snapshot 后，自主运行 `call-observation.test.js` 与原子写入、进程测试的组合检查，共 18 项，5 项通过、13 项失败。
- 已确认原因：12 项失败在 `scripts/context-regression-fixtures.ts` 的非 Git `isolated` 创建阶段，夹具依赖已取消的自动项目复制；1 项 Git 固定回归断言期望没有过期盖章，实际得到 1 项。现场确认源 `combat/core.js` 为 LF、Git 克隆工作区为 CRLF；旧流程的全量副本覆盖曾保持源字节。
- 影响：这些旧夹具尚不能证明新流程的工具观察及固定上下文回归全部通过。生产工具事件、Session/Run 审计实现没有删除；桌面审计回放及新的无快照流程专项已通过。
- 证据：组合检查命令为 `node --test dist/test/atomic-replace.test.js dist/test/process-stream.test.js dist/test/call-observation.test.js`。失败夹具及审计保留在 `D:/pa-pc3/c633e2de`，未删除、修复历史记录或启动付费 Agent。
- 下一步：另行将普通审计夹具改为显式授权 Direct，或准备适合 Git 检出语义的 clean Git 隔离夹具；重新明确源字节、checked_files 与未验证 Diff 的断言。不能为了满足旧测试恢复强制全项目扫描或备份。本任务按用户要求不扩大到整套旧测试迁移。
