## ADDED Requirements

### Requirement: WS admin endpoint
系统 SHALL 在 `/ws/admin` 路径挂载 WebSocket 管理端点，独立于现有 WS 网关。

#### Scenario: Admin WS connection
- **WHEN** 客户端连接 `ws://localhost:4450/ws/admin`
- **THEN** 连接成功，服务端开始监听该连接上的消息

### Requirement: Method routing
WS Handler SHALL 根据 req 消息的 `method` 字段路由到对应的处理函数。

#### Scenario: Unknown method
- **WHEN** 收到未知的 method（如 `foo.bar`）
- **THEN** 返回 `{ success: false, error: { code: 'NOT_FOUND', message: 'Unknown method: foo.bar' } }`

### Requirement: Config handler
WS Handler SHALL 实现 `config.get` 和 `config.update` 方法。

`config.get` SHALL 从内存缓存读取当前配置，`apiKey` 字段脱敏。

`config.update` SHALL 验证参数后写入 `hive.config.json`，更新内存缓存，并推送 `config.changed` 事件。

#### Scenario: Update config writes file
- **WHEN** 收到 `config.update` 请求
- **THEN** 将变更合并写入 `hive.config.json`（保留未修改的字段）
- **THEN** 推送 `event: config.changed`

#### Scenario: Config validation
- **WHEN** `config.update` 的 `provider.apiKey` 为空字符串
- **THEN** 允许写入（用户可能还没配置，后续通过 restart 生效）

### Requirement: Status handler
WS Handler SHALL 实现 `status.get` 方法，返回服务运行状态。

`providerReady` SHALL 通过检查当前活跃 Provider 的 `apiKey` 是否非空来判断。

#### Scenario: Provider ready detection
- **WHEN** 当前活跃 Provider 存在且 apiKey 非空
- **THEN** `status.get` 返回 `agent.providerReady: true`

#### Scenario: No provider configured
- **WHEN** 无活跃 Provider 或 apiKey 为空
- **THEN** `status.get` 返回 `agent.providerReady: false`

### Requirement: Server restart handler
WS Handler SHALL 实现 `server.restart` 方法。

收到请求后 SHALL 先推送 `server.shutting_down` 事件，等待 300ms（确保事件送达），然后执行 `process.exit(0)`。

#### Scenario: Restart sequence
- **WHEN** 收到 `server.restart` 请求
- **THEN** 推送 `event: { event: 'server.shutting_down', data: { reason: 'restart' } }`
- **THEN** 返回 `{ success: true }`
- **THEN** 300ms 后执行 `process.exit(0)`

### Requirement: Plugin management handler
WS Handler SHALL 实现 `plugin.list`、`plugin.install`、`plugin.uninstall`、`plugin.updateConfig` 方法。

`plugin.list` SHALL 返回当前已加载的插件信息（从 Server 实例获取）。

`plugin.install` SHALL 支持三种来源：npm 包名、Git URL、本地路径。

#### Scenario: Install from npm
- **WHEN** source 以 `@hive/` 开头或包含 `/`
- **THEN** 执行 `npm install --production <source>` 到 `.hive/plugins/` 目录
- **THEN** 更新 `hive.config.json` 的 plugins 字段
- **THEN** 推送 `event: plugin.installed`

#### Scenario: Install from git
- **WHEN** source 以 `https://` 或 `git+` 开头
- **THEN** 克隆到临时目录，执行 `npm install --production`，移动到 `.hive/plugins/`
- **THEN** 推送 `event: plugin.installed`

#### Scenario: Install validation
- **WHEN** 安装后的包目录下 `package.json` 不包含 `hive.plugin: true`
- **THEN** 返回错误 `{ code: 'VALIDATION', message: 'Invalid plugin: missing hive.plugin in package.json' }`

### Requirement: Log streaming handler
WS Handler SHALL 维护一个固定大小的环形日志缓冲区（默认 10000 条）。

所有 console.log/warn/error 输出 SHALL 被拦截并存入缓冲区。

`log.subscribe` SHALL 将该连接加入日志推送列表，后续日志作为 event 推送。

`log.unsubscribe` SHALL 将该连接从推送列表移除。

连接断开时 SHALL 自动移除。

#### Scenario: Console interception
- **WHEN** 服务运行过程中调用 `console.info('[server] Started')`
- **THEN** 该日志被存入缓冲区，如果该连接已 subscribe 则同时推送

#### Scenario: Buffer overflow
- **WHEN** 缓冲区已满（10000 条）
- **THEN** 最旧的日志被淘汰

#### Scenario: Auto unsubscribe on disconnect
- **WHEN** WS 连接断开
- **THEN** 该连接从日志推送列表中自动移除

### Requirement: Log history query
`log.getHistory` SHALL 支持按 level、source、关键词过滤，支持分页。

#### Scenario: Filter by level
- **WHEN** params 包含 `{ level: 'error' }`
- **THEN** 仅返回 error 级别的日志

#### Scenario: Keyword search
- **WHEN** params 包含 `{ query: 'failed' }`
- **THEN** 仅返回 message 包含 'failed' 的日志

### Requirement: Session handler
WS Handler SHALL 实现 `session.list`、`session.get`、`session.delete` 方法。

`session.get` SHALL 从 SessionCapability 获取会话详情。

`session.delete` SHALL 删除指定会话。

#### Scenario: Delete session
- **WHEN** 收到 `session.delete` 请求
- **THEN** 从 SessionCapability 中删除该会话
- **THEN** 返回 `{ success: true }`
