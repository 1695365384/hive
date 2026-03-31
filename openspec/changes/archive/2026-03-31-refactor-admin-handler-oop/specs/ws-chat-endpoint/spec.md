## ADDED Requirements

### Requirement: ChatWsHandler 独立端点
系统 SHALL 提供独立的 `ChatWsHandler` 类，挂载到 `/ws/chat` WebSocket 端点。ChatWsHandler SHALL 完全独立于 AdminWsHandler。

```typescript
class ChatWsHandler extends EventEmitter {
  handleConnection(ws: WebSocket): void
  closeAll(): Promise<void>
}
```

#### Scenario: /ws/chat 端点独立运行
- **WHEN** 客户端连接 `/ws/chat`
- **THEN** SHALL 由 `ChatWsHandler` 处理连接，而非 AdminWsHandler
- **THEN** `/ws/admin` 端点 SHALL 不再接受 `chat.send` 消息

### Requirement: chat.send 方法
`ChatWsHandler` SHALL 接受 `chat.send` 消息，立即返回 threadId，异步执行 Agent 对话。

#### Scenario: 成功发送对话
- **WHEN** 客户端发送 `{ type: "req", method: "chat.send", params: { prompt: "hello" } }`
- **THEN** SHALL 立即返回 `{ type: "res", result: { threadId: "<uuid>" } }`
- **THEN** SHALL 异步执行 Agent 对话，不阻塞响应

#### Scenario: 指定 threadId
- **WHEN** 客户端发送 `chat.send` 并携带 `threadId`
- **THEN** SHALL 使用客户端提供的 threadId

#### Scenario: 缺少 prompt 参数
- **WHEN** 客户端发送 `chat.send` 但未提供 prompt
- **THEN** SHALL 返回错误响应，error code 为 `VALIDATION`

### Requirement: Agent 对话事件流式推送
`ChatWsHandler` SHALL 在 Agent 对话过程中向发起请求的客户端定向推送事件。

#### Scenario: 推送 agent.start 事件
- **WHEN** Agent 对话开始
- **THEN** SHALL 向发起请求的客户端推送 `{ type: "event", event: "agent.start", data: { threadId, agentType: "general" } }`

#### Scenario: 推送 agent.text-delta 事件
- **WHEN** Agent 产生文本输出
- **THEN** SHALL 推送 `agent.text-delta` 事件到对应 threadId 的客户端

#### Scenario: 推送 agent.tool-call 和 agent.tool-result 事件
- **WHEN** Agent 调用工具
- **THEN** SHALL 先推送 `agent.tool-call`，工具执行后再推送 `agent.tool-result`

#### Scenario: 推送 agent.complete 事件
- **WHEN** Agent 对话完成
- **THEN** SHALL 推送 `agent.complete` 事件
- **THEN** SHALL 清理 threadId → WebSocket 映射

#### Scenario: 客户端断连时 fallback 广播
- **WHEN** Agent 对话进行中客户端断开连接
- **THEN** SHALL fallback 到广播方式推送事件

### Requirement: threadId 客户端映射管理
`ChatWsHandler` SHALL 维护 threadId → WebSocket 映射，支持定向事件推送。

#### Scenario: 连接关闭时清理映射
- **WHEN** 客户端 WS 连接关闭
- **THEN** SHALL 删除该客户端所有 threadId 映射

### Requirement: Agent Hook 订阅
`ChatWsHandler` SHALL 订阅 Agent Hook 事件（agent:thinking、task:progress、tool:before、tool:after、timeout:api），通过 pino logger 统一分发。

#### Scenario: Hook 事件写入日志
- **WHEN** Agent 触发 `tool:before` Hook
- **THEN** SHALL 通过 HiveLogger 记录日志
- **THEN** 日志 SHALL 推送给已订阅日志的 admin 客户端

#### Scenario: ChatWsHandler 销毁时清理 Hook
- **WHEN** 调用 `ChatWsHandler.closeAll()`
- **THEN** SHALL 取消所有 Agent Hook 订阅
