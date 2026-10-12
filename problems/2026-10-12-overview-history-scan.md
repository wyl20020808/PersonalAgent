# 桌面概览随历史配置与 Run 数量增长

- 归属：PersonalAgent。状态：待处理。优先级：P3。来源：外部审查 A5。
- 证据：TEST `desktop/src/service.ts:185-196` 的 `startProject` 每次创建独立 config/runtime/profile，`overview()` 遍历全部注册 profile 及 runs，读取并校验配置和状态；没有分页或增量缓存。MAIN `desktop/src/App.tsx:35` 定时刷新概览，TEST 通过刷新循环继续定期读取。
- 影响：历史规模增大时，概览成本至少随配置和 Run 数量增长，并包含同步文件 IO；实际卡顿程度尚未测量。
- 修正：不是每个 overview Run 都会全量校验 audit；`publicRun` 间接调用的 `pendingContextConfirmations` 在契约确认目录存在时确实会读取并校验全文，缺少该目录时直接返回。detail/thread 也有审计路径，thread 缓存不能覆盖这条独立调用链。会话后续 Run 可复用已有 profile，不是每一个 Run 都必然新增 profile。历史保留本身不是缺陷。
- 下一步：对列表增加分页或安全增量读取；用小规模隔离数据测量延迟，不清理真实历史，不削弱必要的配置与状态校验。
- 验证：静态确认；未运行规模 benchmark。

## 第二份外部审查 F12：补充并纠正首次核对

- 状态：待处理。基线 TEST `a39215ed`。首次核对“overview 不逐条校验审计”的无条件表述不准确，现已纠正。
- 调用链：`desktop/src/service.ts` 的 overview → publicRun → `src/context-confirmation.ts:20-24` 的 pendingContextConfirmations → `src/context-trust.ts:18-26` 的 auditRecords。确认目录存在时每次读完整 audit 并逐条重算 hash；已处理完但目录仍在也进入该路径。
- 确定性验证：直接抽取当前两个函数体，构造 3 条有效哈希链与空 confirmations 目录；连续调用两次，audit 全文读取次数为 2。退出码 0。目录不存在时有提前返回保护；因此不能说所有 Run 都无条件全量扫描。
- 影响：这类历史 Run 的定期概览存在额外随审计规模增长的工作。10MB 延迟、CPU/IO 实际热点未测量，不把小样本当性能 benchmark。
- 下一步：按文件身份、内容变化及确认记录变化做安全缓存/增量验证，保留损坏审计拒绝保护；可直接复用可靠的验证结果，而不是移除概览中的信任检查。
- 验证结果：`D:/PersonalAgent-data/audit-second-problem-records-20261012/verification.json`。
