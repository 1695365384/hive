## ADDED Requirements

### Requirement: WsDomainHandler 抽象基类
系统 SHALL 提供 `WsDomainHandler` 抽象基类，所有域 Handler MUST 继承此类。基类定义 `register()` 方法，返回 `Map<string, MethodHandler>`。

```typescript
abstract class WsDomainHandler {
  protected ctx: HandlerContext

  constructor(ctx: HandlerContext)

  abstract register(): Map<string, MethodHandler>
}
```

#### Scenario: 子类实现 register()
- **WHEN** 创建 `ConfigHandler` 继承 `WsDomainHandler`
- **THEN** `register()` SHALL 返回包含 `config.get`、`config.update`、`config.getProviderPresets` 的 Map

#### Scenario: Router 遍历所有 domain handler 注册
- **WHEN** AdminWsHandler 初始化
- **THEN** SHALL 遍历所有 Domain Handler 实例，调用 `register()` 合并到全局 handlers Map

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

### Requirement: Domain Handler 拆分清单
AdminWsHandler 中的 21 个管理 handler SHALL 拆分为 5 个独立 Domain Handler 类：

| Handler | 前缀 | 方法数 |
|---------|------|--------|
| ConfigHandler | `config.*` | 3 |
| StatusHandler | `status.*`, `server.*`, `provider.*` | 5 |
| PluginHandler | `plugin.*` | 5 |
| LogHandler | `log.*` | 5 |
| SessionHandler | `session.*` | 3 |

#### Scenario: 每个文件独立且职责单一
- **WHEN** 查看任意 Domain Handler 文件
- **THEN** 文件行数 SHALL 不超过 200 行
- **THEN** 文件 SHALL 只导入自己域相关的依赖

#### Scenario: reloadPlugin 归属 PluginHandler
- **WHEN** `plugin.updateConfig` 调用需要重新加载插件
- **THEN** `reloadPlugin` SHALL 定义在 `PluginHandler` 内部
- **THEN** PluginHandler SHALL 通过 `HandlerContext.getServer()` 获取所需依赖

### Requirement: AdminWsHandler 瘦身为 Router
重构后的 `AdminWsHandler` SHALL 仅负责 WS 连接管理、消息路由和生命周期管理，SHALL NOT 包含任何业务逻辑。

#### Scenario: AdminWsHandler 不超过 200 行
- **WHEN** 重构完成
- **THEN** `admin-handler.ts` SHALL 不超过 200 行（不含空行和注释）

#### Scenario: 连接管理保留在 AdminWsHandler
- **WHEN** 新的 WS 连接建立
- **THEN** `AdminWsHandler.handleConnection()` SHALL 管理连接生命周期
- **THEN** `AdminWsHandler.closeAll()` SHALL 关闭所有连接并清理资源
