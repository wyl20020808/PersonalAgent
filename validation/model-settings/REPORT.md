# 模型目录、推理强度与多决策者验证

日期：2026-10-11。外部 Codex 开发会话，自测结果不等同 Controller 独立验收。

## 范围和治理

任务分支 `fix/model-catalog-reasoning-20261011`，起始 TEST 提交 `9d069b1615440db16a2cb9ce00234d8b163769e5`。本任务已读取并显式采用主工作区治理 V2.1 全文及其本地 TEST 条件式自主提交、合并授权。整合前发现 TEST 前进到 `b90e81b0a5ea5cad8ccb4cc1539636a69fdba251`，需先保留双方历史整合并复验。没有更新 DEV/MAIN、推送、迁移数据或替换运行实例。

## 改动

- 启动及项目切换时预加载模型；按项目和角色缓存 OpenCode 目录。打开弹窗复用目录，显式刷新才重新获取，刷新失败保留已有列表并显示错误。
- 修复 Electron 中 Codex 模型发现的 Node 启动方式，读取实际模型目录及支持的推理强度。
- Claude Code、Codex、OpenCode 的决策者和执行者均可配置推理强度；分别传入 CLI `--effort`、SDK `modelReasoningEffort`、OpenCode 模型 `variant`，支持持久化和恢复。能力未知或不支持时不编造可用强度。
- 决策池直接点击多选，所有已选卡片绿色。保留至少一位，支持最多三位独立决策者及各自模型、推理设置，移除单/双决策模式下拉框。三位讨论时每位收到其他两位的完整初稿，主决策者汇总后才进入执行。

## 证据

- 根目录 TypeScript 构建、桌面类型检查及构建通过。
- Controller/适配器相关自测 60/60 通过，见 `controller-tests.log`；桌面注册测试 118/118 通过，见 `desktop-tests.log`。
- 隔离隐藏 Electron 界面 10 项通过，见 `ui/result.json`。界面数据使用夹具；另在真实 Electron 进程只读查询本机 Codex CLI，发现 7 个模型及推理元数据，见 `ui/native-electron-catalog.json`。未发起真实模型推理。
- 本机默认 OpenCode 实际只读探测未通过：服务缺少官方 JSON Schema `format` 协议，现有兼容检查拒绝继续，见 `opencode-catalog.json`。缓存及 variant 请求传递使用本地 SDK HTTP 测试验证；不将其称为真实远端 OpenCode 验收，不绕过协议检查。
- 截图：`ui/decision-multiselect.png`、`ui/model-settings.png`、`ui/model-settings-narrow.png`。
- 与最新 TEST `b90e81b` 的组合复验：保留引导消息修复及全部模型设置；根目录构建、桌面类型检查和构建通过，Controller/适配器/引导消息回归 83/83、桌面回归 118/118、隐藏 Electron 10 项全部通过。见 `combined-controller-tests.log`、`combined-desktop-tests.log`。冲突仅涉及汇总提示语，解决时保留所有参与者初稿及最新引导消息字段和指令。

参考：[Codex App Server](https://learn.chatgpt.com/docs/app-server)、[OpenCode 模型与 variants](https://opencode.ai/docs/models/)。本机已安装 SDK 类型和 CLI 帮助优先用于参数兼容核对。

最终整合提交和复验记录另存于主工作区 `.validation/model-settings-integration/`。
