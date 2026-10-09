# 新会话启动后侧栏交付入口可能没有选中 Run

- 现象：由新会话发送需求并完成 Mock Run 后，直接点击左侧“成果交付”，页面没有“生成交付预览”。从群聊“项目详情”的“查看直接开发结果”进入则正常。
- 场景：新会话初始化转入真实持久化群聊，属于 PersonalAgent 既存导航问题。
- 影响：用户从侧栏进入交付页时可能看到空页；通过项目详情仍可完成 Preview / Approve / Apply。
- 证据：`D:/PersonalAgent-data/multi-agent-role-board-p1/electron-fa643e77/result.json`。基线 `desktop/src/App.tsx` 的侧栏导航仅设置 `page`，交付内容依赖 `selected`；群聊使用 `chatRun`，项目详情入口同时设置 `selected`。本轮没有修改 App.tsx。
- 状态：待处理，非本次双池 UI 的阻断问题。
- 下一步：独立修复导航时，从当前会话可信 Run 引用设置选中项；保持历史 Run、模式与审批绑定不变。
