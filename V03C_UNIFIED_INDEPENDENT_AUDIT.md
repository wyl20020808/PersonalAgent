# V03C 统一交付独立审计报告

- 审计对象：`D:\PersonalAgent-worktrees\unified-review`（分支 `codex/v03c-unified-review`），被审主报告 `V03C_UNIFIED_VALIDATION.md`
- 来源 A：`D:\PersonalAgent-worktrees\integration`（分支 `codex/v03c-integration`，HEAD `ed9a419`）
- 来源 B：`C:\Users\WYL20\.codex\worktrees\v03c2-c3-integration\PersonalAgent`（分支 `v03c2-c3-integrated`，HEAD `4ee62f2`）
- 审计性质：只读独立审计。未修改任何产品源码、配置、日志与分支；未 commit/merge/push；未调用任何真实付费 CC/Codex（全部复现均在 Mock/本地夹具下）；未触碰 CafeGame/FishEatFish/OpenWorld；未批准任何交付。
- 动态测试位置：新 D 盘独立目录 `D:\PersonalAgent-validation\independent-audit-run` 与 `D:\iar`（拷贝 dist + node_modules junction，副作用仅限 `.validation/*`、临时 git 仓与 junction）。
- 审计日期：2026-10-08。

---

## 1. 总体结论

| # | 维度 | 结论 | 一句话依据 |
|---|------|------|-----------|
| A | 两套来源统一性（10 子项） | **PASS** | 模式字段统一为 `projectMode` 且旧 `workspaceMode` 别名在 schema/store/CLI/GUI IPC 四层一致迁移并各有测试；未变更文件与 B 逐字节一致；统一成果=A HEAD+未提交工作区（报告自认，属实） |
| B | 原生 Agent 能力 | **PARTIAL** | 代码接入级证据完整（CC CLI JSON/stream-json、Codex SDK 原生线程、预算、公开事件流），Mock 与本地夹具级通过；真实模型级验证为 0（全部日志 realAgentCalls=0，报告自认） |
| C | 普通用户 GUI 流程（13 子项） | **PASS** | 13 项自动化检查日志齐全且断言有实质内容；另有一轮真实 Electron 人工运行（native-ui）完整走通两任务 Mock 流至 completed；注意自动化轮对话框为 stub（见 UAF-003，报告已如实区分） |
| D | Controller 可靠性 | **PARTIAL** | 找到一个 REPRODUCED 反例（UAF-001）：深路径下克隆静默损坏，Controller 将 git 基础设施错误降级为 evidence issue，最终误诊为 `Rework limit reached`；未发现数据损坏/重复修改类反例（交付幂等、锁、恢复均有测试覆盖且独立复现通过） |
| E | GUI 事件真实性（10 子项） | **PASS** | 遥测来源真实（claude-cli stream-json / codex-sdk runStreamed）、thinking 块刻意排除不伪装、redact 全覆盖、audit 哈希链逐行校验、截图经 personalagent:// 白名单；Mock 轮全链 realAgentCalls=0 无冒充真实调用 |
| F | 测试可信度 | **PASS** | 独立复现：144/144（短路径）、新测试定向 26/26、tsc 零错误；断言实质性（反例驱动，非恒真）；但存在报告未充分披露的路径深度敏感性（并入 UAF-001） |
| — | 保护与合规 | **PASS** | 20779 个保护文件前后 SHA-256 逐条比对 changed=[] 属实；A/B 源树干净；main HEAD 未动；无 commit/merge/push |
| | **整体** | **CONDITIONAL GO** | 代码质量与测试可信度高、统一工作扎实；但有 1 个 P1 可靠性缺陷（UAF-001）、统一成果尚未提交、双根历史需内容级合并策略、真实模型端到端未验证。满足下述合并前阻断项后可 GO。 |

**GO / CONDITIONAL GO / NO-GO 判定：CONDITIONAL GO。**

---

## 2. 审计方法与证据分级

