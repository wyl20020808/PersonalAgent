# 长任务通信不限时修复验证记录

日期：2026-10-10（Asia/Shanghai）。

## 状态与授权范围

用户在确认软件的约五分钟通信超时后，明确要求修复长任务通信并取消执行时长限制。本次实现取消真实任务的固定运行时长，保留主动停止、异常报告、Session/任务归属验证及既有任务轮数和正式交付审批。服务启动、能力发现、停止清理等短操作仍有故障检测时限，它们不限制已开始的任务运行时长；渠道断连或服务退出仍按真实错误处理，不承诺外部渠道永久可用。

修复位于独立候选工作区，尚未提交、合并、推送、发布、替换或重启运行版本，未恢复真实游戏 Run。没有调用真实模型服务。实际 Electron 界面验收为 deferred_by_work_mode，不能记作通过。

发起环境为当前 Codex 开发会话，原正式源码目录为 main 的 D:\PersonalAgent。Git 开发基线为 dev `3c32ebb34534da3c566c64a42621a75717cc00c1`；分支 `fix/decision-rework-resume-v1`；工作区 `D:\PersonalAgent-worktrees\tasks\decision-rework-resume-v1`。本次在同一连续修复任务中保留前一决策返工修复。

## 最终行为

- OpenCode 共享启动器为自己启动的本地服务建立专用 Undici 客户端，响应头和响应内容等待不设固定时限。SDK 请求与事件流使用同一通信配置，退出时销毁连接池；不修改全局 fetch。
- `timeoutMs=0` 明确代表不限时。Controller、OpenCode、协作规划、Claude/Codex 子进程及验收进程识别该值；主动停止信号继续生效。显式有限配置仍可供 CLI、Mock 和其他调用方使用。
- 桌面新建真实任务默认配置为 0。恢复旧真实任务时通过正式 CLI 传递 `--timeout-ms 0`，在 Controller 锁内校验、保存并记录变更。配置 Profile 文件不被覆盖，历史会话和实际调用次数保留。
- 适配器按本次运行的持久化配置读取时限，避免旧适配器对象继续使用历史配置。普通 CLI 可在 start/resume 使用 `--timeout-ms 0`。
- 日志增加经过白名单筛选的底层错误名称和错误码，避免仅留下泛化的 fetch failed；不记录请求头、凭据或请求对象。

依赖新增 `undici ^7.30.0`，同步锁文件；配置和 State 导出 Schema 同步支持 0。具体文件范围见 `.validation/long-task-candidate.json`。

## 验证结果

| 检查 | 结果与证据 |
| --- | --- |
| 修复前本地请求 | 304425 毫秒后 fetch failed，底层 UND_ERR_HEADERS_TIMEOUT；`.validation/node-fetch-timeout-probe.json` |
| 修复后实际长请求 | 等待响应头 320035 毫秒、等待响应内容 320036 毫秒，均成功；`.validation/fixed-fetch-timeout-probe.json` |
| Controller 构建 | 多次通过，最后一次在最终适配器修改后执行 |
| 桌面构建、类型检查 | 通过；构建仍有既有 lucide-react use-client 提示 |
| 桌面回归 | 90/90 通过；`.validation/unlimited-desktop-regression.log` |
| 最终 OpenCode 执行、决策、Codex 决策适配器回归 | 51/51 通过；`.validation/unlimited-adapters-final.log` |
| 另补 Claude/Codex 持久化不限时配置测试 | 1/1 通过；`.validation/unlimited-process-adapters-final.log` |
| 初次受影响六套测试 | 79/80；唯一失败为新测试把已有 Session 交给另一个不含它的假服务。修正隔离夹具后，该决策文件 15/15 通过，后续最终适配器回归也通过。其余 65 项初次通过，包含 Controller 不限时/停止/历史配置恢复、传输和子进程停止、协作规划；保留初次失败日志，不冒充初次全通过 |
| 扩展 Controller/无快照/native/故障/Codex 回归 | 68/74，6 项既有快照夹具失败；`.validation/unlimited-controller-compat.log` |
| 新发现的三项 native 失败对照原 dev Controller | 同样 3/3 失败；`.validation/unlimited-native-baseline.log`；另外三项 Controller 失败已在前次调查验证基线也失败 |
| 差异空白检查 | 通过；仅有本机换行策略提示 |

长请求测试只监听 127.0.0.1，运行的是最终专用通信工厂；请求期间没有经过中转站。其他测试使用隔离仓库、假服务或注入的进程输出，属于开发会话自测，不是 Controller 正式独立交付验收。测试进程和本地 HTTP 服务均已退出。

## 候选复核绑定

当前 24 个代码、测试、依赖和 Schema 文件（包括前一决策返工修复）的完整清单及逐路径排序规则在 `.validation/long-task-candidate.json`。按“路径 UTF-8 + NUL + 原始文件字节 + NUL”计算的 SHA-256：

`dceea5ac07cb59b96cbf0661c272ac41599dd6cb41fdbd0f1d97a92c31ebf12b`

组合补丁：`.validation/long-task-communication.patch`，SHA-256：

`c5b40dd3655276f8b91e1c277d1594e893111c08746512c58dd87cc19e4883d5`

前一 `DECISION_REWORK_RESUME_VALIDATION.md` 的七文件哈希仅绑定前次快照；包含本次修改的最终候选以本报告为准。

## 后续交付

仍需按开发治理进行正式审查和交付审批。更新 dev 前重新核对其 HEAD、用户修改、活跃任务和安全停止点；获批后才整合、替换运行版本并验证原 Run 恢复。六项既有回归失败已补充到快照夹具问题记录，未篡改它们或恢复用户已取消的全项目快照扫描。没有对 main 发布或远程推送的授权。
