## MODIFIED Requirements

### Requirement: createServer 工厂函数
`createServer()` SHALL 返回一个 Server 实例。

#### Scenario: Agent chat 回调通过 WS event 推送
- **WHEN** AdminWsHandler 接收到 chat.send 请求
- **THEN** Server SHALL 通过 agent.chat() 执行对话
- **THEN** onReasoning/onText/onToolCall/onToolResult 回调 SHALL 通过 broadcastEvent 推送 agent.* WS event
