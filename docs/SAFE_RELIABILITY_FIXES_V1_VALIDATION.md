# 安全局部可靠性修复 V1 验证记录

日期：2026-10-10。用户要求：上课期间仅处理容易且安全的问题。

## 开发归属

- 发起方式：当前 Codex 开发会话，未通过 PersonalAgent 软件发起 Run。
- 基线：dev `95d5a71f88c4f14a975e3566135a152ea304f536`。
- 分支：`fix/safe-reliability-v1`。
- 工作区：`D:/PersonalAgent/.task-worktrees/safe-reliability-v1`。受本会话可写目录限制，独立 Worktree 放在该目录；未覆盖 main/dev 源码或产物。
- 状态：本地修复与自测完成；未提交、合并、发布或推送，未完成 Controller 正式审查和交付。

## 修改

1. Run 初始化路径解析及项目锁获取纳入已有失败持久化逻辑，提供可查询的 Run ID 和失败状态。锁冲突时不释放其他持有者的锁。
2. 流式 stderr 与 stdout 各保留最后 1 Mi 个字符，避免仅因累计流式输出触发旧输出限制；没有逐行回调时不积累 pending 缓冲。
3. 审计追加从尾部读取最后一个非空记录，避免为取得上一条 hash 读取全部日志；保持原 JSONL、哈希链和落盘格式。
4. README 区分当前执行权限与历史 MVP 设计，说明 Direct 支持范围、timeoutMs=0、Work Mode 未集成及输出保留范围。

## 实际验证

以下都是当前开发会话的本地自测，不是 Controller 独立验收。

```text
rtk proxy node node_modules/typescript/bin/tsc -p tsconfig.json
rtk proxy node --test --test-concurrency=1 dist/test/process-stream.test.js dist/test/safe-reliability.test.js dist/test/atomic-replace.test.js dist/test/failure-path.test.js
rtk proxy git diff --check
```

结果：TypeScript 编译通过；14 项测试全部通过，无跳过；差异空白检查通过。

覆盖：stdout/stderr ENOTCONN、Windows 过长 cwd 拒绝、流式 stdout/stderr 超过旧阈值仍完成且只保留尾部、非流式输出保护、跨块逐行回调、缺失项目初始化失败、活动项目锁冲突且原锁保留、长 UTF-8 审计记录及跨 Store 哈希链、尾部空白、损坏审计尾部拒绝写入、原子替换与失败分类回归。

最初受限沙箱运行时，活动锁测试因测试锁目录写入权限失败；获得仅用于测试的执行权限后通过。该测试只操作新建夹具对应的锁，结束后释放自己的锁。通信测试使用无 PID 的内存模拟子进程，没有启动或终止真实子进程。复用了本机已有依赖，未联网安装。

## 安全边界与未完成项

- 未操作鼠标、键盘、剪贴板、浏览器、窗口或焦点；未启动 Electron、真实模型、服务或真实项目任务。
- 未修改全局 Work / Idle 策略、Hook、历史 Run / Session，未清理真实项目锁，未执行重型构建或压力测试。
- 未跑全套回归；此前的六项旧快照测试失败没有在本任务修复或复测。
- Work Mode 集成、遗留恢复锁自动回收、桌面详情增量审计、验收配置预检仍暂缓。
- 带逐行回调的超长单行仍可能积累；流式 stderr 早期内容不全部保留在返回值中，未增加完整 stderr 归档。
- 验证仅证明这些局部修复的测试行为，不能据此宣称整个软件已达到安全保证或无限任务已全面验收。

后续应在正式审查和 Controller 验收后交付，再按治理规则批准整合；上课期间不替换正在运行的软件。

## 后续补充

以上是第一轮修复的历史记录。用户随后授权继续处理其余三项，Work Mode 保留。恢复锁身份与保守回收、验收启动预检、六项历史测试夹具迁移的最终范围和验证结果见 [后续三项验证](SAFE_RELIABILITY_FOLLOWUP_V1_VALIDATION.md)。该补充不将第一轮局部测试扩大为全库或运行版验收。
