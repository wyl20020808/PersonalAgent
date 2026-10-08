# V03C 统一集成审计问题修复与合并前验证

验证日期：2026-10-08。目标目录：`D:/PersonalAgent-worktrees/unified-review`；分支：`codex/v03c-unified-review`。

**最终判断：CONDITIONAL GO。UAF-001 已闭合，统一成果已冻结，当前授权范围内的回归全部通过。** 此结论属于本次自主验证，不冒充原独立审计。真实模型端到端验证、跨机器配置适配和 main 整合仍未执行。

## 1. 成果保护与提交

首次检查实际为 24 个修改文件、10 个新增文件。原统一成果是 24+9；额外新增的是 `V03C_UNIFIED_INDEPENDENT_AUDIT.md`。全部 34 个文件均保留并纳入冻结提交，未丢弃用户修改。

凭据扫描未发现私钥、真实 API Key 或 GitHub Token 候选；检查对象为待提交文件，运行缓存、认证目录、生成的运行状态、日志、截图及依赖没有纳入提交。代码中已有的本机 Claude 可执行路径不属于认证凭据，仍作为 UAF-002 风险记录。

恢复材料保存在 `D:/PersonalAgent-validation/uaf001/`：`backup/` 包含全部修改与新增文件，`freeze-manifest.json` 包含初始 HEAD、status 与逐文件 SHA-256，`tracked.patch` 为二进制 tracked diff，`before.bundle` 保存原 Git 历史。新增文件已独立备份，恢复不依赖只覆盖 tracked 文件的 patch。

- 统一成果提交：`471286224b5e24a978ccb1fb63891b143a78ffd7`，`feat: freeze audited V03C unified integration`。
- UAF-001 独立修复提交：`4495d7365348cd1b4f2690a740f0503eb54e1260`，`fix: reject invalid Git objects and classify infrastructure failures`。
- 本报告单独提交，避免报告自引用提交 SHA；它不会改变以上两个提交。

## 2. 最小复现、实际根因与修复

| 场景 | 修复前 | 修复后 |
|---|---|---|
| 175 字符工作区 | Mock 完成 | Mock 完成，完整 fsck exit 0 |
| 195 字符工作区 | clone exit 0、HEAD 引用可解析；裸 cat-file/diff --check exit 128；Controller 误报 `Rework limit reached` | Mock 完成，fsck exit 0，返工 0 |
| 205 字符工作区 | HEAD 可解析；裸对象读取出现 `Filename too long` / `Not a valid object name HEAD` | Mock 完成，fsck exit 0，返工 0 |
| 220 字符工作区 | clone exit 128，`$GIT_DIR too big / invalid index-pack output` | 准备阶段持久化 `git` 类型失败；保留原 stderr，Agent、执行和返工均为 0 |
| 保留 HEAD 引用、删除实际对象 | rev-parse exit 0，cat-file/diff --check exit 128；原流程已经调用一次规划 Agent，最后归类 unknown | `git-integrity`，首次 Agent 调用前停止；原错误进入 state、GUI 和审计 |

本次成功克隆的 pack 为 210 字节，启用 `core.longpaths=true` 后，195/205 字符路径下实际 commit 与对象库可读取并通过 fsck。因此，本次独立复现确认了**对象读取参数不一致与引用级校验不足**，没有把 pack 体积小直接认定为物理损坏。原审计的“空 pack”解释未在本次最小复现中独立确认；真正缺失 commit/tree/blob 的负向夹具另行覆盖，不能因此省略损坏检查。原审计报告保持原文。

两个主要故障点：

1. `prepare` 原先只比较 HEAD 字符串；`rev-parse` 可以返回缺失对象的引用。克隆完成后应验证实际对象，而非仅验证引用。
2. `collectEvidence` 的裸 `git diff --check` 没有沿用 longpaths/hook/fsmonitor 策略；异常退出与正常空白 issue 混为一类，stderr 未保留，导致错误进入返工分支。其他裸 Git 调用和“所有 HEAD 失败都当 unborn”的逻辑也存在同类诊断问题。

修复后所有 Controller 关键 Git 子进程统一经过 `git-process.ts`，启用 longpaths 并禁用 hooks/fsmonitor。Git 执行异常为 `git`，对象校验异常为 `git-integrity`；命令、cwd、退出码、完整 stdout/stderr 均保留。只为有明确语义的命令允许特定非零退出：check-ignore/no-index diff 的 1，以及 diff --check 的空白问题 2；exit 128 等异常直接抛出，不能成为正常空结果或普通 issue。

