# 侧栏运行图标间距

执行方：外部 Codex。基线：TEST `7d42272709bfe85bb5a14692b33b3f947efb3a76`。
任务分支：`fix/sidebar-spinner-spacing-20261012`。
工作区：`D:/PersonalAgent-worktrees/tasks/sidebar-spinner-spacing-20261012`。

将侧栏旋转图标向右偏移 4px，图标与标题边界的间距从 6px 增为 10px；不改变标题可用宽度、图标大小和旋转动画。鼠标悬停时原有隐藏图标、显示重命名按钮的行为保留。

`node .validation/check.mjs` 的隔离无头浏览器检查通过：与旧提交比较图标右移恰好 4px，间距 10px，正常旋转，悬停显示重命名按钮。截图已查看。`git diff --check` 通过。仅 CSS 改动，未运行无关代码测试。

合入 TEST 时持有共享集成锁，合并后复跑同一检查；前后提交和检查结果保存到 Git common directory 的任务集成 JSON。未启动或替换运行实例，实际 Electron 窗口未验收；DEV、MAIN 不变，不推送远程。
