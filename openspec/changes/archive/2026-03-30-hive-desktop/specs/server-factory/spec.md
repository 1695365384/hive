## MODIFIED Requirements

### Requirement: Server startup
Server 的 `start()` 方法 SHALL 在初始化完成后挂载 `/ws/admin` WebSocket 管理端点。

#### Scenario: Admin WS endpoint available after start
- **WHEN** `server.start()` 完成
- **THEN** `ws://localhost:<port>/ws/admin` 可连接
- **THEN** 连接后可发送管理协议消息

### Requirement: Graceful shutdown
Server 的 `stop()` 方法 SHALL 在关闭前推送 `server.shutting_down` 事件到所有已连接的 admin WS 客户端。

#### Scenario: Shutdown event broadcast
- **WHEN** `server.stop()` 被调用
- **THEN** 所有 `/ws/admin` 连接收到 `event: server.shutting_down`
- **THEN** 等待 300ms 后关闭 WS 连接和 HTTP 服务器
