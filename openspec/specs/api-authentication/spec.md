## ADDED Requirements

### Requirement: API Key 认证中间件
HTTP 和 WebSocket 端点 SHALL 要求客户端通过 `Authorization: Bearer <apiKey>` Header 或 `?apiKey=<key>` Query Param 提供有效的 API Key。无效或缺失 Key SHALL 返回 401 响应。

#### Scenario: 有效 Bearer Token 通过认证
- **WHEN** 客户端发送请求，Header 包含 `Authorization: Bearer <validKey>`
- **THEN** 请求 SHALL 正常处理

#### Scenario: 有效 Query Param 通过认证
- **WHEN** 客户端发送请求，URL 包含 `?apiKey=<validKey>`
- **THEN** 请求 SHALL 正常处理

#### Scenario: 缺失 API Key
- **WHEN** 客户端发送请求，未携带任何认证信息
- **THEN** 服务端 SHALL 返回 HTTP 401
- **THEN** 响应体 SHALL 包含 `{ error: 'Missing API key' }`

#### Scenario: 无效 API Key
- **WHEN** 客户端发送请求，携带错误的 API Key
- **THEN** 服务端 SHALL 返回 HTTP 401
- **THEN** 响应体 SHALL 包含 `{ error: 'Invalid API key' }`

#### Scenario: 认证可通过配置禁用
- **WHEN** 配置中 `auth.enabled` 设为 `false`
- **THEN** 所有端点 SHALL 跳过认证检查
- **THEN** 请求 SHALL 正常处理

### Requirement: WebSocket 握手认证
WebSocket 升级请求 SHALL 在握手阶段验证 API Key（通过 Query Param）。

#### Scenario: WebSocket 携带有效 Key
- **WHEN** 客户端发起 WebSocket 连接 `ws://host/ws?apiKey=<validKey>`
- **THEN** 连接 SHALL 成功升级

#### Scenario: WebSocket 缺失 Key
- **WHEN** 客户端发起 WebSocket 连接，未携带 apiKey
- **THEN** 服务端 SHALL 返回 HTTP 401 并拒绝升级
