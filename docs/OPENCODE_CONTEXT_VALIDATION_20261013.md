# OpenCode 上下文窗口回退验证

日期：2026-10-13。执行方：外部 Codex 开发会话；没有创建 PersonalAgent 真实开发 Run。

基线：本地 TEST `a2d3f95a645320afcb86fa79cc29b08432308c1f`。
任务分支：`fix/opencode-context-20261013`。
工作树：`D:/PersonalAgent-worktrees/tasks/opencode-context-20261013`。
采用用户提供的治理规则 V2.1；全局交互策略读取结果为 idle。没有操作用户桌面、修改全局模型配置或替换运行实例。

## 原因与处理

Codex 从实时 `thread/tokenUsage/updated` 的 `modelContextWindow` 取得窗口；Claude 从结果中的 `modelUsage.contextWindow` 取得窗口。OpenCode 已有模型目录查询及 `limit.context` 接线，但本机自定义配置中的 DeepSeek、Gemini、GPT-6.1 Sol 和两项 Claude 模型没有填写 limit。缺失时没有后续回退，界面持续显示未知。

本次另对默认解析到的本机 OpenCode 可执行程序启动独立后台服务，仅读取模型目录，没有发送模型提示词。服务实际返回空的 `/api/provider` 与 `/api/model`，也缺少 JSON Schema structured-output 协议。这仅证明该默认可执行程序的隔离查询失败，不代表所有指定 executable 或正在运行的实例都具有相同问题；没有放宽执行能力门禁。

窗口来源顺序：已有 Session 窗口、Controller 明确配置、OpenCode 明确模型配置、官网本地快照；后续原生模型目录返回窗口时覆盖回退，并移除官网来源标记。原生占用量仍独立记录，不从窗口大小推算用量。未命中精确模型 ID 时保留未知。

官方快照保存于 `src/opencode-context-limits.ts`，每项包含精确模型 ID、数值、官网链接，统一核验日期为 2026-10-13。它是随代码保存的离线快照，本次没有增加自动爬取或定时刷新；以后补充或更新时需重新核对官方来源。上游模型规格不能证明第三方服务商的实际限额，因此界面明确标注来源及待确认边界。明确的 272000 配置不会被官网大窗口覆盖。

历史 `model-context` 事件缺失窗口时，在读取显示层补充来源，不改写原审计或状态，也不修改历史压缩阈值。未来调用在服务启动前保存回退窗口和适用的压缩阈值。

## 官网来源

- GPT-6.1 Sol：1050000，[OpenAI 模型文档](https://developers.openai.com/api/docs/models/gpt-6.1-sol)。Codex 原生有效窗口可能与 API 规格不同，不能跨适配器照搬。
- Claude Opus 5.5、Sonnet 5：1000000，[Opus](https://platform.claude.com/docs/en/models/opus-5-5/overview)、[Sonnet](https://platform.claude.com/docs/en/models/sonnet-5/overview)。
- Gemini 3.8 Flash：1048576，[Google 模型文档](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)。这里保存官网的输入 token 限额。
- DeepSeek V4.1 Flash、V4 Pro 0813：官网标注 1M，快照保存 1000000，[DeepSeek 模型规格](https://api-docs.deepseek.com/quick_start/pricing/)。
- DeepSeek V4 Flash 0731：1048576，[DeepSeek 官方开源配置](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731/blob/main/config.json)中的 `max_position_embeddings`。这是模型规格回退，不是服务端 API 限额实测。

## 自测

- 根目录 `rtk npm run build`：退出码 0。
- 桌面目录 `rtk npm run check`、`rtk npm run build`：退出码 0。
- `node --import ./scripts/regression-policy.mjs --test dist/test/model-context.test.js dist/test/opencode-context-limits.test.js`：9/9，退出码 0。覆盖离线读取、两种配置格式、精确 ID、损坏配置、原生值覆盖、Session 恢复、显式窗口与历史审计不变。
- `node --import ../scripts/regression-policy.mjs --test out/service.test.js out/sessions.test.js`：88/88，退出码 0。
- 首轮模型上下文、兼容性、压缩配置、执行适配器组合回归：40/42，退出码 1。新增测试的 Store fixture 使用了不合规 ID，后又发现临时目录不在 D 盘，已改为 UUID 和本任务 D 盘验证目录，最终上述 9/9 通过。另一项既有单/双决策组合测试发生 `Timeout after 3000 ms`；单独以 `--test-name-pattern "all single/dual decision combinations"` 复跑，1/1，退出码 0。其余执行适配器测试通过。没有修改超时或弱化原有测试。
- 使用真实本机配置调用本地回退函数：七个缺失 limit 的模型均取得官网快照；`callai/gpt-6-astra` 保留配置中的 272000。
- 静态审查及 `git diff --check`：通过。以上为开发者自测，不是 Controller 独立验收，也不是 GUI 验收。

## 交付边界

GUI 未运行验收；运行中的 DEV/TEST 实例未更新或重启，未推送、部署或发布。

本地 TEST 目标工作区有 `schemas/*.schema.json` 生成文件改动及未跟踪 `test-projects/`。虽生成文件的文本 diff 为空，工作区整体仍不干净；未覆盖、清理或纳入这些文件。V2.1 的目标安全条件暂未满足，因此任务成果保留在独立工作树，尚未自主提交或合并 TEST，没有取得或释放其他任务的集成锁。整合需在目标工作区干净后重新核对最新 TEST、取得共享集成锁并验证最终组合。
