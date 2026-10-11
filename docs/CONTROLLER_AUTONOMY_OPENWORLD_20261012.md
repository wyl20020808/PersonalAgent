# Controller 自主推进及 OpenWorld 真实案例

2026-10-12。开发基线为本地 TEST `3753a50`，独立分支 `fix/decision-autonomy-20261011`。外部 Codex 负责软件修复，真实 CC/Codex/Controller 验证是单独的正式 Run；两者不混称。与“添加讨论模式入口”会话协调，保留其 TEST 提交 `586889e2f536b8c892e4a92e83bedc91685d1f68`。

## 用户要求对应的职责

用户负责确定目标、关键要求和重大取舍。方案谈妥以后，普通实施方法、任务顺序、小问题修复和分阶段验收交给决策者。90–95% 表达的是少打扰的期望，不设置一个机械百分比：是否升级由授权和实际影响决定。

决策者负责规划、审查实际成果、选择必要检查，并决定继续、返工、终止或提请重大决策。执行者负责操作工具、修改文件、导入模型和执行验证。Controller 负责把信息放入正确的调用、维护任务顺序、保存 Session/Run、恢复检查点、记录证据和执行授权边界。

Controller 是运行程序。它不需要另一个模型把每条消息“翻译”一次，但它的程序分支决定收到 pass 后是继续还是暂停。只改提示词、让 Claude 更积极，无法修复旧程序始终暂停的问题。

## 消息具体怎样传递

1. 用户输入先进入桌面的 Conversation/Session。进入开发时创建正式 Run，保存目标 goal、配置、授权、附件和关联会话。讨论中已确定的方案可作为 Run 的输入；中途追加要求通过正式 guidance 队列在安全边界交给决策者，保留已经完成的成果。
2. 规划调用由 Controller 组装结构化提示：goal、仓库位置、项目上下文、feedback、必要规则、任务阶段和新要求。通过配置的原生后端调用决策者；保存其 Session/Thread，后续可续接同一会话。
3. 决策者返回结构化 Plan。核心是 tasks 数组，每项有 id、instruction、acceptance，必要时有 dependsOn、moduleIds 和阶段。Controller 校验格式、依赖、权限并保存任务，不能把未经用户批准的 proposed 契约当成既定要求。
4. 执行调用包含总目标、当前 task 的具体指令及验收标准、仓库/上下文、反馈和已有证据。执行者在原生工作会话里操作，输出 summary、工具事件和文件结果；Controller 保存结果和退出状态。执行者结束一次调用后，才派发下一调用。
5. 审查调用包含 task、executorResult、实际文件变化与观察证据、项目契约以及 feedback。决策者可以用原生工具查看真实文件和相关 Worktree，运行必要检查，不必只相信执行者自述。
6. 决策者返回 Review：pass、rework、human 或 fail。新 Controller 对 pass 登记任务完成并继续；rework 把原因交给执行者；human 暂停并展示需要用户决定的问题；fail 记录终止。

因此并不是“Claude 私下给 Codex 发了一句聊天”。Controller 从 Claude 的结构化结果取出当前任务，组装 Codex 的正式输入；再将 Codex 的输出和观察记录交回 Claude。会话历史、结构化状态和审计共同保留传递过程。

## 原 OpenWorld Run 实际发生了什么

Run 为 `922a7176-8dea-4269-977a-ab785b4927d0`，目标是把 12 个 Blender 院落建筑导入 UE：分别建立源关卡，再以 Level Instance 放进 CityMain，同时处理室内、材质、位置和卸载验证。规划有 14 项，先准备环境和候选方案，再试点导入、验证，最后分批推进。

第一项 t01-setup 只是准备：读取工程规则，从 committed dev 创建独立游戏 Worktree，申请阶段一文本路径的 Writer 锁，保护 Primary 已有修改。Codex 实际只执行了一轮，建立了 `D:/OpenWorld-Worktrees/campus-import-12` 和对应任务分支，申请了一把 Writer 锁。

Claude 首次验收确认三条标准满足，返回 pass。旧 Controller 却只将 phase 改成 paused、nextPhase 改成 verify，没有推进 taskIndex，也没有登记 completedTaskIds。你看到“等待确认”后点击继续，桌面将继续传成 resume 决策；Controller 重新进入 verify，再审查同一个 t01。

读取原 Run 的当前记录可确认：仍是 taskIndex=0、completedTaskIds=[]、loops=1；共有八次 review，其中七次 pass、一次 human。claudeCalls=9，包含规划和八次审查。第五次送审确实是同一成果第五次审查，不是五个不同阶段，也不是建筑已经导入五次。

