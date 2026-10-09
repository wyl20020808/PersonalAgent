# OpenCode 决策者真实协议兼容性补丁验收

日期：2026-10-09。本文是兼容性补丁报告，原 `DECISION_AGENT_PROVIDER_V1_VALIDATION.md` 保留为历史验收证据。

## 结论与边界

独立安装的 OpenCode CLI **1.18.35** 与项目 `@opencode-ai/sdk` **1.18.35** 已通过真实服务协议、动态模型发现及真实 CLI 的本地 Plan/Review 协议测试。OpenCode Desktop 自带 CLI **2.0.26** 的实际 OpenAPI 未提供此 Adapter 所需的官方 `format: json_schema`，仍明确拒绝推理，不解析文本冒充结构化成功。

本次所有远端模型生成请求为 **0**。真实 CLI 的 Plan/Review 使用 localhost 模型模拟，证明服务、SDK、工具及 Controller 协议兼容；不能据此宣称任何远端模型、订阅或额度已经通过真实推理验证。因此本次不提交“已证明远端组合可用”的真实 Smoke 方案，不启动真实付费任务。

所有模型共用同一个 Adapter、Plan/Review Schema、工具事件与 Controller 验收路径。没有按模型名称添加分支。Provider 检查仅确认配置能否被发现、目录鉴权及模型 ID 是否存在；不逐模型执行 Plan/Review。

## 分支与集成

- 原 feature 提交：`3a535a087e3c9aba297fe2014d803b80af16dd47`，原分支和历史证据未修改。
- 最新 dev 基线：`aff80240342176ec196fedb2028905f489afced9`，已包含预算门槛移除。
- 独立候选分支：`fix/opencode-real-compatibility-v1`。
- 实际修改与构建工作区：`D:\PersonalAgent-worktrees\tasks\opencode-real-compatibility-v1`。
- 从最新 dev 创建候选环境，将原 feature 变更无提交应用并处理冲突；没有覆盖 main/dev，没有接触其他 feature 的未提交工作。
- 新旧两个决策 Adapter 通过最新 dev 的 `recordClaudeCall` 记录调用，不恢复 `reserveClaudeCall`、共享预算门槛、付费确认框或旧 SessionBudget。保留当前 Controller 调度、Review 修复计数、Run 路由及人工交付审批。
- Codex Execute 实现未改变。Claude Code 默认路径与历史 Run 默认身份继续兼容。
- 本次未进行真实 CC 源码审查或正式交付审批；报告中的回归均为本开发会话执行的确定性检查。候选变更尚未提交、合并或推送。

## 实际协议与必要修改

1. 原结构化能力检测仅浅层展开 `$ref`，无法识别真实 V1 OpenAPI 的嵌套 OutputFormat。现在递归解析引用，并防止循环。
2. V1 1.18.35 同时暴露旧 `/session` 和新 `/api` 路由。原代码只看 `/api/provider` 是否存在，误选 API 家族。现在优先选择实际拥有官方 Schema 合约的旧服务接口。
3. 原生返回字段使用当前 SDK 的 `info.structured`，继续用既有 Plan/Review Schema 校验。没有文本 JSON 提取或静默降级。
4. 增加 `src/opencode-runtime.ts`：只读用户配置，将已支持的 V2 Provider 包投影到 V1 包，凭据通过子进程环境传递，不写入 Controller 配置、Renderer、回执或生成配置文件。当前映射为 OpenAI-compatible 和 Anthropic；不支持的 Provider 包明确失败。
5. 每个 Run 使用自身运行目录下的 OpenCode 数据库与 XDG 目录；发现服务另用工作区哈希目录。保留 Session 归属检查、动态 localhost 端口、随机服务密码、取消与进程回收。禁用项目配置加载和自动更新，不修改全局模型默认值或 V2 数据。
6. 修复集成冲突造成的 Desktop 启动配置未传递 `decisionAgent`，启动前验证原 Backend/Provider/Model，避免选择 OpenCode 后静默落回 Claude Code。

真实 V1 `/doc` 文档 JSON 的 SHA256 为 `46db986090aae41846cd6dbe16225a1d883f0bbcb4c48814008d3f6ce140aa5c`。未携带自有密码的健康请求返回 401。实际 SDK Session 创建、读取、归属检查与删除通过，无模型请求。

真实 V2 `/openapi.json` 文档 JSON 的 SHA256 为 `6f748ff099b6c106f7dfe9fd9ca8710f6999c35a41b4d343eedc436739acc5d9`；Prompt 字段为 `id/text/files/agents/skills/metadata/delivery/resume`，未提供所需结构化参数。V2 的文本或自定义工具接口不构成本次要求的官方结构化输出替代方案。

