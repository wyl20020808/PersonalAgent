# 工具状态误读输出文本

状态：修复完成，自测通过，待正式验收与集成。

证据：DEV `thread.ts` 的旧 `activityStatus` 在完整文本上匹配 `failed`、`exit_code=1` 等字符串。成功命令输出 `0 failed` 或文档样例也可能被标红；OpenCode bash 的 `metadata.exit` 非零又可能被 `status: completed` 掩盖。

处理：仅解析已知公开适配器格式。Codex 读取命令状态行和退出码，Claude 读取结构化 `is_error`，OpenCode 读取状态、错误和 bash 元数据退出码。未知或截断记录保持“已记录”，不推断成功。输出不作为状态信号；原文保留。

验证：专门测试覆盖成功输出含 failed、输出伪造退出码、真正失败、运行中、OpenCode 非零退出码、Claude 成功结果、截断数据、文件路径和公开输出封装。工具内容和公开摘要通过显示层整理，不修改历史审计。