第六次 Claude 返回 human，是因为重复 pass 不推进，加上旧提示写着 Diff 被截断需交人工。它随后也指出：截断部分来自 Primary 任务前已有修改，t01 没有产生这些变化。这进一步说明“截断”不能自动变成用户审批门槛。新提示要求决策者自行读取完整相关内容，只在真正缺少关键证据时升级。

## 改成什么行为

例如准备环境通过后，Controller 自动完成 t01 并发出 t02；候选建筑和坐标满足已经讨论好的要求后，决策者自行选择并继续。发现尺度不对、材质缺失或碰撞问题，应安排修复、再验收，不逐项请用户点击继续。

需要用户的是实质性的选择，例如授权范围外覆盖重要关卡、无法同时满足的功能取舍、超出明确限制，或者用户明确保留的正式交付/发布批准。内部验收通过和向正式 DEV 升级是不同动作；后者影响正在运行的真实工程及所有相关会话，仍按治理第五节在安全节点处理。

这次修复同时区分三个状态：decisionAccepted 表示决策者验收通过，userAccepted 表示真实用户确认，passed 表示实际测试通过。不能为了自动推进而伪造用户确认或测试通过。未配置 Controller 固定测试也不妨碍决策者自行检查和判断。

历史 Run 不是手动改一个完成标志。正式恢复先检查审计链以及成果和规则是否变化：原 pass 仍适用就复用并推进，变化则重新审查；明确要求返工就执行返工。原审计保留，不重置调用计数，不重复创建游戏工作树或锁。

旧计划的 t03 本身写了阶段二需要用户确认；软件修复不会偷偷改写历史 Plan。正式恢复时还需把本轮最新“例行阶段自主推进”的授权通过 guidance 交给决策者，让它调整剩余任务，只有真正重大取舍继续留给用户。

## 验证与交付边界

真实验证 Run 为 `266c3679-02ae-4759-829f-65908ddbb1e9`：真实 Claude Code 规划和审查，真实 Codex 执行两个相继任务，Controller 自动调度。结果为 completed、两次执行、两次审查、两条 decision-acceptance、零暂停、零人工验收。不是 Blender/UE 的现场导入验证。

完整原始结果保存在 `D:/PersonalAgent-data/decision-autonomy-20261012/d1514e1f-0f15-4202-8bf9-7716f750b607/result.json`，关联原生 Session、Thread 和审计保留。回归另外覆盖多任务依赖、历史 pass 复用、成果改变、明确返工、human/fail、伪造标志及正式 Delivery 批准。

未运行本次修改后的可见桌面 GUI 验收，不能称为 GUI PASS。Serena 已激活目标 Worktree，但无活动语言服务，采用受限文本搜索和代码读取。

验证结果：

- 核心 Controller、验收、Delivery：61/61 通过，包含新增的历史第二任务恢复用例。
- 合并讨论模式改动后的模型后端、追加要求、Context、讨论流和自主验收：104/104 通过。
- 合并后的完整桌面回归：146/146 通过。
- 根构建、桌面类型检查和桌面构建成功。Vite 的既有 chunk 大小及 use client 警告保留，未冒充零警告。
- 隔离、不可见的真实 Electron Discuss 流程通过：发送先确认、输入清空、后续消息有序排队、公开草稿更新、工具收拢、Markdown 表格/公式/代码，以及两次讨论仅触发一次执行。证据目录 `.v3c3/discuss-stream-ui-e2f4db7e-9459-4528-a4bb-1fed1f02fe7f`。其模型回复为受控 Mock，不能称为真实模型讨论；真实模型执行链是前述另一个 Run。
- “添加讨论模式入口”会话对验收代码做了只读复审，指出旧 completedTaskIds 缺失导致回退风险；已修复并复验。对方未执行本任务回归，不把这次审查描述为独立 Controller 验收。

当前 OpenWorld DEV Run 原状态保留，修复代码与本地 TEST 集成不代表 DEV 已升级，也不代表 t02 已实际开始。正式升级和恢复需要对应授权、停止相关写入、备份运行数据并核查兼容性。

2026-10-12 后续交付更新：用户已批准合入 DEV。42f195b 经安全退出、业务/旧构建备份后交付；恢复时暴露的旧 pass 预投递 guidance 兼容问题由 850809f 修复，相关 31 项回归通过，旧错误保留并经正式 CLI 重分类核验。当前运行 DEV 为 850809f，原 Run 已复用 t01 验收并开始执行 t02-site-candidates，审查次数仍为八次，未重跑 t01。最新自主授权已由决策者应用并调整剩余计划。建筑导入后续工作仍在运行，不能称为整个工程完成。业务备份、升级核验与现场恢复证据位于 `D:/PersonalAgent-data/dev-delivery-20261012/f0f1360e-56e6-4bd7-b070-81b203ad3204/`。该交付记录仅整合到 TEST，保持运行 DEV 固定。
