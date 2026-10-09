# FPSArena 第一次真实隔离建档执行方案

状态：待真实启动授权；未创建真实 Run，真实调用 0。此文件不表示已授权或已执行。

用户最新指示：不用金额预算、不设置费用上限。因此不另设金额上限，不要求充值、不修改认证或默认模型。现有 Controller 调用计数、失败预约、恢复和返工约束继续沿用，不将次数约束称为金额硬上限。

## 可审阅范围

- 源目录：`D:/PersonalAgent-projects/FPSArena`，普通非 Git 文件夹，现有文件只读保护。
- 软件：`D:/PersonalAgent-worktrees/tasks/project-context-v11-phase1` 的当前构建；main/dev 工作目录不改。
- 正式入口：context-start，purpose=context-onboarding，projectMode=isolated，executionMode=native。
- 独立 runtime：`D:/PersonalAgent-data/project-context-v11/FPSArena-onboarding-first`。真实执行前确认该路径不存在；若已占用先报告，不覆盖或复用历史 Run。
- 工作副本：上述 runtime 的 `runs/<新 Run UUID>/workspace`，沿用现有隔离文件快照；不初始化源项目 Git。
- 产出仅为 `docs/project-context/` 的四类文档：真实总览、按实际源码划分模块、程序计算的 checked_files、确有依据的 proposed 契约/决策。预计 5–15 份文档，不凑数，不超过现有 50 文件/2 MiB 交付限制。
- 不改游戏功能、资源、依赖和运行配置；不创建 PersonalAgent 自身 Context，不运行第三阶段 T1/T2/T3。

## 调用顺序与原生约束

一次新 Run：预计 CC Plan 1 次 → Codex Execute 1 次 → Controller 文档独立验收 → CC Review 1 次。计划要求以一个完整建档任务提交，验收涵盖全部文档。

现有 Controller 配置保留有限字段：maxClaudeCalls=4、maxLoops=2、maxReworks=1，分别容纳一次必要返工及审查；不是新增金额上限。每次 native 调用超时 20 分钟，失败和中断仍消耗原计数，不自行重建 Run、扩大次数或重复扣旧账。

配置文件：`.validation/project-context-v11/FPSArena.onboarding.request.config.json`。该文件尚未用于调用。独立验收为当前构建的 context-check，既有 Controller 继续检查完整 Diff、范围、隔离快照、退出码和证据；CC 核查真实模块划分、依据与盖章操作。

停止条件：认证/渠道错误、源目录变化或快照冲突、范围违规、损坏文档、超时、原计数耗尽、超出现有交付限制、需要修改游戏或确认重大决策；保留现场，不自动扩大范围或绕过 Controller。

## 用量与费用事实

当前主体代码/测试/资料约 230 KB。一次正常三角色流程按需读取估计累计输入 80k–200k tokens、输出 5k–15k；含一次返工估计输入 160k–400k、输出 10k–30k。这是执行前粗估，含恢复历史和工具输出不确定性，不是实测读取或 token 统计，不保证实际用量在该区间。

Codex 本机配置是 custom provider 的 gpt-6.1-sol/high；Claude 是本机原生默认模型。实际计费遵循用户已有渠道账单或账户额度。没有可核实单价，不能用公共 API 价格冒充本机价格。用户已明确不要求金额预算或费用上限，故不提供虚构金额，也不宣称有金额硬限制。

## 真实结果与交付

获明确真实启动授权且最终确定性验收通过后，才执行一次 context-start。完成后生成现有 delivery-preview，提交真实总览、模块划分、完整 Diff、摘要与待确认提议，并停止。

本次启动授权不包含文档 approve/apply、feature 提交/整合 dev、发布 main 或 push。应用批准必须绑定这次真实预览；文档批准不等于接受 proposed 契约/决策。
