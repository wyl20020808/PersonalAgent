# V0.3C 统一执行契约

实现与验收来源见 `V03C_UNIFIED_VALIDATION.md`。两份契约文件采用相同定义。

- `mode: mock | real` 选择 Agent 来源；`executionMode: native | proposal` 选择执行协议；`projectMode: direct | isolated` 选择工作目录，三个维度分别处理。
- `projectMode` 是规范字段。旧 `workspaceMode` 可读入并迁移；两个字段同时出现且不同必须拒绝。持久化只写 `projectMode`。
- 直接开发必须使用 native，持有匹配真实项目路径的 `directAuthorization: { projectPath, acknowledgedAt }`。修改即时发生；最终交付确认不重复写源目录。
- 显式 isolated 支持普通文件夹、空项目和 Dirty Git，通过独立副本与字节快照工作。省略项目模式时，无 Git 使用普通目录隔离，有 Git 保留旧 clean-Git 隔离路径。
- `allowedRepositories` 表示授权项目目录，不要求 Git。Controller 运行数据存入项目外的 D 盘 `runtimeDir`。原生 Shell 的权限不是目录技术沙箱。
- `tests: []` 可开发；独立验收记为未通过，进入绑定当前证据摘要的人工验收节点。人工观察完成任务不等于自动测试通过，不能据此自动交付。多任务必须逐项人工验收。
- 原生 CC/Codex 保留本机完整工具、Shell、测试、调试、公开事件与默认模型配置。Controller 收集两角色实际文件变化，复核后重新独立验证；最终阶段重跑全部配置测试。
- GUI 保留文件夹选择、自动配置、最近项目、三人群聊和详细活动；高级入口保留配置导入与旧 Mock 场景。
- GUI 普通项目默认 Mock、native、direct。直接修改授权与付费调用确认分开记录。
- 本次仅使用新建本地 Mock/进程夹具，不调用付费 Agent、不批准既有交付、不合并 main。
