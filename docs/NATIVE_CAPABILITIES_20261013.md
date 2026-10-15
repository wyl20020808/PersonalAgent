# 原生 Skills 与 MCP 继承

任务：native-capabilities-20261013。开发方：外部 Codex。基线：TEST `92024f09a9054f8cda5758f55a3e9b533e2dd7be`。独立分支：`feature/native-capabilities-20261013`。遵循治理 V2.1，允许满足条件后整合本地 TEST；不更新 DEV/MAIN，不替换运行实例。

## 行为

- Claude Code 保留原生用户配置、Skills、插件和 MCP。每次调用通过 `--plugin-dir` 加载应用运行目录中的共享技能插件；插件的技能目录链接到用户原始目录，不复制凭据，也不修改全局客户端配置。同名 Claude 用户技能优先保留。
- OpenCode 兼容服务继续隔离业务数据库、状态、配置目录和缓存。转换用户配置时保留 MCP、插件、Skills 路径、instructions、V1 agent、tools 和 permission；V2 `mcp.servers`、`disabled`、`timeout.startup` 转为 V1 对应字段。应用交互插件仍追加安装。
- 共享用户技能来源：Codex 用户 skills、Claude 用户 skills、`.agents/skills`、OpenCode 用户 skills。排除 Codex 内置 `.system`、客户端插件缓存和账户同步专属技能的人工跨端投影。原生客户端自身仍按原规则加载它们。
- OpenCode 执行者开放原生 `skill` 和已配置 MCP 的工具命名空间。外部目录保持默认 deny，仅允许技能目录用于读取支持文件。写工具仍经过应用 Hook 的项目路径检查。历史执行 Session 只有 Owner、目录、旧权限均精确匹配且确认 idle 时才升级权限；不更换 Session，不重放任务。
- Codex 的原生配置和技能目录保持继承。其他客户端的用户技能以简短路径索引补充到提示，按需读取；这部分是路径索引，不是声称 Codex 有额外原生技能根配置。
- “先讨论”保留原只读工具限制和 MCP 限制。技能可能包含命令预处理或 fork 执行，因此讨论模式只读取技能文件，不激活可能产生副作用的 Skill。
- 用户于本任务明确授权限定 Hook 分类修改：允许 Skill 加载、Serena 读取工具，以及绑定当前工作区的项目选择。桌面、越界写入、策略/Hook 文件修改和系统高风险操作的原拦截保留。应用层 Hook 不构成 Windows 权限沙箱，客户端专属工具和插件内部执行不因技能发现而被宣称全面验证。
- MCP 初始化可使用用户配置的 120 秒启动窗口；OpenCode 模型发现的原 20 秒限制调整为有界 150 秒，以容纳原生 MCP 和隔离插件冷加载。

## 验证

根 TypeScript 构建通过。适配器、Skills、讨论和交互策略组合 104 项中，103 项通过；唯一失败在未修改 TEST 上复现，详见已有问题记录 `problems/2026-10-12-legacy-acceptance-regression-waits.md`。没有修改这条断言，不宣称完整回归通过。

补充的流式传输、压缩配置、服务退出、共享技能和 Hook 专项 17/17 通过；Session 旧权限升级、身份恢复、错误工具结果专项 3/3 通过。

无模型原生发现：Claude Code 61 个技能，OpenCode 61 个技能；OpenCode 独立服务中的 Serena 状态为 connected。证据：`D:/PersonalAgent-data/native-capabilities-20261013/native-capabilities.json`。

真实 Controller 验证：Claude Code Run `3b0001c5-42ae-4447-914e-7a3f38a8841b` 完成 Plan、Execute、Review，执行者调用原生 Skill、Serena，并生成正确 supporting-reference 产物。证据：`D:/PersonalAgent-data/native-capabilities-20261013/real-fd846ffe/results.json`。

OpenCode Run `a24cffa6-5c6f-462a-b1b5-d6f7756879a9` 的审计确认原生 skill、read、Serena initial_instructions 和 apply_patch 调用完成，产物正确；最终模型响应在 180000 ms 超时，Run 保留为 paused，不宣称流程闭环。首次验证脚本只按 `data.phase` 过滤，漏掉 OpenCode 的 `scope=opencode-execute:*` 事件；已修正后续脚本，不改写历史审计。后续独立模型发现探针遇到初始化超时和 fetch failed，未因此关闭运行隔离、删除原插件或重放该 Run。

没有 GUI 验收，没有逐个外部服务/客户端专属插件验收，没有把技能目录存在或技能列表可见等同于每个技能均能完成外部操作。用户的 `lark-lesson-plan-rebuild` 元信息在本轮读取时已有效，本任务没有修改该全局技能。

## 使用

此功能随本地 TEST 源码交付。运行构建与源码提交分别记录；打开的 DEV/TEST 进程不会被本任务重启。运行旧构建的实例需在安全节点重新构建并加载版本，才会使用新逻辑。

无模型发现复验：

```powershell
node scripts/validate-native-capabilities.mjs D:/PersonalAgent-data/native-capability-check
```

真实验证脚本仅作用于其自建的隔离验收项目，调用正式 Controller/适配器并保留计数、Session 和审计：

```powershell
node scripts/validate-shared-skills-real.mjs D:/PersonalAgent-data/native-capability-check
```

跨端共享的是用户技能的指令和支持资源；某个技能若依赖 Codex/Claude 专属工具、连接器、账户或桌面会话，仍需要对应客户端能力。能力错误应原样报告，不伪装为可用。

## 最新组合

实现提交 `805896e`；持有 Git common directory 中本任务独占创建的 `personalagent-test-integration.lock`，整合最新 TEST `85c17366fd3f0ff8e6d3b471e0f35890d40f6917`，组合提交 `78eb66e`，无冲突。组合构建通过，适配与权限专项 16/16、最新 Context Integrity 专项 4/4 通过。最终组合的真实无模型发现再次确认 Claude/OpenCode 各 61 个技能、OpenCode Serena connected；证据位于 `D:/PersonalAgent-data/native-capabilities-20261013/final-combination/native-capabilities.json`。实际本地 TEST 交付提交以 Git 历史为准。

## 用户授权交付 DEV

用户随后明确要求合入 DEV。从 DEV `47ff4960019b35eb77f66186d2c2eccafd03bbae` 建立独立候选，正常合并已验收 TEST `f1262b9`，候选组合 `369c396`；只新增本功能的 15 个文件，不带入额外 TEST 功能，保留 DEV 原有历史和行为。候选构建通过，配置/Skills/Context/流式专项 20/20、Session 升级与讨论/原生配置专项 4/4 通过；真实无模型发现再次确认两端各 61 个技能、Serena connected。

交付前检查未发现 DEV 桌面实例或执行 Worker。DEV 原有两份未提交 schema 及未跟踪文件不属于本任务，不纳入提交；构建前后按原始字节保存与恢复导出的 schemas。共享 DEV 集成锁覆盖目标核对、合并和构建，证据保存在 `D:/PersonalAgent-data/native-capabilities-dev-20261013/`。没有自动启动或重启实例，没有推送或更新 MAIN。此前 OpenCode 模型超时和全量回归边界仍保留，不因交付 DEV 改写为通过。
