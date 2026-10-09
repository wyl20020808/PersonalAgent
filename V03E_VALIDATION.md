# PersonalAgent V0.3E 验收报告

验收日期：2026-10-09。开发分支：`codex/v03e-session-chat`。本阶段全部使用正式 Controller 的 Mock、历史回放和明确标记的注入式证据，没有新增真实付费 Agent 调用。

## 基线与工作区保护

开发前核对正式 `main` 为 `b8b34cd`，当前工作区从 `codex/v03c4-native-live-validation`、HEAD `7b398b0` 开始，已有未提交修复。新分支继承这些修改；没有重置工作区、提交、合并或推送。改动前副本和原始状态保存在 [baseline](D:/PersonalAgent/desktop/validation-v03e/baseline)。`AGENTS.md`、`src/incremental.ts`、`test/v02b.test.ts` 与该副本做 SHA-256 比对，结果见 [证据汇总](D:/PersonalAgent/desktop/validation-v03e/evidence-summary.json)。

没有修改 FPSArena、CafeGame、FishEatFish、OpenWorld 等项目，没有运行这些项目的付费 Agent，也没有批准历史 Delivery。既有 Desktop 修复被保留，旧版回归脚本未改写。

## 1. 新会话与项目绑定模型

新增 `SessionStore`，用独立会话 UUID 保存项目规范路径、项目名称、会话标题、创建/更新时间、Mock/Real 与 direct/isolated 设置、累计预算、用户消息和多个 `{runId, profileId}` 引用。会话 ID 不复用 Controller Run ID。`sessions.json` 通过正式 `atomicJson` 原子替换写入。

主入口为左侧“新建会话”。用户直接在聊天页选择工作文件夹，顶部显示“工作路径”；长路径省略显示，悬停可查看完整路径。选目录只创建会话，不启动任务、不要求用户填写配置 JSON。首次发送才建立正式配置及 Run。聊天页“更换项目（新会话）”创建独立会话，不覆盖原项目绑定和两轮历史。测试使用 Windows 原生文件夹对话框接口，选择结果由测试夹具确定。

会话列表支持按标题、项目与最近消息搜索，自动用首条需求生成标题，也可手动重命名；以最近活动排序。直接/隔离模式在绑定目录前选择，后续聊天不能修改项目或授权范围。

## 2. 聊天输入如何正式启动与继续开发

输入框支持 Enter 发送、Shift+Enter 换行及输入法组合状态。`sendSession` 经严格 IPC schema 校验，再进入既有 `startProject` / `start`，使用原 Controller、Agent Adapter、预算账本、审计与恢复机制，没有第二套调度器。

首条消息生成第一轮 Run；完成后同一会话的新需求生成下一轮正式 Run，读取当前项目文件，并带入上一轮需求、已完成任务 ID 和验收摘要。上一轮仅作上下文，明确要求规划本轮新任务，避免反复嵌套历史目标。每轮采用新的原生 Agent Thread/Session，不假冒延续历史原生进程。

运行中、暂停或失败状态下的补充需求保存为待处理消息，可修改、取消；不直接注入正在执行的 Agent。正式 Run 完成后可点击“处理待办”。失败启动保留错误，明确处理后才重试；消息 ID 幂等，重复发送不会重复创建 Run。项目锁防止同一路径并发启动，死进程锁可恢复，仍存活进程的锁不会自动移除。

“好”“继续”“批准”等简短确认只记录，不作为真实调用、恢复或成果审批。暂停决策仍走原有独立决策入口。用户消息显示待处理、已执行、失败、取消或仅记录状态；“已执行”表示消息已关联正式 Run，具体任务结果以 Controller 卡片为准。

## 3. 多 Run 历史及恢复

会话保存多轮 Run 引用，聊天页按每轮正式审计记录增量加载；后续轮次显示开发轮次边界，不反复显示独立“新目标”入口。每轮事件具有稳定 ID、来源 profile/Run、任务、轮次和原始审计位置。

重启恢复最后会话、当前项目、消息、累计消耗，以及本机保存的分组展开和滚动状态。断开 IPC 后保留已加载消息，恢复连接后增量去重。历史截图按所属 Run 收集；视觉确认仅绑定当前 Run 与当前任务的可信截图，避免相同任务 ID 跨 Run 错配。

旧 Run 导入为独立的只读历史会话，不推断新的项目授权或自动继续开发；原有历史备注、正式恢复、截图、Delivery 预览仍可通过兼容界面操作。新会话可继续开发同一目录，但需要自己的明确授权。

## 4. 连续同类事件的准确合并规则