- 三级证据口径：**代码接入级**（源码实现存在且结构合理，tsc 通过）／**Mock 通过级**（Mock 或本地免费夹具下运行通过）／**真实模型验证级**（真实 CC/Codex 调用）。本审计全部动态证据均在前两级；第三级证据在本交付中不存在（与主报告第 6 节自认一致）。
- 问题状态口径：`CONFIRMED`（静态证据确凿）／`REPRODUCED`（本审计独立动态复现）／`SUSPECTED`／`UNKNOWN`。理论可能性一律不标 CONFIRMED。
- Git 事实全部经 `git -C` 独立核验：两孤立根 `1b5eb51` 与 `f805e7c`，`merge-base` 无输出（exit 1），两根 tree hash 相同（`8d70575`），根差异为空。unified HEAD `ed9a419` 与 A HEAD 为**同一提交**，统一成果存在于工作区（24 个修改 +214/−159，9 个未跟踪新文件）。
- code-manifest.json 33 文件 SHA-256 与当前工作区 100% 匹配，无事后篡改迹象。
- 独立测试环境：`D:\PersonalAgent-validation\independent-audit-run`（深路径）与 `D:\iar`（短路径），均为新目录，先确认副作用后才执行。

---

## 3. 问题清单

### UAF-001 深路径下隔离克隆静默损坏，Controller 误诊为返工超限 — **P1 / REPRODUCED**

| 项 | 内容 |
|----|------|
| 位置 | `src/workspace.ts` L43–L46（克隆校验）、L95–L97（evidence 降级）；`src/incremental.ts` prepare（isolated Git 路径） |
| 触发 | 隔离模式 + Git 仓库，且 workspace/runtime 路径深度落入静默损坏区间（实测约 ≥195 字符；≥218 字符时 git 直接 `$GIT_DIR too big / invalid index-pack output` exit 128，会被 `git()` 抛错拦住，反而不进入本缺陷路径） |
| 实际 | `git clone --no-local` 生成空 pack（209 字节）+ 正常 idx，clone exit 0；createRun 的克隆校验 `rev-parse HEAD === base` 只解析 ref 不触碰对象库，通过；后续 `git diff --check` exit 128 且 stdout 为空，被 `collectEvidence` 记为伪 issue `'Diff whitespace check failed: '`（空串），`git diff base` 无输出，次轮记 `'Current task made no changes'`，最终 `paused: 'Rework limit reached'` |
| 期望 | git 基础设施错误（exit 128）应抛 FlowError 中断并明确报错，而非降级为 evidence issue 导致误诊；克隆后应做对象级校验 |
| 证据 | 独立全套 144 项在深路径目录 136/144（8 项失败全在 controller.test.js，均为该根因的连锁表现）；同批产物在短路径 `D:\iar` 144/144 pass；单测定位复现：同测试长路径 fail / 短路径 pass；手工最小复现确认两个深度区间的行为分界 |
| 影响 | 无数据损坏、无付费泄漏（最终停在 paused）；但 Controller 误判运行状态，用户看到的是"返工超限"而非真实的 git 环境故障；违背"不误判成功/不误导用户"的可靠性目标 |
| 修复方向 | ① 克隆校验追加 `git cat-file -e <base>` 对象级存在性检查；② `diff`/`status` 类 git 命令 exit≠0 一律按 FlowError 抛出，不写入 issues；③ prepare 阶段对 workspace/runtime 路径长度预检（>约 180 字符告警或拒绝） |

### UAF-002 Claude 可执行文件路径硬编码 — **P3 / CONFIRMED**

| 项 | 内容 |
|----|------|
| 位置 | `desktop/src/service.ts` L76、L90：`claudeExecutable:'C:/Users/WYL20/.local/bin/claude.exe'` |
| 触发 | 在任何其他用户目录/其他机器上启动 desktop real 模式 |
| 实际 | 硬编码本机绝对路径，availability 检查与 real 启动在该路径不存在时失败 |
| 期望 | 从设置/环境变量/PATH 探测，允许用户配置 |
| 证据 | 源码静态确认（两处字面量） |
| 修复方向 | 移入持久化 settings 并提供 GUI 配置项；默认按 `where claude` 探测 |

