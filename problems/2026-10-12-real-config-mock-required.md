# Real 配置仍要求 Mock 专属字段

- 归属：PersonalAgent。状态：待处理。优先级：P3，配置易用性改进。来源：外部审查 A15。
- 证据：TEST `src/schema.ts:25-39` 的 configSchema 经 object 辅助函数生成 required，包含 mockScenario 与 claudeExecutable；仅移除 maxLoops/maxReworks，未按 mode 或 backend 区分。
- 影响：CLI 手写 Real 配置，即使实际不使用 Mock 或 Claude，仍要提供这些字段。Desktop 自动填充，正常桌面流程不会因缺少 mockScenario 失败。
- 结论：字段冗余与配置门槛成立，不等于所有 Real 任务运行逻辑错误。
- 下一步：为模式与 Provider 使用条件 required 或规范化默认值，保持旧配置兼容及导出 schema 同步。
- 验证：静态 schema 核对；未修改真实配置。