`threadGrouping.ts` 按原始时间线做确定性单次扫描。仅合并连续且角色、类别、Run、任务、轮次、作用域均相同的执行事件。命令、文件操作、执行进度、不同工具类别相互分开；中间出现其他原始审计事件，即使该事件没有聊天卡片，也构成合并边界。筛选发生在分组之后，不能因为隐藏其他角色而跨越合并。

Controller 状态、独立测试、Review、人工决策、错误与重要事件保留单条。并列时间保持原始写入顺序。组 ID 取首个事件稳定 ID，轮询、增量追加、角色筛选与重启不会随机重建分组。

简洁模式默认折叠，显示类别、数量、时间范围、保守状态和首条摘要；详细模式展开原始子事件，也可单独收起。存在 pending/running 记录时不把整组标为成功。子事件按原序呈现，超过 50 条可继续加载。

## 5. 原始事件完整性与长输出证据

分组只改变显示，不改写审计文件或合并后的原始条目。展开仍显示全部子事件的真实文本、来源、Run/任务/轮次。来源面板支持读取正式原始事件和完整输出；读取前验证审计完整性，超长活动输出从正式 sidecar 读取，并校验 `fullTextHash`。文件名严格限制在对应 Run 的正式活动文件，拒绝越界路径和哈希不符内容，公开展示仍应用密钥脱敏。

单元测试覆盖边界隔离、同时间事件排序、回放稳定、10,000 个长输出事件、sidecar 篡改拒绝、完整输出读取，以及投影缓存失效。GUI 夹具注入 3 条命令、1 条文件操作、5 条进度、超 132,000 字符输出、错误及 Review，验证命令展开顺序和完整输出可获取。

完整输出按 8,000 字符分页显示，避免一次渲染全部长文本造成卡顿。初始历史及组内事件也分页；未变化的线程投影按状态和审计/备注文件指纹缓存，文件更新或篡改使缓存失效并重新验证。

## 6. 字号、字重与对比度

按用户最新要求，把初版偏大的 16px 正文缩为 **14px**，正文/input 字重 **400**，行高 **1.65（23.1px）**，主要正文颜色 **#111827**。白色背景上的计算对比度约 **17.7:1**；辅助文字 **#526174** 对白色约 **6.3:1**，实际精确值见证据汇总。标题适度加重，代码保持等宽；错误采用独立红色提示，暂停/完成状态有文字和卡片区分。

完成了一轮真实截图修订：减小字号、增强浅色文字对比、压缩高缩放下的顶部与输入区，确保 1280×720 放大时仍有聊天区和可操作的发送按钮。保留用户/Claude Code/Codex 原有左右角色布局，项目详情默认收起。

## 7. 实际 Electron 前后对比与项目入口

以下截图来自 Windows Electron 原生 `BrowserWindow` 的 `webContents.capturePage`，不是静态网页设计稿。前后截图使用同一组正式 Mock Run 审计历史；“改动前”渲染器由改动前保存的 App/GroupWorkspace 与 HEAD CSS 重建，不以空白页冒充对比。

改动前：连续命令独立占据聊天区域。

![改动前，同一历史](D:/PersonalAgent/desktop/validation-v03e/before-same-history-1440.png)

改动后：3 条命令折叠为一组，当前工作路径、会话入口和累计预算可见。

![改动后，同一历史](D:/PersonalAgent/desktop/validation-v03e/after-same-history-1440.png)

聊天页绑定项目后的空会话：

![项目工作路径](D:/PersonalAgent/desktop/validation-v03e/electron-ed4f2a89/02-idle-session.png)

展开原始命令：

![展开命令](D:/PersonalAgent/desktop/validation-v03e/electron-ed4f2a89/05-expanded-commands.png)

1280×720、Electron 150% 缩放：

![高缩放输入区](D:/PersonalAgent/desktop/validation-v03e/electron-ed4f2a89/07-1280x720-150pct.png)

实测 1440×900 与 1280×720，各自 Electron 缩放 100%/125%/150%，无横向溢出，输入框和发送按钮完整可见。当前系统显示 DPR 为 1.5；本阶段没有改 Windows 系统缩放设置，因此这里的 125%/150% 指额外的 Electron `setZoomFactor`，不声称分别测试过 Windows 系统 125% 与 150% 设置。大图像素尺寸受系统 DPR 影响。

## 8. 自动测试与实窗结果

最终源码通过 Desktop `npm run check`、`npm run build`。构建仅有 lucide-react 包内 `use client` 指令提示，无构建失败。

