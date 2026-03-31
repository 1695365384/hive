## MODIFIED Requirements

### Requirement: HandlerContext 依赖注入
系统 SHALL 定义 `HandlerContext` 接口，封装所有 Domain Handler 的共享依赖。每个 Domain Handler 通过构造函数接收 `HandlerContext`。

```typescript
interface HandlerContext {
  broadcastEvent(event: string, data: unknown): void
  loadConfig(): ServerConfig
  saveConfig(config: ServerConfig): void
  getServer(): Server | null
  getLogBuffer(): LogBuffer
  getHiveLogger(): HiveLogger | null
  getClients(): Set<AdminClient>
}
```

#### Scenario: Domain Handler 通过 ctx 访问共享依赖
- **WHEN** `ConfigHandler.handleConfigGet()` 需要读取配置
- **THEN** SHALL 调用 `this.ctx.loadConfig()` 获取配置
- **THEN** SHALL NOT 直接访问文件系统或其他 Handler 的内部状态

#### Scenario: 测试时 mock HandlerContext
- **WHEN** 编写 `ConfigHandler` 单元测试
- **THEN** SHALL 仅需 mock `HandlerContext` 接口，无需 mock 整个 AdminWsHandler

#### Scenario: AdminWsHandler 接收注入的 HiveLogger
- **WHEN** AdminWsHandler 构造函数被调用
- **THEN** SHALL 接收外部传入的 HiveLogger 实例
- **THEN** SHALL NOT 内部创建 HiveLogger
- **THEN** SHALL NOT 调用 `overrideConsole()`

#### Scenario: ChatWsHandler 接收注入的 HiveLogger
- **WHEN** ChatWsHandler 构造函数被调用
- **THEN** SHALL 接收外部传入的 HiveLogger 实例
- **THEN** SHALL NOT 内部创建 HiveLogger
- **THEN** SHALL NOT 调用 `overrideConsole()`
