## ADDED Requirements

### Requirement: chat.send WS 方法触发 Agent 执行
Server SHALL 提供 chat.send WS 方法，接收 prompt 并异步执行 Agent chat。

#### Scenario: 正常发送对话
- **WHEN** 客户端发送 chat.send 请求
- **THEN** Server SHALL 立即返回 { threadId }
- **THEN** Server SHALL 异步调用 agent.chat() 并通过 WS event 流式推送

#### Scenario: Agent 未初始化时拒绝
- **WHEN** Agent 未初始化
- **THEN** Server SHALL 返回 AGENT_NOT_READY 错误

### Requirement: Agent 执行事件通过 WS event 推送
Server SHALL 推送 agent.reasoning / agent.text-delta / agent.tool-call / agent.tool-result / agent.complete 事件。

#### Scenario: 推送 reasoning 事件
- **WHEN** onReasoning 回调触发
- **THEN** SHALL broadcast agent.reasoning { threadId, text }

#### Scenario: 推送 text-delta 事件
- **WHEN** onText 回调触发
- **THEN** SHALL broadcast agent.text-delta { threadId, text }

#### Scenario: 推送 tool-call / tool-result 事件
- **WHEN** onToolCall / onToolResult 回调触发
- **THEN** SHALL broadcast 对应事件（含 toolCallId）

#### Scenario: 推送 complete 事件
- **WHEN** Agent 执行完成
- **THEN** SHALL broadcast agent.complete { threadId, success, error? }

### Requirement: toolCallId 一致性
同一工具调用的 call 和 result SHALL 使用相同的 toolCallId。
