# Desktop 回归的负向名称过滤未排除旧大型夹具

- 归属：本轮 Codex Desktop 验证脚本，不是 PersonalAgent 产品功能。
- 状态：已确认过滤方式问题；修正选择方式，未重跑大型夹具。
- 场景：Node 22.20.0，串行运行受影响的四个 Desktop 测试文件，原意以 `--test-name-pattern='^(?!.*(?:large project|10000 events)).*$'` 排除两个旧夹具。
- 现象与影响：实际执行 87 项，全部通过且没有排除。误跑 `large project session preparation preserves original runtime provenance without paid agents`（101 MiB 稀疏文件，109.7902 ms）与 `10000 events with long outputs group in linear time without losing output`（5.541 ms）。违反本轮不运行大型夹具的预期范围；没有 UE Cook、全库压力测试或付费调用。不能把测试通过解释为范围控制也通过。
- 证据：`D:/PersonalAgent-data/p3a-dev-integration-v1/desktop-targeted.log`。无害探针仅创建三个空测试，名称模拟 small、large project、10000 events：同一负向 name pattern 执行全部三项，`--test-skip-pattern='large project|10000 events'` 则只执行 small 一项。日志 `filter-negative.log`、`filter-skip.log`；探针不创建大型文件或消息数据。
- 已确认原因：当前 Node 测试选择语义下，该负向名称模式不是有效的排除方式。具体测试父级匹配传播细节未进一步追查；不把推测写成已证实原因。
- 处理与下一步：采用显式 `--test-skip-pattern` 或明确的正向专项名称，保留本次偏差和真实 87/87 结果，不删除或改写日志。本轮不为制造“排除后通过”记录而重跑完整 Desktop 测试。