### UAF-003 自动化 Electron 验收使用 stubbed 对话框 — **P4 / CONFIRMED（披露口径问题，非功能缺陷）**

| 项 | 内容 |
|----|------|
| 位置 | `desktop/validate-unified-electron.mjs`（launch 内 `app.evaluate` 将 `dialog.showOpenDialog/showMessageBox` 替换为 stub，结果 JSON 自述 nativeDialogPolicy） |
| 触发 | 阅读报告第 5 节"13/13"时若不区分轮次 |
| 实际 | 自动化 13/13 全程使用 stubbed 对话框；真实原生对话框仅经 native-ui 人工轮（observed-completion.txt，真实 Electron 窗口 + 原生选择目录）验证 |
| 期望 | 已达成（报告如实区分，脚本自述策略）；审计口径要求读者不得将 13/13 理解为"原生对话框已自动化验证" |
| 修复方向 | 可选：增加一轮不 stub 的真实对话框冒烟检查，或在报告标题层面更显著标注 |

### UAF-004 direct 交付沿用 50 文件 / 2MB 预览限制 — **P4 / CONFIRMED（已知残留）**

- 位置：`src/delivery.ts`（deliverySchema 限制对 `kind:'direct'` 同样生效）。
- 影响：大改动 direct Run 无法生成确认单，流程卡在交付前（不会错误放行，属能力限制而非安全问题）。主报告第 6 节已列为残留。
- 修复方向：为 direct 提高文件数/单文件上限或分批预览。

### UAF-005 统一成果未提交 — **P4 / CONFIRMED（流程风险）**

- unified 分支 HEAD 与 A HEAD 为同一提交 `ed9a419`；全部统一成果只存在于工作区（24 M + 9 未跟踪文件），`code.patch` 不含未跟踪新文件（仅 manifest 覆盖其 hash）。报告自认，属实。
- 风险：单点丢失（误 checkout/clean 即失）；也使后续合并无 SHA 可引用。
- 修复方向：立即在统一分支（或新分支）commit。

---

## 4. A/B 差异与统一取舍核对表

| 主题 | A（integration） | B（v03c2-c3-integration） | 统一后 | 审计意见 |
|------|------------------|---------------------------|--------|----------|
| 模式字段 | `workspaceMode` | `projectMode` | `projectMode`，旧名作别名（同值删别名、冲突拒绝，schema/store/CLI/GUI 四层一致） | 与报告一致，测试覆盖（unified-contract ①③、desktop unified ①②） |
| 无测试项目 | 无此阻断 | tests minItems:1 阻断真实开发 | minItems:0 + 逐任务人工验收（digest 绑定 Run/任务/快照/规则/Diff，过期/文件变/规则变/重放/错阶段全拒；完成仍 evidence.passed=false、GUI 明示） | 报告声明的设计替换，防伪机制实测有效；不能伪造独立验收 |
| direct 交付预览 | 直接拒绝 | 可预览/精确批准/重新独立检查/零源写入 | 采用 B，附 `written:[]`、mtime/快照不变断言 | 测试实测通过（direct-project、project-modes） |
| 最终测试范围 | 分阶段 | 最后任务全量重跑 | 采用 B（native+最后任务跑全部配置测试） | 测试④覆盖早期任务回归 veto |
| Mock marker | 固定字节 | 用户文件保护 | B 保护 + A 固定字节（hello/done 已存在且内容不同则拒） | 测试覆盖"拒绝覆盖" |
| 普通目录/空项目/dirty Git 隔离 | 保留 A | — | 保留 A 语义（不伪造 Git、保留未提交上下文） | project-modes 6 组合实测 |
| 恢复与锁 | A 基础 | — | A + direct 初始化锁（win 锁目录+pid 探活+死锁清理） | 跨 Run/跨 runtime 拒绝实测 |
| GUI 入口 | 简洁 | 高级入口多 | A 简洁 + B 旧入口折叠保留（"高级配置、兼容模式与 Mock 场景"） | legacy 13/13 + legacy-flow 17/17 日志属实 |
| 决策刷新/交付按钮 | — | — | 统一新增修复 | service.test 轮询 `!result.active` 修复可见 |
| 未变更文件 | — | — | budget/global-budget/application/dependencies/codex-worker/rules/failure/screenshots 与 B 逐字节相同 | 逐文件比对确认，无静默漂移 |

