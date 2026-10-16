# 技能根目录去重后按位置过滤会排除 OpenCode 自身技能

- 归属：PersonalAgent。状态：待处理。优先级：P2。来源：用户要求复核外部审查；本轮用确定性夹具确认。
- 复核基线：TEST `a2d3f95`。
- 已确认原因：`src/shared-skills.ts:11-17` 返回去重后的根目录数组，`src/opencode-runtime.ts:84-86` 在 `OPENCODE_DISABLE_EXTERNAL_SKILLS=true/1` 时仍把下标 1、2 当作 Claude 和 agents 根目录。去重会改变后续下标。
- 最小场景：将 `CODEX_HOME` 与 `CLAUDE_CONFIG_DIR` 指向同一夹具目录，设置独立的 OpenCode 配置目录，并在它的 `skills/` 放入合法技能。去重后 OpenCode 自身根位于下标 2，被 external-only 过滤排除。
- 实际验证：独立工作树 `.validation/verify-findings.mjs` 调用实际 `userSkillRoots` 和 `opencodeEnvironment`。关闭 external 禁用时，最终 skills.paths 包含夹具的 OpenCode 原生技能；启用时不包含。退出码 0。环境变量仅作用于本次 Node 子进程，未修改用户配置、真实技能或启动服务。
- 影响：合法的自定义目录重合配置会改变技能过滤语义。不是所有默认配置均失败，也未验证远端模型实际使用技能。
- 下一步：在去重前保留根目录的语义身份，按来源筛选后去重；核对 Claude/Codex 共享技能中同样依赖 roots 下标的代码。补充根目录重合、完整重合、环境变量自定义与原生技能保留回归。
