# 桌面概览随历史配置与 Run 数量增长

- 归属：PersonalAgent。状态：待处理。优先级：P3。来源：外部审查 A5。
- 证据：TEST `desktop/src/service.ts:185-196` 的 `startProject` 每次创建独立 config/runtime/profile，`overview()` 遍历全部注册 profile 及 runs，读取并校验配置和状态；没有分页或增量缓存。MAIN `desktop/src/App.tsx:35` 定时刷新概览，TEST 通过刷新循环继续定期读取。
- 影响：历史规模增大时，概览成本至少随配置和 Run 数量增长，并包含同步文件 IO；实际卡顿程度尚未测量。
- 修正：`overview()` 本身没有逐条读取与校验 audit 哈希链，`detail()`/thread 才涉及审计。会话后续 Run 可复用已有 profile，不是每一个 Run 都必然新增 profile。历史保留本身不是缺陷。
- 下一步：对列表增加分页或安全增量读取；用小规模隔离数据测量延迟，不清理真实历史，不削弱必要的配置与状态校验。
- 验证：静态确认；未运行规模 benchmark。
