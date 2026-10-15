# OpenCode 免费模型在只读讨论中重复读取文件

状态：待处理。归属：PersonalAgent 与上游 OpenCode 模型/结构化输出协议之间的真实兼容性，根因尚未确认。日期：2026-10-15。

在 Mac arm64、OpenCode 1.18.35、SDK 1.18.35 上，用正式 `DesktopService` 创建只读讨论会话，选择已被本机模型发现报告为可用的 `opencode/big-pickle`。请求仅为读取项目 README 并回复首行标题。

本地服务、模型发现与原生工具可用，但调用未收敛：审计记录了 69 个不同 callID 的完成 read 事件，均持续读取同一个 README，没有最终回复。不能把三个状态事件当成三次调用；69 次来自 completed read 的独立 callID。人工开发会话在约 4 分钟重复读取后，仅终止本任务拥有的服务进程以结束验收，不把这次主动终止称为服务自然崩溃。正式调用最终保留失败消息 `OpenCode Decision idle state unknown; manual recovery required`，原 Session 与审计未删除，未伪造 pass 或自动重放。

会话 ID：`b8b38412-3554-4782-a185-83c40a36de59`。状态 ID：`a2159f5d-a03e-40c7-acae-e90addfadf61`。本机记录位于任务工作根目录的 `work/mac-opencode-evidence/data/conversation-discussions/`；完整绝对路径见 Mac 试用验收报告。记录只反映此免费模型和此场景，不代表其他 provider/model 的结论。

影响：OpenCode 接口保留，当前不能宣称该模型的真实只读讨论通过；执行和多决策者真实链路仍待相应服务验收。已通过的 Codex 真实开发与恢复不受此记录影响。

下一步：检查原始原生工具结果和 prompt/format 协议是否被上游模型接收；用用户授权且已认证的另一模型做一次最小对照，区分模型工具循环、上游格式兼容与 Controller 传递问题。不得关闭 Hook、去掉只读约束或删除原 Session 来规避问题。
