## Context

`AdminWsHandler` 是 `/ws/admin` 端点的唯一处理器，953 行代码包含 22 个消息处理器、WS 连接管理、Agent Hook 订阅、事件广播、配置读写、插件生命周期管理等 8+ 种职责。测试文件也因此膨胀到 1052 行。

当前代码组织：所有 handler 是 `AdminWsHandler` 的 private 方法，通过 `Map<string, MethodHandler>` 路由。每个 handler 直接访问类属性（`this.server`, `this.logBuffer`, `this.hiveLogger` 等），形成隐式依赖。

## Goals / Non-Goals

**Goals:**
- 按域拆分为独立的 Handler 类，每个类 < 200 行
- AdminWsHandler 瘦身为 ~200 行的薄 Router
- Chat 独立为 `/ws/chat` 端点，与管理接口完全解耦
- 每个 Handler 可独立测试，减少 mock 面积

**Non-Goals:**
- 不引入 middleware/interceptor 链（那是方案 B，当前不需要）
- 不修改 WS 协议格式（req/res/event 结构不变）
- 不重构 `types.ts`、`data-types.ts`、`log-buffer.ts`
- 不修改 handler 的业务逻辑，仅做结构拆分

## Decisions

### D1: 抽象基类 WsDomainHandler + HandlerContext 注入

**选择**: 定义 `abstract class WsDomainHandler`，子类通过 `register()` 方法返回自己的 handler map。共享依赖通过 `HandlerContext` 对象注入。

**替代方案**:
- 直接函数式注册（每个 handler 是独立函数）：丢失了 OOP 封装，无法持有状态
- 接口 + 组合（implements IHandler）：过度设计，TypeScript abstract class 更直接

**理由**: abstract class 天然表达 "域 handler 有共同接口但各自实现" 的语义，register() 返回 Map 与现有路由方式完全兼容。

### D2: HandlerContext 作为构造参数

**选择**: 每个 Domain Handler 构造函数接收 `HandlerContext` 对象。

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

**理由**: Context 对象让依赖关系显式化，测试时可以轻松 mock 整个 context。

### D3: Chat 独立端点

**选择**: 新建 `ChatWsHandler` 类，挂载到 `/ws/chat` 路径。

**替代方案**: Chat 作为独立 Domain Handler 但仍在 `/ws/admin` 路由下。

**理由**: Chat 是面向终端用户的功能，生命周期（threadId 管理、fire-and-forget、流式推送）与管理接口完全不同。独立端点也便于未来独立鉴权和限流。

### D4: reloadPlugin 归属 PluginHandler

**选择**: `reloadPlugin` 移入 `PluginHandler`，通过 HandlerContext 获取 `server` 实例和 `pluginInstances`。

**理由**: reloadPlugin 仅被 `plugin.updateConfig` 使用，与插件生命周期强相关。

### D5: 文件组织

```
apps/server/src/gateway/ws/
├── admin-handler.ts       # Router + 生命周期（~200 行）
├── chat-handler.ts        # 独立 /ws/chat 端点
├── handler-context.ts     # HandlerContext 定义
├── handlers/
│   ├── index.ts           # 注册所有 domain handlers
│   ├── base.ts            # WsDomainHandler 抽象基类
│   ├── config-handler.ts
│   ├── status-handler.ts
│   ├── plugin-handler.ts
│   ├── log-handler.ts
│   └── session-handler.ts
├── types.ts               # 不变
├── data-types.ts          # 不变
└── log-buffer.ts          # 不变
```

## Risks / Trade-offs

- **前端适配成本**: Chat 连接地址从 `/ws/admin` 改为 `/ws/chat`，前端需要同步更新 → 影响可控，仅改一处连接地址
- **重构过程中的行为回归**: 22 个 handler 的业务逻辑迁移可能引入 bug → 现有测试覆盖充分，重构后逐个验证
- **HandlerContext 过胖**: 共享方法可能越来越多 → 初期严格控制，只放真正共享的依赖