**遗漏核对结论**：unified 对 B 的 src/test 为严格超集（新增 manual-acceptance、project-files、process-stream 及三个新测试文件）；未发现 B 功能被无说明丢弃；两处设计替换（无测试处理、direct 预览）均在报告中显式声明。

---

## 5. 合并前阻断项（须全部完成才可 GO）

1. **提交统一成果**：在统一分支或新分支 commit 全部 24+9 文件，形成可引用 SHA（UAF-005）。
2. **修复 UAF-001** 或至少落地防护（对象级克隆校验 + git 基础设施错误改抛 FlowError + 路径深度预检），因本机工作目录 `D:\PersonalAgent-worktrees\...` 已接近实测静默区间，隔离 Git 流程在本机即存在现实触发面。
3. **双根历史合并策略决策**：`codex/v03c-*` 系（根 `1b5eb51`）与 `main`（根 `f805e7c`）无共同祖先但根内容树相同，需显式选择内容级合并方案（如以一方为准 rebase/或 `git merge --allow-unrelated-histories` + 冲突审查），不得盲目 merge。
4. **UAF-002**：任何非原始机器使用前必须移除硬编码 claude 路径（不阻断本机合并）。

---

## 6. 后续建议（非阻断）

1. **真实模型冒烟验证**：在一次性 D 盘仓库上以极小预算各执行 1 次 CC 规划/审查与 Codex 开发（受控、人工在场），补齐第三级证据；当前所有"原生能力可用"结论仅到代码接入级。
2. CI/本地回归矩阵加入"深路径"维度，固化 UAF-001 回归测试。
3. direct 交付大改动支持（UAF-004）排期。
4. Electron 验收脚本维持 stub 披露口径；可为原生对话框补一轮免 stub 冒烟。
5. 继续保持 audit 哈希链 + 保护清单（本次 20779 文件 changed=[] 验证有效）作为每次交付的标准动作。

---

## 7. 独立验证记录（证据索引）

| 验证项 | 方法 | 结果 |
|--------|------|------|
| Git 拓扑与未提交状态 | `git -C` log/merge-base/diff/status/tree hash | 与报告第 1 节完全一致；manifest 33 文件 hash 100% 匹配 |
| 全套后端测试 | `D:\iar` 短路径独立目录，node --test dist/test/*.test.js | **144/144 pass** |
| 全套后端测试（深路径） | `D:\PersonalAgent-validation\independent-audit-run` | 136/144，8 失败均溯源至 UAF-001 |
| 新测试定向 | unified-contract/direct-project/project-modes | 26/26（4+9+13），与报告计数一致 |
| 类型检查 | 根 tsconfig + desktop tsconfig --noEmit | 双零错误 |
| GUI/Electron 数字 | 日志尾部计数核对（36/36、13/13、13/13、17/17）+ 脚本与测试源码审读 | 与报告第 4 节一致；对话框 stub 口径见 UAF-003 |
| native-ui 人工轮 | observed-completion.txt（412 行 Accessibility 树）+ run 47c00dda 工件（state/audit/recovery/review 收据/native-result/标记文件） | 真实 Electron 窗口完整两任务 Mock 流至 completed；realAgentCalls=0 |
| 保护清单 | protected-before/after.json 20779 条逐条 hash 比对 | changed=[]，无篡改 |
| 付费调用 | 全部日志 realAgentCalls=0；本审计亦零付费 | 无真实 CC/Codex 调用，合规 |

*本报告为只读审计产物，未改动任何被审文件。*
