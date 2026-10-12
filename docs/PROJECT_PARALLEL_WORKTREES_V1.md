# 同项目并行会话与任务工作树 V1

同一个 PersonalAgent 窗口可以将独立任务工作树中的会话显示在同一个项目下。项目归组仅影响展示，执行目录、Controller 授权、Run、模型会话和锁继续按实际任务工作树区分。

在项目行点击“新建并行会话”，选择该项目已经创建的独立 Git 任务工作树，然后配置模型并发送需求。工作树必须属于同一个 Git common directory，选择主项目自身、无关仓库或工作树内的子目录都会被拒绝。此入口不自动创建或修改工作树，也不申请外部项目的 Writer 锁；工作树创建及 Writer ownership 继续遵循目标项目规则。

CLI / 服务调用示例：

```json
{
  "operation": "createSession",
  "projectPath": "D:/OpenWorld-Worktrees/minimap",
  "projectGroupPath": "D:/OpenWorld",
  "mode": "real",
  "projectMode": "direct",
  "decisionAgent": {"backend": "codex", "model": "gpt-6.1-sol", "reasoningEffort": "medium"},
  "executionAgent": {"backend": "claude-code", "model": "haiku", "reasoningEffort": "medium"}
}
```

`projectGroupPath` 在创建时核对，展示名称从项目目录读取，不接受任意名称冒充项目。每次发送需求前重新核对 Git 工作树归属。持久化记录保留原来的 `projectPath`；Profile、Run source / workspace、恢复历史和消息互斥锁均继续绑定实际目录。同一实际目录的另一个任务仍排队。归组字段不授予跨目录写权限，也不解除外部项目的资产 Writer protection。

未设置归组字段的旧会话行为不变。已有运行不会迁移、更换 workspace 或自动重放。升级运行中的 DEV 必须先到安全节点，保存原 Run / Session，再按治理流程更新并恢复。

## 本轮验证

- 根项目构建、桌面构建及桌面类型检查通过。
- Session / Service 聚焦回归 81/81 通过；最终工作树校验调整后新增三项再次通过。
- 新增回归验证同项目不同工作树可分别派发、同目录仍排队、原 Run state 不变、重开归组与归属不丢失、拒绝无关仓库/子目录/失效工作树。
- 隔离的 headless Chromium 界面检查通过：一个项目分组、两个任务会话、并行入口验证工作树、无 Renderer 异常。使用本地 fixture，没有调用真实模型，也不是用户 DEV 窗口的真实验收。
- 截图和结果：任务工作树 `Temp/project-parallel/same-project.png`、`Temp/project-parallel/ui-result.json`。

真实 DEV 安全升级、原任务恢复和小地图真实模型运行尚待执行；本文不将它们计为 PASS。
