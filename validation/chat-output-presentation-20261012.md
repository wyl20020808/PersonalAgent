# 执行输出整理与长文本滚动

执行方：外部 Codex。基线：TEST `349497516b4030082a45e39e453af5e073324972`。
任务分支：`fix/chat-output-presentation-20261012`。
工作区：`D:/PersonalAgent-worktrees/tasks/chat-output-presentation-20261012`。

原因：公开正文只解析 OpenCode 的一层字符串 receipt；嵌套 JSON 或对象结果没有整理。长正文原来只显示首行截断预览，展开后正文无统一高度限制，讨论消息还绕过了折叠逻辑。

变更：

- 对已知 OpenCode、Codex、Claude 协议的执行结果解开受限层数的执行外壳，整理操作、结果、验证等字段；native 结果展示 summary。未知字段保留，非协议 JSON 不改写。
- 已识别但未完整的执行外壳展示接收中或解析不完整提示，不猜测结果。原始记录折叠保留；复制与分组预览采用整理后的公开正文。
- 普通正文、讨论、用户长文本采用局部滚动，高度不超过 360px 或视口的 50%。短正文自然高度。
- 命令、工具输出、错误、待办、原始证据、任务详情、侧栏正文和代码块补齐滚动高度限制。

验证：根项目构建、桌面类型检查与桌面构建通过；`chat-presentation.test.ts` 的 7 项测试通过；`node desktop/test/validate-output-presentation.mjs` 通过，使用真实消息组件和隔离无头浏览器，在 1280px 与 480px 宽度验证结构化正文、原始记录、正文/讨论/用户/工具/侧栏滚动、短文本高度、残缺协议提示，以及无页面错误与横向溢出。截图人工查看，滚动条可见。

首次本地测试打包从根目录导入 esbuild 失败，改为从 desktop 执行后通过；首次 UI fixture 使用 React 的文件路径导入失败，改为 desktop Vite 根目录和标准包导入后通过。这些是本任务验证入口调整，不改变产品依赖。

这是隔离场景自测，未调用真实 Agent，也未验收当前 Electron 运行窗口。未重启或替换运行实例。合入 TEST 时持有共享集成锁，合并后重新运行消息展示与滚动检查；提交和检查结果记录在 Git common directory 的任务集成 JSON。DEV、MAIN 不变，不推送远程。