| 验证 | 通过 | 失败 | 证据 |
| --- | ---: | ---: | --- |
| 原有 Controller 全量测试 | 159 | 0 | [controller-tests.log](D:/PersonalAgent/desktop/validation-v03e/controller-tests.log) |
| Desktop 全量测试（含新增会话/分组/完整性用例） | 70 | 0 | [desktop-tests-final.log](D:/PersonalAgent/desktop/validation-v03e/desktop-tests-final.log) |
| V0.3E 实际 Electron 会话与视觉验收 | 9 | 0 | [latest-electron.json](D:/PersonalAgent/desktop/validation-v03e/latest-electron.json) |
| 原有 unified Electron 回归 | 14 | 0 | [回归结果](D:/PersonalAgent/desktop/validation-v03e/regression-results.json) |
| 原有 legacy-flow Electron 回归 | 17 | 0 | 同上 |
| 原有 legacy Electron 回归 | 13 | 0 | 同上 |

GUI 合计 53 个检查，全部通过，Renderer 错误为 0，新增真实 Agent 调用为 0。这些数字来自实际结果，不提前假设测试数量。Root Controller 测试后未改 Controller 源码；Desktop 与 Electron 在最终构建后执行。

旧版脚本要求空历史，当前工作区包含既有游戏历史，直接运行会违反夹具前提。因此复制**最终完整构建、依赖和原始未修改脚本**到独立便携目录运行旧版回归，不复制真实项目配置；不是删掉历史、修改断言或换用静态 Mock UI。新会话实窗用例仍直接启动当前项目构建。初次发现的旧入口兼容问题已在正式 UI 恢复并重新全量通过。

原生对话框测试仅注入确定性的目录选择及接受/取消响应；任务实际经正式 Controller 执行。运行中队列测试暂时挂起 Mock 启动，完成检查后恢复正式 launcher。命令、长输出、截图和暂停证据明确为测试夹具，不宣称是付费真实 Agent 产物。

## 9. 旧 Run、预算、授权与安全检查

累计 CC 使用量和 Codex 执行轮次从各 Run 的正式状态相加，第二轮只获得剩余额度；CC 使用正式共享账本。耗尽时拒绝启动，不重置消耗。首次真实启动和后续真实轮次都要求明确付费确认。direct 模式保留原有目录授权确认，isolated 模式保留正式成果审批与应用语义；前轮隔离 Delivery 尚未正式应用时禁止下一轮悄悄基于未交付成果运行。

追加预算使用项目详情里的独立具体额度、决定说明及原生确认，不从聊天内容推断。新增授权账本保留历史账本、旧 Run 配置与消耗证据。测试覆盖首次授权失败后的预算调整、额度耗尽、显式追加、重复请求、并发拒绝、未授权真实请求，以及普通“继续”不审批。

旧版三组实窗回归继续验证：普通/Git/含未提交修改目录、direct/isolated、成果预览、明确摘要审批与单独应用、人工暂停恢复、返工、停止保留 Run、可信截图与视觉确认、IPC 断连恢复，以及保护文件不变。截图归属按 Run 和任务隔离，公开日志和消息继续脱敏。

## 10. 尚未实现行为及残留风险

1. 运行中补充需求不会在 Agent 执行中自动注入；本版在正式 Run 完成后通过“处理待办”启动下一轮。暂停、失败、停止仍先处理原有正式决策。
2. 多轮会话通过新 Run 与文件/验收摘要继续，没有复用旧 Claude/Codex 原生进程状态。本阶段验证的是正式 Mock 调度和授权拒绝路径，没有新增付费真实调用实测。
3. 会话文件和预算配置分别原子写入，没有跨文件事务。追加预算写入中断时可能留下未被引用的账本或配置不一致，后续身份/预算验证会拒绝继续，需要人工恢复；不会自动扩大额度。
4. 无法解析且无法确认进程所有者的锁文件保守保留，需要人工核查，不自动删掉可能存活的锁。会话用户消息上限 1,000 条。
5. 分页与缓存降低大量事件渲染成本，但没有无限历史虚拟列表；10,000 事件测试主要验证分组和回放算法，实窗以代表性长输出验证。不能据此承诺任意规模历史的性能。
6. 旧历史会话不自动取得新开发授权；需新建并绑定项目。没有自动批准、应用或迁移历史 Delivery。

可复现入口：[会话实窗脚本](D:/PersonalAgent/desktop/validate-v03e-electron.mjs)、[原有回归运行器](D:/PersonalAgent/desktop/validate-v03e-regressions.mjs)、[同历史前后截图脚本](D:/PersonalAgent/desktop/capture-v03e-comparison.mjs)、[证据汇总脚本](D:/PersonalAgent/desktop/summarize-v03e-evidence.mjs)。
