# DEV 一条历史 Run 目录缺少 state.json

- 现象：2026-10-11 DEV 组合更新后的只读 overview 返回 6 个完整 Run 和 1 条 unavailableRuns。不可用 Run `095e9ba9-afa5-4735-9a6e-39ba772273dc`，Profile `f75d60e4-ef1c-42b7-b9f1-e4b3fa222bb8`。
- 证据：DEV runtime `projects/8e385b4ba92e9d229e7a7c17e4f23856/runtimes/6b92ba96424d4bd8/runs/095e9ba9-afa5-4735-9a6e-39ba772273dc` 存在但无 state.json。更新前后 profiles、sessions 与其余 6 个完整 Run 的 SHA256 未变。没有启动新 Run 或恢复旧任务。
- 影响：该条记录无法读取；其余会话和 Run 可读。服务明确报告不可用，没有借用其他实例数据。
- 原因：尚未核实首次准备为何没有保存状态；不把错误提示中的可能原因当作已确认根因。
- 状态：待处理。本次保留目录和历史，不补造 state 或重放任务；后续按原始日志核查首次准备中断/失败。
