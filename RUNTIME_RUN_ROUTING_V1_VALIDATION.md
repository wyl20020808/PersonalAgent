# 正式任务路由与 Run 历史关联修复验收

日期：2026-10-09（Asia/Shanghai）。任务发起实例：MAIN。开发基线：最新本地 dev `aff80240342176ec196fedb2028905f489afced9`；开始与结束时核对 main/dev/任务 HEAD 均为该提交，仓库未配置远程。修复分支：`fix/runtime-run-routing-v1`。工作目录：`D:\PersonalAgent-worktrees\tasks\runtime-run-routing-v1`。

本次由当前 Codex 会话诊断、开发和自测，没有创建新的 PersonalAgent 付费 Run，也不把自测称为 Controller 独立交付验收。未提交、合并、push、发布或停止 MAIN/DEV。未修改 OpenWorld、Snapshot 限制或运行实例的源码和历史数据。

## 一、现场结论

### Snapshot 任务确实新建了 Mock Run，没有创建 Real Run

- MAIN 最新开发消息时间为 21:47:13，消息 ID `5b27618a-b778-4dc2-8f95-51328960593d`，会话 ID `49d182cd-466d-4890-86b3-a4515b0dfea9`。
- 消息持久化关联 Run `ac3a4e6b-cf08-4981-87bb-0a4bc1f10a41`，Profile `87c96f00-8202-4f8d-8510-457d07086986`。
- 原 runtime 为 `D:\PersonalAgent\.desktop-data\projects\09c5bf1c91bb10c239945c8171180ad0\runtimes\6d0c7cc2cfc3460d`；source 和 workspace 均为 `D:\PersonalAgent-worktrees\dev`，工作方式 direct。
- Session settings、Profile 配置、Run state 和 `desktop-user-start` 审计全部为 `mock`；state 为 completed，`claudeCalls=0`，CC Session 为 `mock-claude-session`，Codex Thread 为 `mock-codex-thread`。验证了完整 34 条审计事件的哈希链，`desktop-session-link` 精确绑定上述会话和消息。
- `hello`、`done` 来自本轮 MockAgents 固定计划和标记文件执行，并非 UI 将旧 Run 串入。CLI 根据持久化的 Run config 选择 MockAgents，未派发 RealAgents。

根因：新会话、项目检测和创建 UI 默认 Mock；新建会话还会继承旧项目/会话的 Mock 设置。后端忠实执行了 Mock 配置，但群聊和完成事件使用通用“开发完成”文案，给出了错误的完成含义。原大型 Snapshot 开发没有真正完成。

### 0290a274... 只有 MAIN 中的空目录，没有可读取的持久化 Run

- 原 Profile：`a5186026-9f58-4873-a604-ec38378cbd3e`，mode=mock，目标为 OpenWorld。
- 原 runtime：`D:\PersonalAgent\.desktop-data\projects\8e385b4ba92e9d229e7a7c17e4f23856\runtimes\7edd1eb5dfd84bdb`。
- 其中 `runs\0290a274-043c-4949-bab5-d28bf4ac7a04` 创建于 21:41:01.113，文件数为 0，没有 state 或 audit。MAIN 和 DEV 的 Session 均没有此 ID 的关联记录。
- MAIN 会话 `659f54cf-6fff-4861-828f-8309567cdf3f` 的消息于 21:41:00.988 发出，保留 `Project snapshot limit exceeded (100 MiB / 20000 files)`；该消息后来被取消，没有 runId。时间、目标和配置与上述准备失败路径吻合。
- DEV 独立数据目录 `D:\PersonalAgent-data\instances\dev` 中，同类失败对应另一空目录 `095e9ba9-afa5-4735-9a6e-39ba772273dc`，位于该实例 runtime `projects\8e385b4ba92e9d229e7a7c17e4f23856\runtimes\6b92ba96424d4bd8`。不是同一 Run。
- 逐一核对两个实例注册的全部 runtime，包括历史 CafeGame、FishEatFish、FPSArena 外部 runtime，未发现该 ID 的完整 Run。未通过任意目录扫描猜测跨实例归属。

根因：Store 构造先创建 Run 目录；项目快照准备失败后，旧 Controller 只为 Git 类错误保存失败 state，普通快照异常直接抛出。Session 的关联回调尚未执行。overview 每次扫描所有 UUID 目录，将空目录交给 store 读取，从而持续产生误导性的 `Run not found in selected runtime`。这里的 selected runtime 指扫描中的上述 MAIN Profile，并非选错 DEV runtime；没有证据表明存在可恢复的完整 Run。

