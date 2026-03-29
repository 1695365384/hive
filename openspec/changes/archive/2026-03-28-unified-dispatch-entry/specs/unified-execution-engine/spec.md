## MODIFIED Requirements

### Requirement: 统一子 Agent 执行入口
系统 SHALL 提供唯一的 Agent 执行引擎 `AgentRunner`，所有子 Agent 调用（explore、plan、general、自定义 Agent）MUST 通过 `AgentRunner.execute()` 或其便捷方法执行。系统 MUST NOT 存在其他直接调用 SDK `query()` 的执行路径。

所有高层执行方法（`chat()`、`swarm()`、`pipeline()`、`runWorkflow()`）MUST 内部委托给 `Dispatcher.dispatch()`，通过 `forceLayer` 指定执行层。Dispatcher 是所有执行路径的唯一决策点。

#### Scenario: 通过 Runner 执行 explore Agent
- **WHEN** 调用 `runner.explore(prompt, thoroughness)`
- **THEN** Runner 使用 explore Agent 配置构建 query options，调用 SDK `query()`，返回 `AgentResult`

#### Scenario: 通过 Runner 执行 general Agent
- **WHEN** 调用 `runner.general(prompt, options)`
- **THEN** Runner 使用 general Agent 配置构建 query options，调用 SDK `query()`，返回 `AgentResult`

#### Scenario: chat() 通过 dispatch 执行
- **WHEN** 调用 `agent.chat(prompt, options)`
- **THEN** 内部调用 `dispatch(prompt, { forceLayer: 'chat', cwd: options?.cwd })`，返回 `result.text`

#### Scenario: swarm() 通过 dispatch 执行
- **WHEN** 调用 `agent.swarm(prompt, swarmOptions)`
- **THEN** 内部调用 `dispatch(prompt, { forceLayer: 'swarm', ... })`，返回 `SwarmResult`

#### Scenario: runWorkflow() 通过 dispatch 执行
- **WHEN** 调用 `agent.runWorkflow(prompt, workflowOptions)`
- **THEN** 内部调用 `dispatch(prompt, { forceLayer: 'workflow', ... })`，返回 `WorkflowResult`

## ADDED Requirements

### Requirement: Heartbeat 只保护 Chat 层
`chat()` 方法 SHALL 在 dispatch 调用外层包装 `withHeartbeat`。`swarm()`、`pipeline()`、`runWorkflow()` MUST NOT 包装 heartbeat。

#### Scenario: chat 调用包含 heartbeat
- **WHEN** 调用 `agent.chat(prompt)`
- **THEN** dispatch 返回的 Promise 被 withHeartbeat 包装，具备会话级心跳保护

#### Scenario: swarm 调用不包含 heartbeat
- **WHEN** 调用 `agent.swarm(prompt)`
- **THEN** 直接调用 dispatch，无 heartbeat 包装

### Requirement: 移除流式 API
系统 MUST NOT 包含 `chatStream()` 或 `sendStream()` 方法。流式输出是 UI 层关注点，不属于 SDK 职责。

#### Scenario: Agent 无 chatStream 方法
- **WHEN** 检查 Agent 类公开 API
- **THEN** 不存在 `chatStream` 方法

#### Scenario: ChatCapability 无 sendStream 方法
- **WHEN** 检查 ChatCapability 类
- **THEN** 不存在 `sendStream` 方法

## REMOVED Requirements

### Requirement: Chat 执行委托（流式部分）
**Reason**: 流式 API 移除，ChatCapability 不再需要 sendStream 方法
**Migration**: 如需流式，在 Gateway 层（WebSocket SSE）实现
