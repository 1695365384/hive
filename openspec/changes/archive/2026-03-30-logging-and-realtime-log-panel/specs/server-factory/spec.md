## MODIFIED Requirements

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
    logFile?: { dir?: string; retentionDays?: number }  // 新增：日志文件配置
  }
  dbPath?: string
  bus?: MessageBus
  logger?: ILogger
}
```

#### Scenario: 启用时自动初始化 FileLogger
- **WHEN** 调用 `createServer({ config: { logFile: { dir: './logs', retentionDays: 7 } } })`
- **THEN** Server SHALL 创建 FileLogger 实例
- **THEN** `interceptConsole()` SHALL 在捕获日志时同步写入文件

#### Scenario: 未配置 logFile 时不创建 FileLogger
- **WHEN** 调用 `createServer({ config: {} })`
- **THEN** Server SHALL 不创建 FileLogger
- **THEN** 日志仅存在于内存 LogBuffer

#### Scenario: Server.stop() 时关闭 FileLogger
- **WHEN** 调用 `server.stop()`
- **THEN** Server SHALL 调用 `fileLogger.dispose()` 关闭文件流