源仓库与克隆结果均读取实际 commit/tree、递归列举树并运行 `git fsck --full --no-dangling`，检查对象存在性、可读取性与哈希完整性。未出生仓库只有在 symbolic HEAD 指向不存在分支时才允许。Agent 调用前再次校验；准备失败仍保存失败 State 和哈希链审计，GUI 不启动子进程。执行阶段的 Git 故障不设置返工请求，返工/执行预算预检前也检查对象，防止误报返工超限。

没有新增“超过某字符数就失败”的 Git 路径阈值。路径长度仅进入诊断；是否可用由真实 Git 命令及对象检查决定。原通用进程层的 Windows cwd 限制保留，不能替代 Git 校验。失败的隔离目录和证据不删除，不自动重试或绕过完整性检查。

GUI 失败 Run、详情与聊天保留完整错误，聊天不再截断 error 文本，失败详情使用原文展示；超过 100,000 字符的诊断也有服务级回归。凭据显示仍按既有规则脱敏，原始审计完整保存。

最小复现证据：`repro-before/results.json`、`repro-after/results.json`、`missing-before-restored.json`、`missing-after.json`，均在上述 uaf001 目录。

## 3. 修改文件

- Git 执行与对象校验：`src/git-process.ts`（新增）、`src/workspace.ts`、`src/incremental.ts`、`src/delivery.ts`。
- 失败分类、持久化与停止流程：`src/failure.ts`、`src/controller.ts`、`schemas/state.schema.json`。
- GUI 失败信息：`desktop/src/service.ts`、`desktop/src/thread.ts`、`desktop/src/GroupWorkspace.tsx`。
- 回归：`test/git-integrity.test.ts`（新增 13 项）、`desktop/src/unified.test.ts`（新增 2 项）、`desktop/validate-unified-electron.mjs`（新增 1 项）、`desktop/validate-legacy-flow-electron.mjs`（修正固定等待的时序假设，保留 45 秒上限，增加返工计数不变断言）。

## 4. 完整验证结果

| 验证 | 结果 | 证据 |
|---|---|---|
| Controller 短路径，原 144 + 新增 13 | **157/157，fail 0，skip 0** | `controller-short-final.log`、同名 result.json |
| Controller 深路径，原 144 + 新增 13 | **157/157，fail 0，skip 0** | `controller-deep-final.log`、同名 result.json |
| GUI，原 36 + 新增 2，串行最终批次 | **38/38，fail 0，skip 0** | `gui-tests-serial-final.log` |
| Controller 构建与 schema 导出 | **通过** | `final-build.log` |
| GUI 构建与 TypeScript 检查 | **通过** | `gui-build-final.log`、`gui-check-final.log` |
| Electron 新流程，原 13 + 新增 1 | **14/14，errors=[]，真实调用 0** | `D:/PersonalAgent-validation/unified/electron-2131464f/results.json` |
| Electron 旧界面 | **13/13，errors=[]，真实调用 0** | `D:/PersonalAgent-validation/legacy-electron/6f0c4205-c554-443b-a9a1-42991f0ac5b0/results.json` |
| Electron 旧完整流程 | **17/17，errors=[]，真实调用 0** | `D:/PersonalAgent-validation/legacy-flow-electron/88e991ac/results.json` |
| 受保护项目/配置/文档 | **20,779 文件，changed=[]** | `protection-results.json`、`protected-start/end.json` |
| 原历史证据 | **44,185 文件，changed=[]** | `protection-results.json`、`history-start/end.json` |

最终执行命令（均通过 rtk proxy 执行，完整 cwd/argv/退出码记录在各 result.json）：

```text
# cwd D:/uaf1（dist 为指向当前产物的 Junction）
node --test --test-concurrency=8 D:/uaf1/dist/test/*.test.js
# cwd D:/PersonalAgent-worktrees/unified-review
node --test --test-concurrency=8 dist/test/*.test.js
npm run build
node desktop/validate-unified-electron.mjs
node desktop/validate-legacy-electron.mjs
node desktop/validate-legacy-flow-electron.mjs
# cwd 同目录的 desktop/
npm run build
npm run check
npm test
```

新增负向回归覆盖：短克隆、195/205/220 路径成功或安全拒绝、HEAD 存在而 commit/tree/blob 缺失、已有克隆对象丢失、diff --check exit 128、真实空白 exit 2、status/ignore/diff/fsck/clone 异常与 spawn 错误、禁止后续 Agent/返工计费、审计哈希链和 GUI 全文、unborn Git 与非 Git 普通目录。原 Direct/Dirty Git/隔离、交付、恢复、锁、预算和原生适配夹具继续通过。

以下中间失败如实保留，不计为最终通过：

