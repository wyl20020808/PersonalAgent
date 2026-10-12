# TEST 用量报告批次交付 DEV

用户明确要求继续合并最新已提交 TEST；原两个 OpenWorld 任务仍保持停止，不打开窗口、不恢复业务执行。

- 冻结 TEST：`208f35638a69a3982111e4e9a9acf3cd10359d5f`。
- 来源功能提交：`e8d75a3`，新增只读 `usage-report` 命令。
- 更新前 DEV：`45dc2653cc1bf44ef7034af2ed8d285f0d4ef9f6`。
- 复用独立候选工作树 `D:/pa-dev-2220`，通过正常 Git merge 保留两侧历史，无冲突。
- 相对前次已验收批次新增四个文件的变化：CLI 路由、用量报告实现及测试、问题记录；不含未提交或冻结之后的内容。

候选根构建通过，新增用量报告测试 2/2 通过；真实 CLI 只读读取校园与小地图原 Run，并输出并排表格，两者均为 stopped。命令没有创建 Controller、启动模型或修改 Run。旧批次的组合回归和 GUI 边界沿用 `TEST_TO_DEV_20261012_2220.md`，不把已有四个固定 Context 断言失败写成通过。新增变更仅涉及 CLI，没有 GUI 功能变化；不声称重做 GUI 验收。

交付持有共享独占 DEV 集成锁；更新前 12 个 Run 状态与配置兼容，11 个可写 Run 无活跃进程或锁，54 个本地未跟踪文件无路径碰撞。保存源码状态、构建、数据、审计、Session 与本地文件的独立检查点：`D:/PersonalAgent-data/project-parallel-dev-update-20261012/evidence/usage-report-dev-checkpoint`。

更新后重新构建 DEV 并检查桌面类型，验证新 CLI、原 Run/Session/停点、数据和本地文件保持不变。输出 Token 报告属于历史记录的归一化统计，不等于计费金额，也不证明 Session 轮换已在真实任务中降低用量。MAIN、远程仓库与业务项目成果未改动。
