# 桌面创建配置依赖固定用户的 Claude 路径

- 归属：PersonalAgent。状态：待处理。优先级：P2。来源：外部审查 A3。
- 场景：其他用户名、不同安装目录或迁移机器后创建 Claude Code 任务。
- 证据：TEST `desktop/src/service.ts:185` 的 `startProject` 写入 `claudeExecutable:'C:/Users/WYL20/.local/bin/claude.exe'`；`profile()` 使用该路径检测可用性。MAIN 旧源码也存在相同写法。
- 影响：没有通用配置或探测路径，其他环境可能误报未安装或启动失败；不等于当前机器已故障，也不代表纯 Codex/OpenCode 任务必然不能执行。
- 已确认原因：机器专属安装路径嵌入通用项目配置。
- 下一步：复用可信本地配置、环境或 PATH 探测，明确可执行文件来源并验证；不读取或复制凭据。
- 验证：静态确认。未做跨机器实测。
