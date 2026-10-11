# 聊天文件与变更预览验证

## 后续提交与整合授权（2026-10-11）

用户在查看本功能成果及验证报告后明确批准：“你现在可以继续提交了，那边已经提交完了。”续接核对发现主目录治理已升级为 V2，要求新功能先交付 TEST，但 TEST 尚未建立。已向用户说明变更；用户明确选择“本次直接整合 DEV”，授权此次旧任务按例外流程提交并直接整合 DEV。MAIN、远程推送和 TEST 建设不在授权范围内。

本次外部 Codex 会话依据用户直接批准执行 Git 交付，不制造 Controller Delivery 或 Controller 独立验收记录。最新 DEV 为 `4eb8977`，包含暂停、角色切换和侧栏旋转提示；组合验证及运行更新另行记录。以下“未提交”等内容为首次交付审批前的历史快照。

## 范围与开发基线

- 用户目标：聊天里的文件可点击，在右侧新建标签页查看文件或 Git diff 风格的变更。
- 发起软件版本：截图未提供可核实版本号，未推断。
- Git 基线：`dev d2fe3e6`。
- 结束前核对的最新 DEV：`c2caff4`（其他任务增加侧栏旋转指示器）；该提交与本功能修改文件没有重叠。本次验证基线仍为 `d2fe3e6`，未将其他任务成果带入本任务或修改 DEV。
- 任务分支：`feature/chat-file-diff-20261011`。
- 任务工作区：`D:\PersonalAgent-worktrees\tasks\chat-file-diff-20261011`。
- 全局交互策略读取结果：`idle`；开发和验证均通过 CLI，浏览器验证使用隔离 headless Chrome，没有操作用户窗口、焦点或剪贴板。
- Serena 已激活该任务项目，但没有活动语言服务器，采用定点搜索和分段源码读取。
- 本次开发在该独立 Worktree 中完成；另调用真实 Claude Code CLI 进行只读审查和同会话复审。没有正式 Controller 开发 Run 或 Controller 独立验收。测试内的 Mock Run 用于验证正式 DesktopService 接口，不是付费 Agent 开发证据。

## 实现

