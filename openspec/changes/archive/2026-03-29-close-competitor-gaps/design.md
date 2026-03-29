## Context

Hive README 声称解决了 OpenClaw 的 8 大痛点，但代码审查发现 6 个痛点存在实现差距。当前代码已有框架基础（WorkflowCapability 三阶段管道、CORE_AGENTS 工具列表、CompressionService、SecurityHooks），但部分功能停留在"框架搭了但未串联"的状态。

核心约束：
- 不引入新依赖，全部基于现有代码增强
- 不改变 dispatch/workflow 的核心流程，只在关键节点插入新逻辑
- 三阶段管道保持顺序执行（不做 DAG/并行）

## Goals / Non-Goals

**Goals:**
- 用户能看到每个任务的真实成本（token 用量 + 估算费用）
- explore/plan 阶段的只读限制是硬约束而非 prompt 建议
- dispatch trace 事件持久化到 SQLite，支持事后审计
- ERNIE（文心一言）作为第五家国产 LLM 加入预设
- 国产模型的已知参数冲突在适配器层自动处理
- workflow 长任务自动压缩上下文

**Non-Goals:**
- 不做实时成本告警/预算控制（后续迭代）
- 不做 agent-to-agent 隔离（单进程内不需要）
- 不做 trace 的可视化 UI
- 不做 DAG 编排或并行执行
- 不做 npm 包发布

## Decisions

### D1: 成本估算方式 — 基于模型单价表而非 API 返回

**选择**: 在 `providers/metadata/` 维护模型单价表（$/1K tokens），DispatchResult 新增 `cost: { input: number, output: number, total: number }` 字段。

**原因**: @anthropic-ai/claude-agent-sdk 的 `query()` 不返回精确 token 计数（`usage` 字段不稳定），自建估算更可靠。

**替代方案**: 解析 SDK 的 tool_use 消息估算 token → 复杂且不准，放弃。

### D2: 权限硬限制 — 在 runner.execute() 的 tools 参数层面限制

**选择**: `runner.execute(agent, prompt, { tools: ['Read', 'Glob', 'Grep'] })` 只传允许的工具列表给 SDK，而不是传所有工具靠 prompt 说"请只用这些"。

**原因**: SDK 的 `tools` 参数是白名单，不传就不可用。这是真正的沙箱隔离。

**实现**: SubAgentCapability.explore() 和 .plan() 调用 runner.execute() 时，从 CORE_AGENTS 读取对应 agent 的 tools 列表传入。

### D3: Trace 持久化 — 复用 SessionManager 的 SQLite 存储

**选择**: 新增 `trace_events` 表（或复用 Session 的 metadata 字段），Dispatcher 在 dispatch.complete 时将整个 trace 数组写入。

**原因**: 不引入新存储后端，SessionManager 已有 SQLite 通道。

**替代方案**: 单独的 trace 日志文件 → 不便于查询，放弃。

### D4: 国产模型参数适配 — 在 openai-compatible 适配器中做参数预处理

**选择**: 维护一个已知模型的参数黑名单/白名单，在请求发出前剥离不支持的参数（如 GLM 的 reasoning_effort、Kimi 的某些 stream 参数）。

**原因**: 集中处理比每个模型单独写适配器简单。

### D5: Workflow 自动压缩 — 在 plan→execute 之间插入压缩

**选择**: WorkflowCapability.runComplexTask() 在获得 exploreResult 后、构建 plan prompt 前，调用 `sessionManager.compressIfNeeded()`。在获得 executionPlan 后、构建 execute prompt 前，再次调用。

**原因**: explore 产生的文件列表和 plan 产生的方案文本是上下文膨胀的主要来源。在两个关键节点压缩效果最好。

**风险**: 压缩本身消耗 token（需要 LLM 调用 SummaryStrategy）→ 只在消息数超过阈值时触发（CompressionService 已有 needsCompression 判断）。

## Risks / Trade-offs

- **[成本估算不准]** 单价表需要手动维护，模型价格变动时需更新 → 定期同步主流模型价格，估算用于参考而非精确计费
- **[权限硬限制可能影响灵活性]** 某些场景下 explore 可能需要 Write 工具（如创建临时文件） → 提供 `options.tools` 覆盖机制，高级用户可自行扩展
- **[Trace 持久化增加写入频率]** 每次 dispatch 都写 SQLite → SQLite WAL 模式下写入延迟 <1ms，影响可忽略
- **[压缩可能丢失细节]** LLM 摘要会丢失具体代码行号等信息 → 保留原始消息引用，压缩后可回溯
- **[ERNIE API 差异大]** 百度文心一言的 API 格式与 OpenAI 差异较大 → 评估后若差异过大，标记为 experimental
