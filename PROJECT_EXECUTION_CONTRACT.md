# V0.3C.2 / V0.3C.3 共享接口契约

状态：2026-10-08，两个 Worktree 的共同基线。真实付费 Agent 调用为零。

## Controller 配置

- `mode: "mock" | "real"`：选择服务适配器，不等于执行权限。
- `executionMode?: "native" | "proposal"`：真实 Agent 默认 `native`；旧结构化文件提案显式选择 `proposal`。原生结果为 `{ mode: "native", summary: string }`，不得再重复应用提案。
- `projectMode?: "isolated" | "direct"`：默认 `isolated`，保留现有 Git 隔离工作区和审批后交付。`direct` 表示在用户选择的目录内执行，文件修改立即发生；最终审批确认成果，不假装审批前尚未修改。普通非 Git 文件夹需要底层快照、验收、恢复和交付语义支持后才能启动。
- `allowedRepositories: string[]` 保持旧字段作为明确授权的项目目录列表，可包含普通目录。`source` 是用户选择的绝对项目目录；`workspace` 是 Agent 实际工作目录，直接模式等于 `source`。
- `runtimeDir` 保存 Controller 状态、日志、独立验收和审批记录，不放进 Agent 项目目录。保留现有预算、测试、依赖和 Session/Thread 字段。不改变默认模型。
- `tests` 继续表示 Controller 独立验收命令。自动配置不能把安装检测或 Agent 自测当成项目正确性验收；缺少项目专属测试时必须明确展示验收局限。

## GUI / 服务层

- GUI 选择项目目录、目标、Mock/真实适配器和工作区模式，服务层生成原有 Config，再调用现有 Controller。
- 支持目录选择 IPC、最近项目和自动配置；不在 Renderer 执行 Shell，不创建第二套 Controller。
- 项目启动请求由服务层转换为既有 `start` 接口；高级配置导入和历史 Run 保持兼容。
- 普通文件夹/直接模式未接入底层前，显示具体不可用原因并阻止启动，不以 Mock UI 演示声称真实开发已实现。
- 项目目录授权及真实 Agent 预算确认保留；当前开发与回归只使用全新本地夹具。

## 分工与集成

- V0.3C.2：`src/`、Controller 原生执行测试、原生事件记录和验证文档；后续负责 `projectMode` 底层统一集成。
- V0.3C.3：`desktop/`、GUI 自动配置和最近项目、GUI/Mock 测试及验证文档。不得另写 Controller 执行架构。
- `src/schema.ts` 与 `src/store.ts` 由 V0.3C.2 维护。V0.3C.3 只依赖上述契约，底层能力未就绪时明确禁用对应启动分支。
- 两边独立构建测试。只在集成 Worktree 逐项集成，主分支不自动合并。冲突后统一运行 Controller、GUI 和 Electron 回归。
