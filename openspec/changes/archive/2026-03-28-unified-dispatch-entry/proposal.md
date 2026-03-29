## Why

当前 Agent 有多个执行入口（chat / runWorkflow / swarm / pipeline），外部调用者需要自行选择调用哪个方法。新增的 Dispatcher 提供了 LLM 智能分类+路由能力，但 chat/swarm/pipeline/runWorkflow 仍是独立路径，内部逻辑重复且调用方需要了解执行层细节。需要统一所有执行路径，让 Dispatcher 成为唯一决策点。

同时，chatStream/sendStream 属于 UI 层关注点，不应存在于 SDK 中，需要一并删除。

## What Changes

- **Agent 方法内部统一走 dispatch**：`chat()`、`swarm()`、`pipeline()`、`runWorkflow()` 内部委托给 `dispatch({ forceLayer: ... })`，不再直接调用对应 Capability
- **heartbeat 只包装 chat 层**：`chat()` 调用 `dispatch()` 后包 `withHeartbeat`；swarm/pipeline/runWorkflow 不包装 heartbeat（它们有自己的执行超时机制）
- **删除流式 API**：移除 `chatStream()`、`sendStream()` 及相关测试
- **DispatchOptions 保持独立**：不与 AgentOptions/SwarmOptions 合并，各层 options 各管各的

## Capabilities

### New Capabilities

无新 capability。

### Modified Capabilities

- `unified-execution-engine`: Agent 公开 API 从多入口改为统一走 Dispatcher 路由；删除流式 API

## Impact

- **Agent.ts**：chat/swarm/pipeline/runWorkflow 改为 dispatch 代理；删除 chatStream
- **ChatCapability.ts**：删除 sendStream 方法
- **heartbeat-wrapper.ts**：简化，移除 stream 分支
- **测试**：删除 chatStream/sendStream 相关测试（with-heartbeat、chat-capability、e2e）
- **CLI**：删除 chatStream 调用分支
- **Gateway（HTTP/WS）**：无变化（调 chat()，chat() 内部走 dispatch）
- **Breaking**：chatStream/sendStream API 移除
