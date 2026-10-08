# V03C 双集成统一验收报告

日期：2026-10-08。状态：独立 Worktree 中的未提交审核稿。完成本地构建、Controller、GUI 与实际 Electron 验收；未调用真实付费 Agent，未合并 main，未批准任何既有交付。本报告不是实际模型开发能力验收。

## 1. Git 历史与集成方式

先比较两套实际代码、历史和测试，再进行集成；原 A/B 工作树保持干净。

| 项目 | A | B |
|---|---|---|
| 目录 | `D:/PersonalAgent-worktrees/integration` | `C:/Users/WYL20/.codex/worktrees/v03c2-c3-integration/PersonalAgent` |
| 分支 | `codex/v03c-integration` | `v03c2-c3-integrated` |
| HEAD | `ed9a419dbd8170a37193e64fa30af983ecf05cfb` | `4ee62f2d2a32ce4c0303881894f32e9513b058bd` |
| 根提交 | `1b5eb51441e3bc73a9ed672b347ce468d38a6e55` | `f805e7c9155e0b47559b1d4180453461f14b8106` |

`git merge-base A B` 返回 1：不存在共同祖先。两根提交的代码树却完全一致，均为 `8d70575b7d3429f10cbc5d290556e5bcc05e5465`。因此存在可以逐文件比较的相同内容基线，但不存在普通 Git 合并基线。没有执行 merge、cherry-pick、重写历史或覆盖源工作树。

统一成果位于 `D:/PersonalAgent-worktrees/unified-review`，分支 `codex/v03c-unified-review`，HEAD 仍是 A 的 `ed9a419`。在 A 的完整实现上手工移植 B 的互补行为，再加入统一契约与回归修复。最终修改尚未提交，不能用一个新提交 SHA 假装已提交。审阅者应依据下述来源及文件清单审核内容，不能直接把两条无共同祖先的分支强行合并到 main。

### 各自独有提交

A 的全部后续提交在 B 历史中不存在：

| 提交 | 主要实际功能 |
|---|---|
| `07d904a` | 执行契约与并行开发文档 |
| `f0f3564` | 普通目录、空项目、直接/隔离开发及真实文件快照 |
| `43c30bb` | 文件夹 GUI、自动配置、持久授权 |
| `5507288` | 普通目录 GUI 与模式持久化测试 |
| `f97f85e` | 项目锁、恢复与证据约束 |
| `2dca086` | Dirty Git 上下文、Windows 进程失败边界 |
| `5edc6ba` | 验收文档 |
| `ed9a419` | GUI/Electron 集成与隔离交付 |

B 的全部后续提交在 A 历史中不存在：

| 提交 | 主要实际功能 |
|---|---|
| `057443a` | `projectMode` 概念及普通目录 native direct |
| `8e8201e` | 文件夹、最近项目 GUI |
| `3a2951d` | 保护已有用户 marker 与原生验收说明 |
| `1a8be30` | 旧 Electron 视图回归夹具 |
| `ec43c27` | direct 交付仅确认、最终全部阶段测试等集成行为 |
| `df7da5c` | 验收/Windows 边界说明 |
| `7a60bd7` | 旧 GUI 完整操作流程回归 |
| `4ee62f2` | 最终集成报告 |

B 的 direct 测试与两个 Electron 脚本经过适配并保留；代码移植以 `057443a`、`3a2951d`、`ec43c27` 的最终行为为依据，没有完整复制 B 的 Controller。完整 SHA 可由上述两个 HEAD 各自 `git log --reverse` 唯一追溯。

## 2. 保留与舍弃