1. 文件卡片显示文件名、路径及可用的增删行数，点击自动展开右侧栏并打开标签页；同一事件同一文件去重，支持关闭和切换标签。
2. 文件页展示当前工作区内容，变更页展示修改证据。支持行号、语法高亮、绿色新增、红色删除、横向滚动、分页、刷新及加宽。
3. “查看本次变更”打开汇总标签页，显示文件数量和增删总数，可逐个展开文件及查看当前文件。
4. 新增 `readChatFile` IPC 接口，必须绑定有效 profile、Run、审计事件以及该事件列出的文件。不接受调用方指定任意项目根目录；文件读取复用现有边界、链接拒绝、大小限制和脱敏逻辑。
5. 优先使用同次 Agent 调用的审计差异，显示证据范围。缺少历史差异时通过 Git 获取当前 HEAD 差异；未跟踪文件用空文件基线计算新增行，尚无提交的仓库明确显示空文件基线。
6. 高亮复用 highlight.js，锁文件包含实际依赖版本。来源及用法：[highlight.js 官方项目](https://github.com/highlightjs/highlight.js)。源代码作为文本高亮，不执行文件内容。

## 验证命令

在任务根目录运行：

```powershell
rtk npm run build
```

在任务 `desktop` 目录运行：

```powershell
rtk npm run check
rtk npm run build
rtk npm test
rtk proxy node validation-file-preview/check.mjs
rtk proxy node validation-sidebar/check.mjs
```

根目录构建和桌面类型检查、生产构建通过。构建有 lucide-react 指令和超过 500 kB 的主包警告，退出码为 0；高亮依赖增加了渲染包体积。

最终桌面组合串行回归通过 **108/108**，失败、跳过、取消均为 0，总耗时 113,143.1764 ms。新增文件预览测试为 6/6。这是桌面已配置测试集合通过，不是全库 Controller 回归通过。最终复审后仅移除了已经不再使用的后缀比较 helper；类型检查和新增测试重新通过。

新增单测验证 unified diff 增删统计及行号、带空格/中文路径、删除/新增文件、多文件快照、旧 NEW FILE 的段尾及段间空行、轮次与调用关联、接口事件绑定、项目边界和链接拒绝、历史不变、父 Git 仓库子目录、同名文件精确匹配，以及实际 Git fallback、二进制和截断内容不伪造统计。

隔离 headless 界面验证使用真实 DesktopService、Mock 会话和本地测试仓库：聊天卡片打开侧栏、标签去重、文件/变更切换、语法高亮、准确的 +2/−1、未跟踪文件、源代码 HTML 转义、变更汇总、1000/700 像素页面无横向溢出及只读操作均通过。既有侧栏 headless 回归通过。

证据：`desktop/validation-file-preview/result.json`、`diff-sidebar.png`、`diff.png`、`content.png`、`changes.png`、`1000.png`、`700.png`。这些截图为隔离测试界面，不代表真实 Agent 执行或用户可见 Electron 验收。

界面脚本依赖本机 `C:/Users/WYL20/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs` 和 `C:/Program Files/Google/Chrome/Application/chrome.exe`。换机器需调整这些路径；运行使用独立 browser context、临时测试数据和 headless 模式。

## 独立审查

真实 Claude Code CLI Session：`c19ab2c6-c095-408f-90c2-64c366474ad6`。首次审查为有条件 pass，提出 2 项中等及 5 项低级发现；已修正 Git 子目录路径、重复解析、同名文件误匹配、旧格式空行统计、截断/非文本说明及界面行号断言。两次同会话复审均为 **pass**，最后一次未发现新的影响正确性问题。

原始审查结果经脱敏保存在 `desktop/validation-file-preview/claude-review.json`、`claude-review-followup.json`、`claude-review-final.json`。审查使用 plan 权限模式，仅静态阅读和只读 Git/搜索，不修改源码、不运行测试。审查者明确未独立运行测试；这仍不是 Controller 独立验收。

源码和验证脚本的逐文件 SHA-256 清单保存在 `desktop/validation-file-preview/source-manifest.json`，组合摘要为 `fdba4a19e1395d695189676bdc80e4771bf8fe30fa65bdf507cd7f8449f7c9bd`。该清单仅绑定当前内容，不是 Controller 正式交付许可。

## 边界及待完成事项

- 非 Git 项目且未保存历史 baseline 时，无法还原旧文件内容；界面明确说明，不把当前内容冒充历史 diff。
- 现有 snapshot-free Controller 的 Git 观测可能包含任务前已有修改；没有修改原有快照政策或历史审计。
- 图片、二进制和大文件继续受现有预览限制；没有实现二进制差异查看器。
- 右侧“项目”文件浏览器的原有内容预览保持原实现；本次针对聊天文件事件及变更证据入口。
- 高亮按行处理，跨行注释和模板字符串的颜色可能不完整；内容与行号不受影响。
- 旧式 NEW FILE 正文若恰好包含分隔头文本，其原始格式存在歧义；本次未改写历史证据或扩大全量快照采集。
- 多 Run 会话中旧 isolated Run 的绝对路径若不属于当前界面可确认的 roots，卡片隐藏行数；右侧服务端仍按该旧 Run 精确解析文件和差异。
- 工作区位于上级 Git 仓库中时，以该仓库 HEAD 为基线；这不是历史调用的快照。卡片悬停和预览页显示证据范围。
- 切换预览标签会重新读取，文件/变更模式、分页及加宽状态会重置。
- 未进行全库 Controller 回归、正式 Controller 独立验收、用户可见 Electron 验收。
- 未提交、合并、推送或集成到运行中的 DEV；正式交付与实际试用仍需项目规定的审批流程。
- 正式集成时必须重新核对当时最新 DEV，并验证组合结果；不能把本任务隔离验证当作已集成版本验收。
- 问题记录：`problems/2026-10-11-chat-file-preview.md`。
