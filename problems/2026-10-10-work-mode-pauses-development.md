# work 模式被错误实现为暂停真实开发

- 归属：PersonalAgent 全局交互策略 V1 产品语义。
- 现象：`591388d` 在 work 下拒绝 Controller、RealAgents、Claude/OpenCode/Codex SDK 与大部分普通进程；idle 切 work 会终止模型或整个 Run。上课期间无法持续后台开发。
- 原因：把原生工具无法完全约束的风险升级为整个 Agent 默认拒绝，混淆进程宿主与具体操作。用户明确要求普通未知开发命令继续，仅延后桌面交互和明显重型步骤。
- 影响：源码编辑 API 虽保留，真实 Plan/Execute/Review 和编译/测试仍停滞，违背用户核心目标。
- 状态：已解决。移除模式总闸和模型取消器，共用操作级 BACKGROUND_SAFE / DESKTOP_INTERACTIVE / SYSTEM_HIGH_RISK / RESOURCE_HEAVY 分类；普通开发继续，GUI pending 独立审计，其他独立节点继续，依赖节点等待。最终验收按实际完成依赖状态重跑全部配置阶段，不能依赖数组末尾索引。
- 验证：work 专项最终 16/16，真实无害 Node/Python/npm/Git 操作成功；RealAgents/Controller 假服务三阶段 completed；SDK/Controller/普通 build/test 模式切换不取消；Mock GUI 只取消持有 PID，DAG pending 与明确恢复通过，Review human/fail 及安全检查失败不能被 pending 分支绕过；真实 Claude/OpenCode/Codex 工具拒绝后继续。付费调用 0，桌面交互 0。
- 剩余边界：应用策略不提供 OS 级任意原生命令隔离，见 `2026-10-10-codex-hooks-not-enforced.md`。用户明确允许在此边界下继续开发；不能宣称全部原生工具已被技术保护。
