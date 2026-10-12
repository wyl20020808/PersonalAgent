# 普通错误中的数字被误判为认证错误

- 归属：PersonalAgent。状态：待处理。优先级：P2。来源：外部审查 A2。
- 现象：未知错误文本只要含独立数字 401 或 403，就优先分类为 authentication；429 同样可能误判额度问题。
- 证据：TEST `src/failure.ts:9-23`。直接转译当前源码调用 `classifyFailure(new Error('ran 403 lines in 12s'),'execute')`，得到 `authentication,recoverable=true`，本地验证退出码 0。
- 影响：错误标签和恢复建议失真；未知或校验错误可能错误进入认证恢复路径。已带明确 `FlowError.kind` 的错误不会再次走这段正则，影响不能扩大到所有异常。
- 已确认原因：裸状态码匹配缺少 HTTP/Provider 上下文，且认证分支优先于其他分类。
- 下一步：优先使用结构化状态字段；文本兜底要求明确状态或认证语境。覆盖普通数字、真正认证错误及明确类型保留。
- 验证：确定性本地复现通过；未调用模型。证据见 `D:/PersonalAgent-data/audit-problem-records-20261012/verification.json`。
