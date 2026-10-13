# 非法历史时间导致自动监督静默跳过 Run

- 归属：PersonalAgent。状态：待处理。优先级：P3。来源：用户要求复核外部审查。
- 复核基线：TEST `a2d3f95a645320afcb86fa79cc29b08432308c1f`；外部 Codex 独立工作树验证，不涉及真实 Agent Run。
- 已确认原因：`desktop/src/service.ts:134` 将会话创建时间及所有消息时间直接传给 `Math.max`；`139` 对 human-decision 时间做相同合并。一条不可解析的时间会把 `lastUserAt` 变为 NaN。`src/automatic-supervision.ts:31-38` 对非有限时间返回 false，因此此 Run 不再满足接管条件。`desktop/src/sessions.ts:36` 读取历史 JSON 未校验消息时间。
- 影响：含损坏或非法历史时间的会话无法自动接管；不影响其他 Run，也不代表正常写入的 ISO 时间必然触发。静默跳过不利于定位数据问题。
- 验证：在独立工作树构建后，`.validation/verify-findings.mjs` 调用实际 `supervisionDue`，合法旧时间返回 true；使用与 service 相同的时间合并表达式加入 `not-a-time` 后返回 false。脚本退出码 0。未启动桌面服务或改写真实历史。
- 下一步：明确非法历史时间的处理规则；避免一条消息污染所有合法时间，并对损坏的必要时间记录可见诊断。不能仅删除 `supervisionDue` 的有限值保护，也不能随意将损坏时间设为 0 导致提前接管。补充 message、createdAt、human-decision 三条输入路径的回归。