- 冻结前短 cwd 首轮 140/144；4 项因测试目录没有 dist 入口失败。补齐 Junction 后 delivery 21/21、相关 budget 1/1，覆盖全部 4 项。没有改变被测产品以绕过这些失败。
- 首轮负向测试 11/13，缺失 commit/tree 被前置 status 抢先归为 git；对象检查已提前，相关 3/3 及最终 157/157 通过。
- 初轮 GUI 37/38，新增测试缺少必需 mockScenario；补齐夹具后通过。高负载重复批次 33/38，2 个旧等待超时及其依赖用例失败；保持等待上限，最终串行 38/38。
- 两套中间 Controller 批次各 156/157，旧断言要求 `Git failed` 前缀；已保留兼容前缀并重跑两套完整 157/157，没有放宽旧断言。
- Electron 新流程两次中间批次原 13 项通过，新增用例先后发现等待时序与选择器歧义；最终精确检查 GUI 原文与审计，14/14。
- 旧完整 Electron 在高负载与串行旧脚本下均停在第二次人工暂停。持久状态为正常 paused、loops=2、无 failure；固定 6 秒等待漏发第二次恢复。改为实际阶段/active=false 等待，45 秒上限未改变，最终整套 17/17。失败证据保留在 `legacy-flow-electron/9b42e205` 和 `legacy-flow-electron/ac5f15cf`。

Electron 确实运行 Windows BrowserWindow、renderer、IPC 与 Controller。新流程为确定性夹具选择/授权替换原生对话框，不能宣称本次新增了未替换原生对话框验收。全部 Agent 行为仅为 Mock 或本地免费适配夹具；未调用真实 CC/Codex 服务。

保护清单沿用原证据覆盖的代码、配置和文档范围；不代表全部二进制游戏资产均被哈希。历史校验只比较运行前存在的证据，允许本次新增独立随机目录。main 仍为 `f805e7c9155e0b47559b1d4180453461f14b8106`；A 为 `ed9a419dbd8170a37193e64fa30af983ecf05cfb`，B 为 `4ee62f2d2a32ce4c0303881894f32e9513b058bd`，A/B 工作区干净。主工作区原有未跟踪文件未清理。本次没有开始 FPSArena，没有修改其他游戏工程。

## 5. 双根历史进入 main 的建议

审阅分支根为 `1b5eb51441e3bc73a9ed672b347ce468d38a6e55`，main 根为 `f805e7c9155e0b47559b1d4180453461f14b8106`；无共同祖先，但两个根的 tree 都是 `8d70575b7d3429f10cbc5d290556e5bcc05e5465`。

建议采用 **main 基础上的内容整合提交**：在未来获得明确授权后，从最新 main 建独立整合分支/工作区；用审阅分支原根到已冻结最终成果的完整 binary diff 作为输入，在新的分支上三方应用并逐项审阅冲突。核对目标内容、模式契约、来源 A/B 差异与受保护文件，重跑本报告测试矩阵，再提交包含 A/B、统一 SHA、修复 SHA 的来源记录，由负责人审阅后决定是否合并。原审阅分支与 bundle 保留，使原 SHA 始终可追溯。若 main 有新增工作，必须保留其修改并人工审阅冲突。

不要直接使用 allow-unrelated-histories 把双根全部并入 main，也不要强制重写 main 或丢弃主工作区现有文件。内容整合会保留 main 的单根历史；原开发历史通过原分支、bundle 和 SHA 来源记录保存。本次仅给出方案，没有执行合并、rebase、cherry-pick 或 push。

## 6. 剩余风险与结论

1. 本机 Git 对更深目录仍存在原生限制；220 字符最小夹具被明确安全拒绝。195/205 成功不是通用跨机器路径保证，必须继续依赖对象检查。Git 故障标记为不可自动恢复；应修复环境或选择更短 runtime 新建 Run，原失败目录与证据保留。
2. 完整 fsck 增加准备及 Agent 边界的耗时。大仓库可能触发当前 30 秒 Git 上限；高并发下旧 GUI 等待也会超时。本次未提高超时、放松对象检查或伪造完成状态，最终正常负载完整验证通过。
3. UAF-002 本机 Claude 路径硬编码、UAF-003 对话框替换的验收口径、UAF-004 direct 预览 50 文件/2MB 限制保持原范围；它们未被本次定向修复掩盖。
4. 原生模型能力仅到代码接入与本地夹具层；真实模型端到端调用为 0。双根进入 main 的实施和跨机器适配仍需单独安排。

**UAF-001 修复及本次冻结验证：GO；统一成果进入 main 的总体判断：CONDITIONAL GO。** 未合并 main、未推送、未运行真实付费 Agent；后续行动等待新的明确授权。
