## Context

Agent 当前有 5 个执行入口：chat()、chatStream()、swarm()、pipeline()、runWorkflow()，加上新增的 dispatch()。外部调用者（CLI、HTTP、WebSocket、飞书、Orchestrator）各自选择调用不同方法。

Dispatcher 已实现 LLM 分类 + 路由能力，但各方法仍直接调用对应 Capability，Dispatcher 未被任何外部调用者使用。

流式 API（chatStream/sendStream）存在于 SDK 中，但实际是 UI 层关注点，SDK 内部无消费场景。

## Goals / Non-Goals

**Goals:**
- Dispatcher 成为所有执行路径的唯一决策点
- 删除流式 API，保持 SDK 精简
- 外部调用者零改动（chat() 返回值和签名不变）
- heartbeat 只保护 chat 层对话活跃度

**Non-Goals:**
- 不合并 DispatchOptions / AgentOptions / SwarmOptions（各层 options 独立）
- 不修改 Gateway（HTTP/WS）代码
- 不增加新的流式能力
- 不修改 Dispatcher 内部路由逻辑

## Decisions

### D1: Agent 方法内部委托给 dispatch

`chat()`、`swarm()`、`pipeline()`、`runWorkflow()` 内部调用 `dispatch({ forceLayer: ... })`，然后从 `DispatchResult` 中提取返回值。

**替代方案**：让外部直接调 dispatch()，废弃其他方法。 rejected 因为 chat() 返回 string 而非 DispatchResult，Gateway 全部需要改。

### D2: heartbeat 只包装 chat

chat() 在 dispatch 外面包 withHeartbeat。swarm/pipeline/runWorkflow 不包装。

**理由**：heartbeat 是"对话活跃度检测"，swarm/pipeline 是多步任务执行，有自己的超时机制。

### D3: 删除 sendStream/chatStream

从 ChatCapability 和 Agent 中移除。相关测试同步删除。

**理由**：流式是 UI 层关注点。未来如需流式，应在 Gateway 层（WebSocket SSE）实现，不在 SDK 内部。

### D4: Options 保持分离

DispatchOptions 只管分类+路由。AgentOptions/SwarmOptions/WorkflowOptions 各自透传给对应 Capability。

**理由**：避免 options 合并带来的字段冲突和维护负担。

## Risks / Trade-offs

- **[chat() 多一层调用]** → chat() 原本直接调 ChatCapability.send()，现在经过 Dispatcher 路由。额外开销是 Dispatcher 的 switch 分支，可忽略。
- **[测试减少]** → 删除 sendStream/chatStream 相关测试后，流式能力失去覆盖。但该能力将被移除，不存在风险。
- **[dispatch 错误路径变化]** → 如果 Dispatcher 内部抛异常，chat() 等方法的行为可能变化。需确保 fallback 链（LLM 失败→regex→chat）完整。
