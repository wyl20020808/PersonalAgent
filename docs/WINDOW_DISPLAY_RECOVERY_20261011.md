# TEST 窗口跑到屏幕之外的修复

日期：2026-10-11。任务：`window-display-recovery-20261011`。执行方：外部 Codex 开发会话。基线：TEST `c520648cf41d1f1137c7abfa0e3ea33a66e2b612`。分支：`fix/window-display-recovery-20261011`。工作区：`D:/PersonalAgent-worktrees/tasks/window-display-recovery-20261011`。

## 根因与现场

TEST 保存的 `D:/PersonalAgent-data/instances/test/window.json` 为 `{x:2937,y:295,width:1453,height:913}`。原主进程只检查尺寸和坐标是否为整数，就把旧位置传给 BrowserWindow；再次点击快捷方式只恢复最小化并聚焦，不检查坐标。主屏或显示布局变化后，旧坐标仍被保存和使用。

真实 Electron 读取到本机两块显示器：主屏 DIP 区域 `x=0,y=0,width=2560,height=1440`，另一块 `x=-2560,y=0,width=2560,height=1440`；两块 workArea 高度为 1392，缩放均为 1.5。旧 `x=2937` 位于两块屏幕之外，符合用户描述，并非存在第三块物理屏幕。

## 修改

新增 `windowPlacement.ts`，用 Electron DIP workArea 校验保存位置。现有屏幕上可用的位置保留；无法使用标题栏或完全不可见的位置回到当前主屏中央，并限制窗口尺寸和坐标，使其适应当前工作区。支持负坐标副屏、上下排列、任务栏占用及较小显示区域，未把副屏统一当成异常。

主进程在启动前使用此逻辑；监听显示器新增、移除和指标变化，在窗口关闭时清理监听；再次点击快捷方式时先恢复最小化，再检查位置、显示和聚焦窗口。恢复异常窗口时保留最大化／全屏状态。

原窗口配置未被手工删除或重写，聊天、Run、Session 与项目数据未改变。下次打开 TEST 时新代码读取旧位置并自动修复，正常关闭时沿用原位置持久化机制。DEV、MAIN 不更新，不自动重启用户实例。

## 验证

- 根项目 `npm run build`：通过，用于新工作区的桌面编译依赖。
- 桌面 `npm run check`：通过。
- 桌面 `npm run build`：通过，有既有 Vite chunk 和 use-client 提示。
- `node --test desktop/out/windowPlacement.test.js`：7/7 通过。覆盖旧第三屏坐标、负坐标／上下副屏、仅露出一小块／标题栏不可见、工作区缩小／任务栏、无效配置、最大化／全屏保留、显示事件恢复和清理。
- `node desktop/validate-window-placement.mjs`：退出码 0。使用真实 Electron、当前物理显示布局和生产恢复函数，创建隔离且始终不可见的 BrowserWindow。旧 TEST 坐标恢复为请求位置 `x=553,y=239`；实际 Electron 窗口处于当前主屏工作区内。三种显示事件与再次唤起使用的恢复函数均验证通过。显示事件由该隔离进程内发出，未真实拔插显示器或改变用户屏幕布局。
- 自查源码及 `git diff --check`：通过。外部开发者测试和自查不称为 Controller 独立验收或独立模型审查。用户可见的完整 TEST 窗口试用未执行，不据此声明完整产品 GUI 验收通过。

真实显示与窗口几何证据：工作区 `.validation/window-placement/result.json`。没有调用付费 Agent 模型。

## 治理与 TEST 集成

用户本轮提供的 AGENTS.md 已替换旧指令，要求 V2.1 条件式自主合入 TEST。TEST 文件仍为 V2；本任务显式读取并接入 `D:/PersonalAgent/docs/PERSONALAGENT_DEVELOPMENT_GOVERNANCE_V1.md` 的 V2.1 全文，依照用户直接指令采用第四节条件式自主合并授权，未批量覆盖其他工作区规则文件。

只提交本任务文件。集成前须核对 TEST 干净、无未完成 Git 操作，原子取得 Git common directory 下 `personalagent-test-integration.lock`，记录归属与目标提交。持锁核对最新组合，保留历史合入；保持锁直到目标状态与必要检查完成，仅释放本任务锁。没有启动或替换活跃实例的权限扩张，没有 DEV/MAIN、推送或发布授权。
