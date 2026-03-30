## ADDED Requirements

### Requirement: Message format
所有 WS 消息 SHALL 使用统一 JSON 格式，包含 `id`（UUID）、`type`、`timestamp` 字段。

#### Scenario: Valid request message
- **WHEN** 前端发送请求
- **THEN** 消息格式为 `{ id: string, type: 'req', method: string, params?: unknown, timestamp: number }`

#### Scenario: Valid response message
- **WHEN** 后端响应请求
- **THEN** 成功时格式为 `{ id: string, type: 'res', success: true, result: unknown, timestamp: number }`
- **THEN** 失败时格式为 `{ id: string, type: 'res', success: false, error: { code: string, message: string }, timestamp: number }`

#### Scenario: Valid event message
- **WHEN** 后端主动推送
- **THEN** 消息格式为 `{ id: string, type: 'event', event: string, data: unknown, timestamp: number }`

### Requirement: Request-response correlation
每个 req 消息的 `id` SHALL 唯一标识一次请求，res 消息的 `id` MUST 匹配对应 req 的 `id`。

#### Scenario: Response matches request
- **WHEN** 前端发送 `{ id: 'abc', method: 'config.get' }`
- **THEN** 后端响应的 `id` SHALL 为 `'abc'`

### Requirement: Timeout handling
前端 SHALL 对每个未响应的 req 设置 30 秒超时，超时后触发本地错误回调。

#### Scenario: Request timeout
- **WHEN** 前端发送 req 后 30 秒内未收到匹配的 res
- **THEN** 前端 SHALL 触发超时错误回调 `{ code: 'TIMEOUT', message: 'Request timed out' }`

### Requirement: Error codes
错误响应 SHALL 使用标准错误码：`NOT_FOUND`、`VALIDATION`、`INTERNAL`、`TIMEOUT`、`UNAUTHORIZED`。

#### Scenario: Validation error
- **WHEN** 请求参数不合法（如缺少必填字段）
- **THEN** 响应 `{ success: false, error: { code: 'VALIDATION', message: '...' } }`

### Requirement: Config methods
系统 SHALL 提供以下配置方法：

| 方法 | 参数 | 返回 |
|------|------|------|
| `config.get` | 无 | `ServerConfig` |
| `config.update` | `ConfigUpdateParams` | `{ success: true }` |
| `config.getProviderPresets` | 无 | `ProviderPresetInfo[]` |

#### Scenario: Get current config
- **WHEN** 前端发送 `{ method: 'config.get' }`
- **THEN** 后端返回当前配置，`apiKey` 字段脱敏为 `'***xxx'`（仅显示后 3 位）

#### Scenario: Update provider config
- **WHEN** 前端发送 `{ method: 'config.update', params: { provider: { id: 'glm', apiKey: 'sk-xxx' } } }`
- **THEN** 后端写入 `hive.config.json`，返回 `{ success: true }`

### Requirement: Server methods
系统 SHALL 提供以下服务管理方法：

| 方法 | 参数 | 返回 |
|------|------|------|
| `status.get` | 无 | `ServerStatus` |
| `server.restart` | 无 | `{ success: true }` |
| `server.getProviders` | 无 | `ProviderConfig[]` |

#### Scenario: Get server status
- **WHEN** 前端发送 `{ method: 'status.get' }`
- **THEN** 后端返回 `{ server: { state, port, uptime, version }, agent: { initialized, providerReady, currentProvider, activePlugins }, system: { memory, nodeVersion, platform } }`

#### Scenario: Provider ready detection
- **WHEN** 当前活跃 Provider 的 apiKey 为空
- **THEN** `status.get` 返回 `agent.providerReady: false`

#### Scenario: Restart server
- **WHEN** 前端发送 `{ method: 'server.restart' }`
- **THEN** 后端先推送 `event: server.shutting_down`，然后 `process.exit(0)`
- **THEN** 返回 `{ success: true }` 后进程退出

### Requirement: Plugin methods
系统 SHALL 提供以下插件管理方法：

| 方法 | 参数 | 返回 |
|------|------|------|
| `plugin.list` | 无 | `PluginInfo[]` |
| `plugin.install` | `{ source: string }` | `PluginInfo` |
| `plugin.uninstall` | `{ id: string }` | `{ success: true }` |
| `plugin.updateConfig` | `{ id: string, config: Record<string, unknown> }` | `{ success: true }` |