依据：实际安装 SDK 类型与本机服务 OpenAPI；补充参考 [官方 SDK 文档](https://opencode.ai/docs/sdk/) 与 [V1 配置兼容源码](https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/config/v2-compat.ts)。文档字段示例与本机类型有差异时，以已验证的类型和服务协议为准。

## 全部已配置 Provider 的非付费检查

V1 实际发现了下表 5 个用户配置 Provider、15 个配置模型条目；另外自动发现 OpenCode Zen 的 10 个目录条目。目录存在与 SDK 能力元数据不等于推理鉴权或原生工具实际可用。没有调用任何免费或付费远端模型。

| Provider | V1 发现的配置模型 | 远端 GET 模型目录检查 |
| --- | --- | --- |
| hgapi | deepseek-v4-flash-0731、deepseek-v4-pro-0813、deepseek-v4.1-flash | HTTP 200，三者 ID 均存在 |
| hgapi-gemini | gemini-3.8-flash | HTTP 401，不能宣称鉴权成功 |
| callai | gpt-6-astra、gpt-6-sol、gpt-6-luna、gpt-5.6-sol、gpt-5.6-terra、gpt-5.6-luna、gpt-5.5 | HTTP 200；gpt-5.6-luna 不在远端目录，其余六者存在 |
| hgapi-openai | gpt-6-astra、gpt-6-sol | HTTP 200，两者 ID 均存在 |
| hgapi-claude | claude-opus-5-5、claude-sonnet-5 | HTTP 200，两者 ID 均存在 |

当前配置未发现 GLM/Kimi 模型 ID。不得因为目标包含这些模型而添加静态条目。发现结果保留服务返回的能力元数据，执行时仍要求工具与官方结构化协议，原生错误及 Schema 校验失败不会伪造成功。

## 使用与未支持功能

独立 V1 二进制位于：

`D:\PersonalAgent-data\opencode-compatibility-v1\toolchain\node_modules\opencode-windows-x64\bin\opencode.exe`

后续运行候选构建时，在可信服务端环境设置 `PERSONAL_AGENT_OPENCODE_EXECUTABLE` 指向该二进制，或使用已有 Core 配置 `decisionAgent.opencode.executable`。本次未修改正式实例的环境或重启实例。Desktop 在原 Run 配置中选择 OpenCode，再选择动态 Provider/Model；默认仍为 Claude Code。选错 V2 二进制会提示缺少结构化协议。

默认只读 `~/.config/opencode/opencode.json`；可信服务端可通过 `PERSONAL_AGENT_OPENCODE_CONFIG_FILE` 指定独立 V1 配置。认证资料不通过 Renderer 输入或返回。不自动读取、复制或迁移用户的 auth 文件。OAuth、V2 订阅、插件和 variants 未迁移验证；当前投影不载入 V2 插件或 variants，不承诺 V2 全部功能可用。

保留配置已有模型 ID、请求 body/options 和 limits；没有配置的 context/output 限制不猜测。部分现有配置缺少限制，V1 发现元数据出现 0；其实际推理表现仍未验证。模型列表可选择不表示该模型已经获得端到端可用认证。真实 Token/cache 继续只记录原生值，缺失字段为 unknown/null。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| Core TypeScript 构建及 Schema 导出 | 通过 |
| Desktop 类型检查和生产构建 | 通过；仅既有 lucide 构建提示 |
| 新增真实协议形状、Provider 投影、隔离环境测试 | 3/3 通过 |
| Claude CLI 旧路径、正式 real-mode 接线、事件过滤、无旧预算门槛定向测试 | 4/4 通过 |
| Controller Project Context/独立验收否决、进程取消回收定向测试 | 2/2 通过 |
| 当前 dev 预算移除与恢复测试 | 22/22 通过 |
| Desktop service/sessions/thread 完整相关测试 | 65/65 通过 |
| 真实 V1 服务协议、发现与 Session 检查 | 通过，无 Prompt |
| 真实 V1 CLI + localhost 模型模拟 + 正式 Controller | Plan/Review 均通过，Session 续接成功，独立验收通过 |

本地 CLI 测试共 4 次 localhost 模型模拟请求，执行原生 `read` 两次、`StructuredOutput` 两次，记录 8 个公开工具事件；Execute 是明确标注的本地模拟，没有调用 Codex 服务。Shell 工具出现在原生可用工具列表，但本次未执行 Shell。

可复现命令（先构建 Core，再传入独立 V1 二进制）：

```powershell
rtk proxy node scripts/validate-opencode-v1-local.mjs D:/PersonalAgent-data/opencode-compatibility-v1/toolchain/node_modules/opencode-windows-x64/bin/opencode.exe
```

该脚本只使用自己的 localhost 模型服务及 dummy 凭据；失败退出码为 1。它是协议测试，不是远端真实模型 Smoke，也不是正式开发 Run 的交付审批替代品。

调试中曾出现混合 API 家族误判与 Desktop 配置丢失，已修复并重测。第一次按名称过滤 Desktop 测试还漏掉依赖的初始化测试；最终使用完整相关 65 项测试验证，不把初次失败结果当作通过。

持久证据位于 `D:\PersonalAgent-data\opencode-compatibility-v1`：

- `probe-686225d7/result.json`：V1 OpenAPI、健康鉴权、发现与 Session 归属。
- `final-discovery-result.json`：修补后产品发现结果与 V2 协议差异。
- `provider-catalog-result.json`：全部已配置 Provider 的非付费目录结果。
- `cli-fixture-f725ec/result.json`：正式 Controller 本地协议验证结果。
- `final-safety-result.json`：扫描候选工作区及自有运行数据共 1850 个文件，未发现当前配置中的真实 API Key 值；依赖包与 npm 缓存未纳入该扫描。

## 后续集成风险

候选变更包含原 feature 加最新 dev 适配，不能只覆盖旧 Controller/Desktop 文件。集成前需再次核对最新 dev，特别是并行 Run 路由修改。当前预算移除行为已保留，不等待或恢复旧预算授权；本次不调用付费模型是用户明确约束。

真实远端 Plan/Review、各模型原生工具行为、推理鉴权与订阅权益尚未验证。只能在用户另外授权后开展小规模真实验证，执行仍经过 Controller、独立验收、Review Guard 与人工 Delivery 审批。main/dev、正式应用、OpenCode Desktop V2、全局认证与默认模型均未由本补丁修改。