## 二、最小修复

- `desktop/src/service.ts`、`sessions.ts`、`ProjectCreate.tsx`、`GroupWorkspace.tsx`、`App.tsx`：新正式任务默认 Real，不继承旧 Mock 模式。新 Mock 会话记录明确选择；缺少明确选择记录的旧 Mock 会话仍可读取，但不能继续派发新 Mock 开发任务。显式任务模式与 Profile 不一致时拒绝启动。
- `GroupWorkspace.tsx`、`thread.ts`：Mock 完成明确显示“未完成真实开发目标”，旧 Mock 会话显示用途说明，原历史记录保持不变。
- `service.ts`、`sessions.ts`、`types.ts`：Session 引用保存原 runtime；读取绑定原 Profile、Run ID 和项目，拒绝 runtime/Run identity 不一致。归属修复仅考虑已注册的只读历史 Profile；新引用必须匹配保存的原 runtime，旧引用必须有通过哈希链校验的会话/消息审计关联。缺失或多个候选时不猜测、不借用其他实例数据，不赋予历史 Profile 写权限。
- `service.ts`：MAIN 和 DEV 均禁止写入另一实例已声明的数据目录，包含 junction 路径。历史配置仍可显式只读导入；原项目写入锁、审批和 Project Context Guard 保持原规则。
- `service.ts`、`sessions.ts`、`App.tsx`、`GroupWorkspace.tsx`：缺失记录单独返回原因，overview 不再将其作为全局反复告警；历史页和会话展示原 ID、runtime/原因。会话中的正常消息及其他有效 Run 继续可读。回放跳过不可用记录，不拿前一轮冒充最后一轮；会话选中时不自动选择无关活跃 Run。detail 检出历史缺失后取消该记录的轮询。
- `src/controller.ts`、`service.ts`、`sessions.ts`：准备异常保存失败 state 和原错误，关联确切消息，不启动 Agent。旧空目录不补造 state、不删除、不迁移。

测试修改位于 `desktop/src/service.test.ts`、`sessions.test.ts`；新增 `desktop/check-runtime-routing-ui.mjs`。构建生成的 schema 改动已在独立 Worktree 恢复为基线，不包含在修复中。

## 三、验证结果

- 根目录 `rtk npm test`：构建通过，Controller 全量 **254/254** 通过，包括独立 runtime 的项目写入互斥、恢复、审批、Project Context Guard 等已有回归。
- desktop `rtk npm run check`、`rtk npm run build`：通过。构建仅有已有依赖的 `use client` 指令提示。
- desktop `rtk proxy node --test --test-concurrency=1 out/service.test.js out/thread.test.js out/unified.test.js out/sessions.test.js`：**78/78** 通过，日志保存在 `desktop/runtime-routing-tests.log`。
- desktop `rtk proxy node check-runtime-routing-ui.mjs`：**4/4** Renderer 静态渲染检查通过：新会话默认 Real、项目创建默认 Real、缺失历史原因、Mock 完成文案。未执行真实窗口交互；不声称完成 Electron 实际使用验收。
- `rtk git diff --check`：通过。
- 新增针对性覆盖：旧 Mock 配置不能被新真实任务继承或冒充；旧隐式 Mock 不能继续派发；模式/Profile 不一致被拒绝；项目/Profile/重启后仍读原 Run；缺失历史不借用另一 runtime；原 runtime 改变后只读可信恢复及禁止写入；101 MiB 本地夹具准备失败留存 state 和消息关联且不启动 Agent；MAIN/DEV 和 junction 的数据写入隔离。
- Real 配置路由检查全部截获 launch，实际执行循环仅用 Mock/注入适配器，本次付费 Agent 调用为 0。

首次测试发现新增所有权测试污染共享 Profile，以及已有测试仅等 phase=completed、未等待子进程退出的锁释放竞态；已隔离测试数据并等待 active=false。并发全量测试也曾触及固定等待窗口，最终按顺序运行 Desktop 全量回归成功。没有为测试放宽产品锁或审批。

## 四、已修复与待处理

已修复：默认 Mock 路由、Mock 完成含义、运行归属读取和只读恢复、缺失历史反复提示、未来准备失败的持久化关联。

待处理：修复尚未整合或部署，当前运行中的 MAIN/DEV 仍运行旧版本；后续需按正式交付审批整合并在安全时机验收实际 Electron 界面。原空目录缺少数据，无法恢复完整 Run；已保留并准确解释。大型 Snapshot 方案和原大型 Snapshot 开发目标不在本次范围，仍未完成。