#### Scenario: List installed plugins
- **WHEN** 前端发送 `{ method: 'plugin.list' }`
- **THEN** 返回已安装插件列表，包含 id、name、version、enabled、channels

#### Scenario: Install plugin from npm
- **WHEN** 前端发送 `{ method: 'plugin.install', params: { source: '@bundy-lmw/hive-plugin-feishu' } }`
- **THEN** 后端执行 `npm install` 到 `.hive/plugins/`，更新 `hive.config.json`
- **THEN** 返回安装后的 `PluginInfo`

#### Scenario: Install plugin failure
- **WHEN** npm install 失败
- **THEN** 返回 `{ success: false, error: { code: 'INTERNAL', message: 'npm install failed: ...' } }`

### Requirement: Log methods
系统 SHALL 提供以下日志方法：

| 方法 | 参数 | 返回 |
|------|------|------|
| `log.getHistory` | `{ level?, source?, query?, limit?, offset? }` | `LogEntry[]` |
| `log.subscribe` | 无 | `{ success: true }`（开启日志事件推送） |
| `log.unsubscribe` | 无 | `{ success: true }`（关闭日志事件推送） |

#### Scenario: Get log history
- **WHEN** 前端发送 `{ method: 'log.getHistory', params: { level: 'error', limit: 50 } }`
- **THEN** 返回最近 50 条 error 级别的日志

#### Scenario: Subscribe to live logs
- **WHEN** 前端发送 `{ method: 'log.subscribe' }`
- **THEN** 后端开始推送 `event: log` 消息，每条包含 `{ level, source, message, timestamp }`

#### Scenario: Unsubscribe from logs
- **WHEN** 前端发送 `{ method: 'log.unsubscribe' }`
- **THEN** 后端停止推送 `event: log` 消息

### Requirement: Session methods
系统 SHALL 提供以下会话方法：

| 方法 | 参数 | 返回 |
|------|------|------|
| `session.list` | 无 | `SessionSummary[]` |
| `session.get` | `{ id: string }` | `SessionDetail` |
| `session.delete` | `{ id: string }` | `{ success: true }` |

#### Scenario: List sessions
- **WHEN** 前端发送 `{ method: 'session.list' }`
- **THEN** 返回会话摘要列表

### Requirement: Server events
系统 SHALL 在以下时机推送事件：

| 事件名 | 数据 | 时机 |
|--------|------|------|
| `server.shutting_down` | `{ reason: string }` | 进程退出前 |
| `log` | `LogEntry` | 有新日志产生（需 subscribe） |
| `plugin.installed` | `{ id, name, version }` | 插件安装成功 |
| `plugin.uninstalled` | `{ id }` | 插件卸载成功 |
| `config.changed` | `{ keys: string[] }` | 配置文件变更 |

#### Scenario: Shutdown event before exit
- **WHEN** 收到 `server.restart` 请求
- **THEN** 先推送 `event: server.shutting_down`，再执行 `process.exit(0)`

#### Scenario: Log event subscription
- **WHEN** 客户端发送 `log.subscribe`
- **THEN** 后续产生的每条日志 SHALL 作为 `event: log` 推送给该客户端

### Requirement: Data structure definitions
系统 SHALL 使用以下数据结构：

**ServerConfig**: `{ server: { port, host, logLevel }, auth: { enabled, apiKey }, provider: { id, apiKey, model? }, heartbeat: { enabled, intervalMs, model? } }`

**ServerStatus**: `{ server: { state, port, uptime, version }, agent: { initialized, providerReady, currentProvider, activePlugins }, system: { memory: { rss, heapUsed, heapTotal }, nodeVersion, platform } }`

**ProviderPresetInfo**: `{ id, name, type, defaultModel?, models?: ModelSummary[] }`

**ModelSummary**: `{ id, name, contextWindow, supportsVision?, supportsTools? }`

**PluginInfo**: `{ id, name, version, description?, enabled, channels?, config? }`

**LogEntry**: `{ id, level, source, message, timestamp }`

**SessionSummary**: `{ id, messageCount, createdAt, lastActiveAt }`

**SessionDetail**: `{ id, messages: Array<{ role, content, timestamp }> }`

#### Scenario: Type consistency
- **WHEN** 后端返回数据
- **THEN** 数据结构 SHALL 与上述定义一致
