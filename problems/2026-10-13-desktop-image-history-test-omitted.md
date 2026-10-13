# 历史图片回归已构建但未纳入桌面默认测试

- 归属：PersonalAgent。状态：待处理。优先级：P3，测试覆盖遗漏。来源：用户提供的第三份审查，本轮静态复核。
- 基线：报告原为 TEST `a2d3f95`；本轮核对当前 `fa7525376f82b21ffeca169971dc66f3d9572c3c`，遗漏仍在。
- 证据：`desktop/build.mjs:5` 明确包含 src/codexImageHistory.test.ts 构建入口；`desktop/package.json` scripts.test 用显式文件列表且不包含 out/codexImageHistory.test.js。根目录 test 只执行 dist/test/*.test.js，也不执行此桌面回归。
- 覆盖意义：该文件验证历史图片的 workspace/Thread/调用时间窗口归属、结束状态、去重、隐藏推理排除及原始日志不被改写。默认测试绿灯不能证明这些场景通过。
- 边界：只证明两个默认 npm test 入口遗漏，不声称从未人工执行，也不要求所有可见 GUI 检查必须塞入常规测试。
- 下一步：将此纯本地确定性回归纳入桌面默认入口，或建立明确的默认 headless 组合入口；核对构建产物齐全并实际运行该文件。不要只增加脚本字符串却不验证执行。
- 本轮没有修改 package.json 或测试内容，也未重新运行该测试。