| 范围 | 最终选择及原因 |
|---|---|
| 普通目录、空项目、Dirty Git 隔离 | 保留 A。独立副本保留 Git 上下文及未提交内容，普通目录不初始化伪造 Git |
| 文件证据 | 保留 A 的字节快照：空文件、删除、未跟踪内容与两角色原生写入均进入 Diff；不采用 B 的较窄 Git/忽略文件收集方式 |
| 恢复、锁、Windows 进程 | 保留 A 的恢复检查点、陈旧锁判断、cwd/管道失败处理；增加 direct 初始化锁 |
| 原生执行 | 保留 A 的完整 native 适配器，保留 B 对 direct/proposal 不兼容的约束 |
| 模式字段 | 采用 B 的 `projectMode` 名称；A 的 `workspaceMode` 仅作旧配置输入别名 |
| direct 交付 | 移植 B 的可预览、精确批准、重新独立检查、零源写入确认；舍弃 A 的 direct 预览直接拒绝行为 |
| 最终测试 | 移植 B 的最后任务重跑全部配置阶段，避免 reviewer 最后一次修改破坏早期任务 |
| 无测试项目 | 舍弃 B 的真实开发入口阻断；补充逐任务人工验收，不伪造自动通过 |
| Mock marker | 保留 B 的用户文件保护。只允许 A 已知固定生成字节的安全重复 Mock；不同用户内容明确拒绝 |
| GUI | 保留 A 简洁文件夹入口与最近项目；补回 B 旧配置/Mock 场景高级入口及完整旧流程测试 |
| 决策刷新 | 新增操作后立即刷新任务与证据摘要，修复人工节点换任务后旧摘要无法操作 |
| 进程结束竞态 | 交付按钮等待 Controller 活动进程退出，防止 completed 状态与进程锁释放之间的竞态 |

原 `native-agent.ts`、真实 Agent 调用及进程执行能力没有被降级为工具白名单。Codex 保留 native 完整访问、网络与非 Git 项目支持；CC 保留原生读写、Shell、测试、调试、Skills/hooks/MCP 及公开事件接口。没有新增模型覆盖参数，没有修改用户 `.codex/config.toml` 或 `.claude/settings.json`。这些能力由源码与本地替身测试确认；真实供应商会话尚未验证。

native 角色自行改文件后，Controller 只采集实际证据，不再把 native 结果作为 proposal 重复应用。Codex 开发及 CC 审阅后的写入都进入文件快照、累计 Diff、审计与独立复验。direct 最终确认返回 `written: []`，审计记录 `sourceWrites: 0`；isolated 交付只将副本成果应用一次。

## 3. 统一配置与人工验收契约

三个维度分别配置：`mode: mock | real`、`executionMode: native | proposal`、`projectMode: direct | isolated`。规范定义同步写入两份执行契约及 README。

1. 只给旧 `workspaceMode` 时迁移为 `projectMode`；两字段相同可接受并删除别名；不同值必须报错。原始数据先做 schema 校验，再规范化，避免无效持久化状态被悄悄修复。
2. 保存配置和最近项目仅写规范字段；加载旧 Run/config 和最近项目时迁移。冲突的持久配置也拒绝，不只检查新建 IPC。
3. direct 默认 native，明确 proposal 时拒绝。必须有匹配解析后真实项目路径的 `directAuthorization: { projectPath, acknowledgedAt }`，项目也必须在 `allowedRepositories` 中。授权不等于付费调用确认。
4. 显式 isolated 支持普通目录、空项目与 Dirty Git。未给模式且没有 Git 自动使用普通目录隔离；未给模式且存在 Git 保留旧 clean-Git 隔离语义，以兼容旧 Run/交付证明。
5. 项目可以跨盘，运行数据仍必须位于项目外的 D 盘目录。普通项目 GUI 默认 Mock/native/direct，第一次直接修改显示 Windows 授权；用户可在高级设置选择 isolated/real。保留本地默认模型。
6. `tests: []` 可以开发。Controller 记独立检查 `passed: false`，暂停到人工验收节点。用户必须检查当前任务的实际产物，输入绑定该 Run/任务/快照/规则/Diff 的摘要和非空观察记录。批准时重新采集证据；摘要过期、文件变化、规则变化、重放及错误阶段全部拒绝。
7. 人工验收只完成当前任务，后续任务暂停等待明确继续；每个任务分别验收。最终可显示人工完成，但 `evidence.passed=false`、`testsExecuted=0`，GUI 明示没有自动测试通过。没有测试的人工完成不能生成自动交付证明。
8. CLI 提供 `manual-accept --config ... --id ... --approval SHA --decision ...`；GUI 运行详情提供同等人工节点和原生确认。普通聊天记录不自动批准交付或人工验收。

