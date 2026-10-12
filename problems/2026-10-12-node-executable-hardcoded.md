# 桌面启动依赖固定 Native Node 路径

- 归属：PersonalAgent。状态：待处理。优先级：P3。来源：外部审查 A7。
- 证据：TEST `desktop/src/main.ts:23` 创建 DesktopService 时使用 `C:/Program Files/nodejs/node.exe`；service 构造器要求绝对路径存在，launch 用其启动 Controller CLI，环境中删除 `ELECTRON_RUN_AS_NODE`。
- 影响：Node 安装在其他位置或没有单独安装 Native Node 时，桌面服务启动可能失败。当前机器故障未复现。
- 修正：Electron 主进程的 `process.execPath` 通常是 Electron 可执行文件；直接替换会在当前 launch 环境下引入错误启动，原报告建议不能直接采用。
- 下一步：配置或探测真正的 Native Node，或明确设计和验证 Electron 的 Node 启动方式及环境约束。
- 验证：静态确认；未做跨机器测试。
