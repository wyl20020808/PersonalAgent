# Mac MAIN 自我迭代交付与验收（2026-10-15）

## 授权、范围与来源

用户明确要求将 DEV 合入 MAIN、运行 MAIN 软件用于后续自我迭代，并推送 MAIN。检查发现 DEV 的 Mac 适配仍不完整；用户随后明确选择“先修复并验收，再更新 MAIN”，没有豁免稳定验收。

本轮由外部 Codex 开发和验收。开发基线为 TEST `56efae75ac4b00f176f7ee41c1b04843c989937d`，独立分支 `fix/main-readiness-20261015`。合并既有 Mac 试用分支 `feature/mac-dev-trial-20261015` 的 `51284bcc5126d76ee9ddd6aba172a4b9101177bf`，保留 TEST、DEV 和 Mac 试用分支已有成果。原 DEV 为 `cd178cb99250192b06996c2c39d33c31fda834bc`；原 MAIN 为 `b570972639237a017293d660df316e39572055c7`。

新功能和修复先在独立任务 Worktree 完成，条件满足后整合 TEST，再交付 DEV、MAIN。MAIN 运行软件与目标仓库开发基线是不同概念：MAIN 发起自我迭代时，Controller 从目标仓库 TEST 创建独立 Run Worktree，验收后先整合 TEST；不能在正在运行的 MAIN 目录直接改源码或将未验收功能直接送入 DEV。

## 修复与回归校正

- 纳入完整 Mac 运行路径、Finder 工具发现、原生 npm/Claude 调用、绝对路径文件预览、子进程清理及应用打包支持。认证继续使用本机用户配置，不复制凭据。
- 纳入窗口销毁后保存 WebContents emitter 的退出修复，防止 closed/will-quit 清理再次访问已销毁 BrowserWindow。
- 保留最新 TEST 的目标项目 test 分支检查、独立 Worktree 及正常合并能力。
- 将旧测试中“决策者 pass 后仍强制等待用户逐项确认”的预期校正为现行自主验收语义，并断言 `decisionAccepted=true`、`userAccepted` 未伪造、未执行的 Controller 测试仍为 `passed=false`。human/fail、明确返工、正式交付未批准时拒绝 Apply 的测试继续保留。
- 修正 Mac 测试路径：Git 完整性夹具使用短且位于仓库外的系统临时目录，解析真实路径避免 `/var` 与 `/private/var` 别名；测试退出自行清理。锁夹具改为实际共享 runtime 的锁目录；桌面短路径夹具使用本机绝对路径；OpenCode 兼容性夹具解析真实路径并自行清理。
- 超时保留写入测试在实际写入后触发取消，避免把“超时发生在写入前”误判为文件丢失。
- 性能回归分别检查当前完整提示词确实减少，以及证据载荷小于原证据的四分之一，避免将新增必需指导文本混入 Diff 压缩比例。仍检查测试结果、问题和未截断标识完整传递。
- 没有关闭测试门禁、删除失败用例、伪造独立验收或修改历史审计。

## 本轮验证

- 根目录构建、desktop 类型检查和构建通过；保留既有依赖 use-client 与 bundle-size 警告。
- desktop 完整回归：182 项，通过 182 项，失败 0，退出码 0。
- Controller 最终完整回归：598 项，596 通过、0 失败、2 跳过，退出码 0。两项均为既有 Windows 专项，没有新增跳过。
- Git 完整性专项：13/13，通过，含深路径、缺失对象、无提交仓库及普通目录。
- 真实 Electron MAIN 身份检查：窗口可见，标题、侧栏和正式 IPC 返回 `PersonalAgent MAIN` / `instanceId=main`；业务数据位于独立 MAIN 测试目录。连续两次正常 `app.quit()` 退出码 0，退出耗时 80 ms 和 520 ms；重开同目录成功。截图已实际目视检查。
- 自动化 `ElectronApplication.close()` 的等待受调试器连接影响，不能据此判定产品退出失败。修复后的正常退出结果单独记录；未将自动化失败隐藏为成功。
- 初始未修改 DEV 的 Controller 全量尝试在 180 秒截止，不能视为完整通过；桌面为 174/180。合入 Mac 分支的首次完整 Controller 为 572 通过、24 失败、2 跳过；修正后曾有 6 项 Git 临时路径别名失败，定位并复验后最终完整回归通过。失败的原始诊断摘录保留在外部验收证据目录 `baseline-failures.txt`。