## 4. 两边测试的互补合并

没有以测试数量选择版本。A 保留普通/空/Dirty 隔离、实际快照、恢复、进程异常及 native 工具事件边界；B 补充 direct 子进程开发/失败/修复、零写入交付、过期批准、跨 Run 锁、marker 保护、跨盘以及旧 GUI 操作流程。

| 验证 | 结果 | 本地证据 |
|---|---|---|
| A 原始 Controller | 131/131 | `D:/PersonalAgent-validation/unified/A-controller.log` |
| A 原始 GUI | 31/31；构建/检查通过 | `A-gui.log`、`A-gui-build.log`、`A-gui-check.log`，同上目录 |
| B 原始 Controller | 124/124 | `D:/PersonalAgent-validation/unified/B-controller-final.log` |
| B 原始 GUI | 35/35；构建/检查通过 | 同目录 B GUI/build/check 日志 |
| 统一 Controller 全量 | **144/144** | `D:/PersonalAgent-validation/unified/unified-controller-final.log` |
| 统一 GUI 全量 | **36/36**；构建/检查通过 | `D:/PersonalAgent-validation/unified/unified-gui-final.log` 及 unified GUI build/check 日志 |
| 最终真实 Electron 新流程 | **13/13**、errors=[]、realAgentCalls=0 | `D:/PersonalAgent-validation/unified/electron-2a5f4470/results.json`，17 张截图 |
| 真实 Electron 旧界面 | **13/13**、errors=[]、realAgentCalls=0 | `D:/PersonalAgent-validation/legacy-electron/ef81fe97-9a41-4da5-be0f-5fcd25b82281/results.json` |
| 真实 Electron 旧完整流程 | **17/17**、errors=[]、realAgentCalls=0 | `D:/PersonalAgent-validation/legacy-flow-electron/47b53809/results.json` |

新测试包括：`test/unified-contract.test.ts` 4 项，覆盖字段冲突/迁移、无 Git 人工验收过期与重放、不虚报通过/交付、最终全部阶段复验；适配 B 的 `test/direct-project.test.ts` 9 项；保留并更新 A `test/project-modes.test.ts` 13 项。GUI 新增 `desktop/src/unified.test.ts` 5 项，覆盖 IPC/最近配置冲突、无测试真实配置在启动 Agent 前的截断验证、direct 零写入交付、两任务人工节点及只读约束。

不保留与最终功能冲突的“direct 不支持”和“real 无测试不能启动”旧断言，改为支持功能及人工验收边界的检查；其余安全边界继续保留。真实调用路径的测试全部使用 SDK/进程替身或在 service.start 之前截断，未调用供应商。

早期失败记录没有隐去：B 从 C 盘运行时触发运行数据必须在 D 盘的环境失败；改 cwd 到 D 后仍有 4 个子进程导入位置失败。最终从 B 原目录运行编译测试、将测试夹具根指定到 D，124 项全部通过。B 测试构建产生的 tracked schema 已恢复到 B 原 HEAD。统一首次全量发现原始持久状态校验问题，修复为先校验后迁移；Electron 首轮发现任务决策刷新与锁释放竞态，修复后重新跑完整相关回归。最终结果不引用这些失败轮次冒充通过。

## 5. GUI 是否实际可用

在实际 Electron 进程中完成了普通文件夹、空项目、Dirty Git、隔离开发及交付、direct 最终确认、无测试逐任务人工验收、最近项目重启恢复、跨盘、三人群聊、角色筛选、Markdown/Diff/审计、可信截图放大与视觉续接、断连恢复、预算、停止及只读历史。窗口 1440/1280 布局检查通过。旧高级配置入口在折叠区，普通用户不需要手写 JSON 或初始化 Git。

