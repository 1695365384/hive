## ADDED Requirements

### Requirement: createServer 工厂函数
`createServer()` SHALL 返回一个 `Server` 实例，提供统一的启动、停止和访问接口。

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

interface Server {
  readonly agent: Agent
  readonly bus: MessageBus
  readonly logger: ILogger
  start(): Promise<void>
  stop(): Promise<void>
  getChannel(id: string): IChannel | undefined
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

#### Scenario: Agent chat 回调通过 WS event 推送
- **WHEN** AdminWsHandler 接收到 chat.send 请求
- **THEN** Server SHALL 通过 agent.chat() 执行对话
- **THEN** onReasoning/onText/onToolCall/onToolResult 回调 SHALL 通过 broadcastEvent 推送 agent.* WS event

### Requirement: Server 内部 ChannelContext 管理
Server SHALL 在内部维护一个 Channel 注册表，允许通过 `registerChannel()` 注册 Channel 实例。

```typescript
interface Server {
  registerChannel(channel: IChannel): void
}
```

#### Scenario: 插件注册 Channel
- **WHEN** 插件调用 `server.registerChannel(channel)`
- **THEN** Server SHALL 将该 Channel 存入内部注册表
- **THEN** 后续 `server.getChannel(id)` 可找到该 Channel

#### Scenario: Channel 自动用于消息推送
- **WHEN** Agent 处理消息并产生响应
- **THEN** Server SHALL 通过内部订阅 `message:response` 事件
- **THEN** Server SHALL 根据响应的 `channelId` 查找对应 Channel 并调用 `channel.send()`

### Requirement: 定时任务引擎内嵌
当 `dbPath` 提供时，Server SHALL 在内部创建和管理 `ScheduleEngine`，无需外部调用 `setDependencies()`。

#### Scenario: ScheduleEngine 由 Server 自动初始化
- **WHEN** `createServer({ dbPath: '/path/to/hive.db' })`
- **THEN** Server SHALL 创建 DatabaseManager、ScheduleRepository、ScheduleEngine
- **THEN** Server SHALL 调用 `agent.schedule.setDependencies(repository, engine)`
- **THEN** `engine.start()` SHALL 在 `server.start()` 中被调用

#### Scenario: 定时任务触发后自动推送结果
- **WHEN** ScheduleEngine 触发任务完成事件 `schedule:completed`
- **THEN** Server SHALL 通过 `resolveNotifyTarget` 找到目标 Channel
- **THEN** Server SHALL 调用 `channel.send()` 将结果推送给用户

### Requirement: HeartbeatScheduler 使用 cron 持久化调度
当 `config.heartbeat.enabled` 为 true 时，Server SHALL 启动 `HeartbeatScheduler`，其内部使用 `node-cron` 而非 `setInterval`。

#### Scenario: 心跳调度使用 cron
- **WHEN** `config.heartbeat.intervalMs` 为 300000（5 分钟）
- **THEN** HeartbeatScheduler SHALL 使用 cron 表达式 `*/5 * * * *` 注册调度
- **THEN** 应用重启后心跳调度自动恢复

### Requirement: 向后兼容 createAgent()
`createAgent()` SHALL 继续正常工作，不因引入 `createServer()` 而受影响。

#### Scenario: createAgent 不加载 Server 特性
- **WHEN** 调用 `createAgent({ externalConfig: {...} })`
- **THEN** 返回的 Agent SHALL 不包含定时任务引擎、插件加载、Channel 注册表
- **THEN** Agent 的 `schedule` capability SHALL 工作但 repository/engine 为 undefined（除非手动 setDependencies）