## 真实 Codex 自我迭代链路

正式 Run：`3440cca1-c888-4e2d-b676-9c7d4e95c15e`。通过实际 Controller、RealAgents、Codex 决策者和 Codex 执行者完成，不由本开发会话代写执行成果。目标为独立验收项目，原仓库 main/test 同在 `8965e6eb59188d21608a844235de985841525fce`。

Controller 从 TEST 创建 `personalagent/3440cca1` Worktree。真实执行者仅新增 `marker.txt`，内容为 `ready` 加换行；真实决策者运行验证后 pass。Controller 正常提交并合并 TEST，结果为 `f99cb92d89a7b5db43759ba8bb7355d078da61c1`，源 MAIN 保持原提交，没有远程推送。开发会话另在合并后 TEST 的临时候选中运行 `npm test`，得到 1/1 通过，随后移除候选 Worktree。

Run 完成时 `decisionAccepted=true`、`passed=false`，没有 `userAccepted`。后两者表示未将决策者的实际 npm 测试伪写为 Controller 独立测试或用户批准。正式 Run 有 3 次实际模型调用，观测到输入 364,374、缓存读取 285,696、输出 2,389 tokens；缓存是输入的子集，不重复相加。

第一轮验证调用遗漏 `createRun` 的 `projectBranch:true` 选项，走了兼容入口，真实执行者发现 MAIN 工作区后拒绝写入并暂停，Run `a53d5384-ec59-47af-bbaf-94710cdacc0a`。该尝试保留原记录，没有伪装为通过，也没有改写 Session 来隐藏失败；第二轮改用正式项目分支入口。此为本轮验证调用错误，现已纠正。

真实 Run、Session 和审计保留在工作根目录 `main-readiness-evidence-20261015/`，包括两个尝试与实际执行成果，不作为可再生缓存删除。第一轮执行者的核查凭证保留在本机共享 evidence 目录对应 `add-ready-marker-a53d5384` 子目录。

## MAIN 应用与后续使用

目标安装位置：`/Applications/PersonalAgent MAIN.app`。使用最终 MAIN 的同一源码构建产物、原生 Electron、Node/npm 和本机工具依赖，包中记录准确源码提交，实例默认为 MAIN，业务数据位于 `~/Library/Application Support/PersonalAgent/instances/main`。不覆盖既有 `PersonalAgent DEV Trial.app` 或 TEST 历史。

MAIN 启动后仅创建待用户输入的自我迭代会话，绑定本仓库，使用本轮已验证的 Codex 决策者与执行者；不自动派发新开发任务。新需求仍先进入 TEST，成熟批次再交付 DEV，运行中的 MAIN 保持固定版本。

本轮验证范围为当前 Mac、Codex 单决策者与执行者、TEST Worktree 开发和本地合并、MAIN 启停与所列回归。Claude 认证、OpenCode 已登记的模型循环问题、真实多决策者、Windows 实机和长期稳定性没有在本轮全部重验；不把既有问题记录标为已解决。应用使用本机 ad-hoc 签名，未声明 Apple Developer ID 签名或公证。

## 清理报告

- 已删除未修改 DEV 候选 Worktree 的依赖链接、构建、测试夹具及缓存；逻辑大小 12,180,935,339 字节，包含稀疏文件，不等同实际物理释放空间。已移除该候选 Worktree，保留其分支。
- 已删除最终任务 Worktree 中的依赖链接、构建、测试夹具和缓存，逻辑大小 36,429,519,015 字节，含稀疏文件。重复截图、过程日志和临时 GUI 数据也已删除；临时目录当前仅保留待安装的 MAIN 应用，交付后回收目录与任务 Worktree。
- 正式保留：本报告、最终完整回归日志、GUI 结论和最终截图、失败诊断摘录、真实 Run/Session/审计及成果，以及用户要求运行的 MAIN 应用和独立业务数据。外部最终证据目录为工作根目录 `main-readiness-evidence-20261015/`。没有归属不明或未能清理项。
- 既有 Mac 试用分支、Worktree、应用和 TEST 数据不是本任务产物，不清理。
- MAIN 应用及其正式服务按用户要求保留运行；验证脚本与临时实例应全部结束。锁仅释放本任务持有者，不清理历史锁。
