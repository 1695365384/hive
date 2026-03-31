## MODIFIED Requirements

### Requirement: createServer 工厂函数
`createServer()` SHALL 返回一个 `Server` 实例，提供统一的启动、停止和访问接口。Server SHALL 同时管理 `/ws/admin` 和 `/ws/chat` 两个 WebSocket 端点。

```typescript
function createServer(options: ServerOptions): Server

interface ServerOptions {
  config: {
    externalConfig?: ExternalConfig
    plugins?: Array<{ name: string; config: Record<string, unknown> }>
    heartbeat?: HeartbeatConfig
    scheduleEngine?: { onCircuitBreak?: (event: ScheduleCircuitBreakEvent) => void }
    logFile?: { dir?: string; retentionDays?: number }
  }
  dbPath?: string
  bus?: MessageBus
  logger?: ILogger
}
```

#### Scenario: 最小启动（无 dbPath，无 plugins）
- **WHEN** 调用 `createServer({ config: { externalConfig: {...} } })` 并 `start()`
- **THEN** Server SHALL 创建 Agent、初始化、订阅总线事件
- **THEN** 返回的 `agent` 可立即用于 `agent.chat()`

#### Scenario: 完整启动（dbPath + plugins + heartbeat）
- **WHEN** 传入 `dbPath` 和 `plugins` 配置
- **THEN** Server SHALL 创建数据库、ScheduleEngine、加载插件
- **THEN** 如果 heartbeat enabled，HeartbeatScheduler SHALL 用 cron 调度启动

#### Scenario: Server.stop() 清理所有资源
- **WHEN** 调用 `server.stop()`
- **THEN** Server SHALL 停止 HeartbeatScheduler、ScheduleEngine、停用所有插件、销毁 Agent
- **THEN** SHALL 关闭 AdminWsHandler 和 ChatWsHandler 的所有 WS 连接
- **THEN** 所有资源 SHALL 完全释放，不留定时器或订阅

#### Scenario: getChannel 返回已注册的 Channel
- **WHEN** 插件注册了一个 Channel（调用 `registerChannel(channel)`）
- **THEN** `server.getChannel(channel.id)` SHALL 返回该 Channel 实例
- **THEN** `server.getChannel(unknownId)` SHALL 返回 `undefined`

#### Scenario: 配置 logFile 时初始化文件日志
- **WHEN** 调用 `createServer({ config: { logFile: { dir: './logs', retentionDays: 7 } } })`
- **THEN** Server SHALL 创建 FileLogger 实例
- **THEN** `interceptConsole()` SHALL 在捕获日志时同步写入文件

#### Scenario: 未配置 logFile 时不创建 FileLogger
- **WHEN** 调用 `createServer({ config: {} })`
- **THEN** Server SHALL 不创建 FileLogger
- **THEN** 日志仅存在于内存 LogBuffer

#### Scenario: Server.stop() 时关闭 FileLogger
- **WHEN** 调用 `server.stop()` 且 FileLogger 已初始化
- **THEN** Server SHALL 调用 `fileLogger.dispose()` 关闭文件流

#### Scenario: Agent chat 通过 /ws/chat 端点处理
- **WHEN** 客户端通过 `/ws/chat` 端点发送 chat.send 请求
- **THEN** ChatWsHandler SHALL 通过 agent.chat() 执行对话
- **THEN** onReasoning/onText/onToolCall/onToolResult 回调 SHALL 通过定向推送发送到发起请求的客户端

#### Scenario: /ws/admin 和 /ws/chat 端点同时可用
- **WHEN** Server 启动完成
- **THEN** `/ws/admin` SHALL 接受管理协议消息
- **THEN** `/ws/chat` SHALL 接受对话协议消息
- **THEN** 两个端点 SHALL 独立运行，互不影响
