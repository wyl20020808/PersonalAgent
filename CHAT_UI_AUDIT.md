# 聊天区审计与修复记录

日期：2026-10-11。任务：检查本对话前序聊天区改动，修正 UI、消息身份、工具状态与展示逻辑。

## 版本与范围

- 当前开发会话起点为 MAIN 工作目录；当前实际运行的软件版本未通过桌面检查确认。
- Git 开发基线：DEV `32ec301e59868db120904c873ca123f6fc9b7743`。
- 修复分支：`fix/chat-ui-audit-20261011`。
- 独立工作区：`D:/PersonalAgent-worktrees/tasks/chat-ui-audit-20261011`。
- 不修改 MAIN/DEV 源码、构建产物、真实 Run/Session；不操作用户桌面；没有提交、合并、推送或发布。
- 使用已有依赖目录 Junction；输出、测试临时数据及 headless 浏览器配置在独立环境生成。未调用真实付费 Agent。

## 确认的问题与处理

1. 前序工作使用了旧 MAIN 基线，而 DEV 已有官方头像、多决策者和 OpenCode 执行角色。旧工作区还混有其他未提交成果，本次未整体迁移或回滚。
2. DEV 原样式按品牌统一将 Agent 放到右侧。现在按消息角色分边：决策者左、执行者右、用户居中；同一 Codex/OpenCode 同时担任不同角色也能区分。Codex 执行事件补齐执行角色元数据。
3. 分组增加角色边界；用户消息不并入工具组。分组预览优先展示命令或文件路径，不直接展示原始工具 JSON。
4. 命令、文件操作、输出和步骤记录有独立呈现。成功输出默认折叠，失败输出展开；原始记录、原始审计和完整证据入口保留。未知或截断协议不猜测内容。
5. OpenCode 公开执行摘要从已知封装中提取；只展示已有公开文本，不生成或索取隐藏思维链。
6. 工具状态改为读取结构化字段和已知协议状态行。命令输出中的 `failed`、示例退出码不会改变真实状态；OpenCode bash 非零 `metadata.exit` 明确标为失败。
7. Controller 卡片补齐内边距、正文及验收命令对比度，区分验收结果和 Diff。补充窄屏换行和键盘焦点样式。
8. Claude Code、Codex、OpenCode 直接复用 DEV 原有官方图标及许可文件，没有替换为字母头像或将 OpenAI 当作 OpenCode。

## 验证

全部命令经 `rtk proxy` 执行。

| 命令 | 实际结果 |
| --- | --- |
| `npm run build` | Controller TypeScript 构建成功；生成 schema 的换行变动已还原，不属于本次改动 |
| `npm --prefix desktop run check` | 成功 |
| `npm --prefix desktop run build` | 成功；保留 lucide-react 的既有 `use client` 打包提示 |
| `node --test desktop/out/thread.test.js desktop/out/unified.test.js` | 28/28 通过 |
| `node desktop/test/validate-chat-audit.mjs` | 5 个解析/角色测试、8 项 headless UI 检查通过 |
| `git diff --check` | 通过 |

28 项回归含正式本地 Mock Controller 流程、历史投影、同品牌不同角色、审计完整性、人工视觉验收边界和返工恢复。它们是开发自测，不是本修复成果的 Controller 独立验收或 CC 审查。

headless UI 使用生产中的 `Message`、`EventGroup` 组件及相同 CSS 加载顺序。验证 1280px / 480px 宽度、用户居中、角色左右位置、三种官方头像加载、Controller 内边距、失败输出、分组展开、窄屏无横向溢出、无页面异常。数据明确为 fixture；不是实际 Electron 截图、真实 Agent 运行或整个应用 GUI 验收。

## 截图及复现

- [整体聊天区](desktop/validation-chat-audit/desktop.png)
- [Controller 验收卡片](desktop/validation-chat-audit/controller.png)
- [480px 窄屏](desktop/validation-chat-audit/narrow.png)
- [UI 检查结果](desktop/validation-chat-audit/result.json)
- [解析测试输出](desktop/validation-chat-audit/unit-tests.txt)

复现命令见上表。脚本默认使用本机已有 Playwright 与 Edge 路径；可通过 `PLAYWRIGHT_MODULE` 和 `CHROME_PATH` 指定其他安装。浏览器从启动即 headless，使用独立临时配置，不连接用户浏览器。

## 剩余事项

- 尚未正式集成，因此当前 MAIN/DEV 应用不会自动变化。需按仓库规则进行独立验收、审查及正式交付审批。
- `chat-first-ui`、`chat-workbench-p0-p1` 在相同 DEV 基线上有重叠 UI 修改；本分支未修改它们。整合时应先确定最终组合，再跑组合验证。
- MAIN 原有混合修改的归属清理另列问题记录，不能用一次重置丢弃其他任务成果。
- 未跑完整仓库回归、真实远端 Agent、可见 Electron 或用户人工视觉验收，不声称这些通过。
- 未识别或截断的工具记录仍需展开原文；旧历史中没有角色元数据的 Codex 按既有执行者约定回退，不能从消息正文猜测身份。
