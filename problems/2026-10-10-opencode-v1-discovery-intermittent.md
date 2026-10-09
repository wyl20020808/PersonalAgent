# OpenCode V1 模型发现存在间歇性失败

- 状态：待处理。归属：PersonalAgent 的实验性 OpenCode 接入，根因未确认。
- 场景：DEV 集成完成后，以独立 DEV 数据目录启动实际 Electron，经 `decisionModels` IPC 发现 Provider/Model。
- 现象：首次返回 `Bad control character in string literal in JSON at position 53733`，第二次返回 `fetch failed`；第三次原样重跑成功，发现 6 个 Provider、25 个模型条目。
- 影响：OpenCode 下拉发现可能暂时不可用；产品明确返回错误并禁止无效选择，没有降级成伪造模型。默认 Claude Code 不受此发现路径影响。
- 证据：`D:\PersonalAgent-data\dev-integration-v1\published-dev-smoke.log`、`published-dev-smoke-final.log`、`published-dev-smoke-third.log`。同次直接 V1 发现和集成目录 Electron 复测成功，相关 Core/SDK/主进程编译文件逐字节一致。
- 已确认：没有发送远端模型 Prompt；本地 V1 Plan/Review 协议夹具通过。尚不能确认错误来自 CLI、HTTP 响应或运行环境，也不能用第三次成功证明长期稳定。
- 下一步：继续把 OpenCode 标记为实验性可选后端，实战优先使用 Claude Code。再次出现时记录脱敏服务阶段、响应长度及进程退出信息，再做最小定位；不要写入凭据或增加付费验证调用。