自动 Electron 脚本仅为确定性测试替换文件夹和确认对话框的回答，实际主进程/renderer/IPC/Controller 均运行。另用 Windows Computer Use 操作**未替换的原生对话框**：选择 `D:/PersonalAgent-validation/unified/native-ui/empty-project`，界面识别“空项目、普通文件夹无需 Git、0 条目”，填写本地 Mock 目标，点击开始开发，在 Windows 对话框核对该夹具路径并授权直接开发，随后真实窗口三人群聊显示 Mock 完成。Run ID `47c00dda-2bc0-4c2f-973d-af056981cb0e`，持久状态 `completed`；未审批其交付。原生观察文本在 `D:/PersonalAgent-validation/unified/native-ui/observed-completion.txt`，数据与审计在该目录 `data/projects/` 下。

因此本地 Mock GUI 流程确实可操作；不能由此宣称真实模型端到端开发成功。GUI 的 real 配置生成与安全截断已验证，真实 paid 启动被刻意排除。

复现：在统一 Worktree 根执行 `rtk npm run build` 和 `rtk npm test`；desktop 目录执行 `rtk npm run build`、`rtk npm run check`、`rtk npm test`、`rtk npm start`。三个验收脚本位于 desktop，按脚本内专用夹具路径运行。当前 node_modules 是指向 A 已安装依赖的 Junction，仅复用锁定依赖，没有修改 A 依赖；新环境应依据两份 lockfile 分别安装依赖。运行数据需在 D 盘。

## 6. 真实模型测试前的残留问题

- 尚未验证本机 CC/Codex 真实身份、额度、网络、CLI/SDK/provider 兼容、用户 hooks/MCP 行为、默认模型输出质量和真实公开事件流；此次不能作为 paid 模型验收。
- 原生完整访问允许 Shell 访问其他目录。任务范围规则、direct 授权与证据审计保留，但不是系统沙箱；isolated 目录也不收窄本机工具权限。
- 文件快照当前有 100 MiB/20,000 文件上限，拒绝不受支持的符号链接/硬链接。受控文件交付仍限制 UTF-8、单文件 2 MiB、50 文件，不自动交付删除或二进制；Windows cwd 长度和 D 盘运行数据限制仍存在。
- 人工无测试验收依赖用户真实观察，不能证明所有功能正确；必须配置可信独立测试后才能取得自动交付证明。仓库内自测不等于外部可信验收脚本，externalOnly 仍拒绝工作区内脚本。
- 旧 Run/config 可以迁移别名，但不自动批准旧证据；受新版最终全部测试约束的旧成果可能需重新独立验收。
- A 与 main 历史不相连；后续主分支整合必须审核内容基线与文件差异，不能盲目普通 merge/cherry-pick。当前代码尚未 commit。

## 7. 保护范围与审核材料

CafeGame、FishEatFish、`D:/OpenWorld` 没有作为开发/验收目标，也没有调用真实 Agent 或批准已有成果。已对相关代码、配置、文档、真实配置及预算文件、本地模型配置共 **20,779 文件**做前后 SHA-256 校验，最终 `changed: []`。证据为 `D:/PersonalAgent-validation/unified/protected-before.json` 与 `protected-after.json`。校验排除了生成缓存、依赖、构建目录、Junction 与非代码二进制资产，不能宣称完整游戏资产逐字节校验。实际操作只使用全新专用夹具。

A/B 源工作树最终干净；main HEAD 仍为 `f805e7c9155e0b47559b1d4180453461f14b8106`，用户原有未跟踪文件没有处理。没有 push、merge、git commit。先前创建的未使用 C 盘托管 Worktree 已归档，实际成果保留在 D 盘独立 Worktree。

`D:/PersonalAgent-validation/unified/code-manifest.json` 记录最终文件 SHA-256、A/B HEAD 和统一分支；`code.patch` 是相对 A HEAD 的 tracked diff，**不包含未跟踪新文件**。新文件必须随 Worktree 一并审阅，尤其人工验收实现、契约测试和三个 Electron 脚本。审核入口是本报告；后续真实模型试验或主分支整合由用户另行决定。
