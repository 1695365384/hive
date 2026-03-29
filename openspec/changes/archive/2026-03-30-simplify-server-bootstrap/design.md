## Context

当前 `apps/server/bootstrap.ts` 509 行，手动编排了太多 SDK 本该内置的逻辑。同时 `@hive/orchestrator` 包包含 `PluginHost`、`Scheduler`、`AgentPool` 等废弃代码，只剩 `MessageBus` 一个有用的类还在被使用。

**现状:**
- `bootstrap.ts` 承担了：插件加载、数据库初始化、定时任务引擎 + setDependencies、心跳调度、Channel 注册表管理、消息总线订阅编排
- `@hive/orchestrator` 被 `apps/server` 仅引用了 `MessageBus`，其余全部未使用
- `HeartbeatScheduler` 使用 `setInterval`，应用重启后心跳状态丢失

**约束:**
- 保持向后兼容：`createAgent()` 仍然可用，Server 特性是可选的
- Feishu 等插件使用 `@hive/core` 的 `IPlugin` 接口，不依赖 `orchestrator.PluginHost`
- 定时任务的 every/at 模式刚改为 cron 实现，行为不变

## Goals / Non-Goals

**Goals:**
- 将 `MessageBus` 迁移到 `@hive/core`，删除 `@hive/orchestrator`
- 将 bootstrap 的编排逻辑收拢为 `createServer()` 工厂
- `apps/server/bootstrap.ts` 瘦到 ~50 行
- `HeartbeatScheduler` 改用 cron 持久化调度

**Non-Goals:**
- 不重构 `Agent` 类的"能力委托"架构
- 不引入多 Agent 调度（Scheduler 的场景）
- 不改变 `IPlugin` / `IChannel` 接口
- 不改变定时任务的外部行为（刚修复过的 every/at cron 实现保持不变）

## Decisions

### Decision 1: `MessageBus` 迁移到 `@hive/core/src/bus/`

**选择:** 直接迁移文件，不做接口包装。

**理由:** `MessageBus` 是纯内存事件总线，无外部依赖，迁移成本低。直接移动代码而非新建 wrapper，避免不必要的间接层。

**实现:**
```
packages/orchestrator/src/bus/MessageBus.ts  →  packages/core/src/bus/MessageBus.ts
packages/orchestrator/src/bus/types.ts         →  packages/core/src/bus/types.ts
packages/orchestrator/src/index.ts             →  重写为只导出 MessageBus
packages/orchestrator/src/plugins/             →  删除
packages/orchestrator/src/scheduler/           →  删除
packages/orchestrator/tests/                   →  只保留 bus 测试，其他删除
```

**替代方案:** 保留 `@hive/orchestrator` 包但清空其他内容。**否决**——一个包只放一个类不合理，且增加了维护负担。

---

### Decision 2: 删除 `@hive/orchestrator` 包

**选择:** 直接删除整个包，从 `apps/server` 的 `package.json` 移除依赖。

**理由:** `PluginHost` 和 `Scheduler` 是旧设计遗留，从未在当前代码路径中被使用。`MessageBus` 迁走后无留存理由。

**注意:** `apps/server` 和 `apps/cli` 的 import 路径从 `from '@hive/orchestrator'` 改为 `from '@hive/core'`。

---

### Decision 3: `createServer()` 工厂设计

**选择:** 新增 `packages/core/src/server/Server.ts`，`createServer()` 返回带 `start()/stop()` 的 Server 实例。

**接口:**
```typescript
// packages/core/src/server/types.ts
export interface ServerOptions {
  config: ExternalConfig & {
    plugins?: Array<{ name: string; config: Record<string, unknown> }>
    heartbeat?: HeartbeatConfig
    scheduleEngine?: { onCircuitBreak?: (event: ScheduleCircuitBreakEvent) => void }
  }
  dbPath?: string
  bus?: MessageBus          // 可选，传入已有实例或新建
  logger?: ILogger           // 可选，默认 console logger
}

export interface Server {
  readonly agent: Agent
  readonly bus: MessageBus
  start(): Promise<void>
  stop(): Promise<void>
  getChannel(id: string): IChannel | undefined
}

// packages/core/src/server/index.ts
export { createServer } from './Server.js'
export type { Server, ServerOptions } from './types.js'
```

**内部结构 (Server 私有):**
```
Server 内部:
  - dbManager: DatabaseManager       // if dbPath provided
  - scheduleEngine: ScheduleEngine  // if dbPath provided
  - channelContext: ChannelContext // 始终创建
  - heartbeatScheduler: HeartbeatScheduler  // if heartbeat config
  - plugins: IPlugin[]

  start():
    1. agent.initialize()
    2. 如果 dbPath: scheduleEngine.start()
    3. 如果 heartbeat config: heartbeatScheduler.start()
    4. 订阅总线事件（message:received → agent.dispatch → message:response → channel.send）
    5. plugins activate

  stop():
    1. plugins deactivate
    2. heartbeatScheduler.stop()
    3. scheduleEngine.stop()
    4. agent.dispose()
```

**ChannelContext 内部化（不对外暴露）:**
```typescript
// packages/core/src/server/ChannelContext.ts (私有)
class ChannelContext {
  private channels = new Map<string, IChannel>()
  private sessionMap = new Map<string, { channelId: string; chatId: string }>()

  register(channel: IChannel): void { ... }
  get(id: string): IChannel | undefined { ... }
  setSession(sessionId: string, channelId: string, chatId: string): void { ... }
  resolveTarget(notifyConfig: NotifyConfig, contextId?: string): { channelId: string; chatId: string } | null { ... }
}
```

**与 `createAgent()` 的关系:**
- `createAgent()` 继续可用，返回纯 Agent（无 Server 特性）
- `createServer()` 内部调用 `createAgent()` 并扩展 Server 特性
- 两者的 `AgentInitOptions` 共享字段（`externalConfig`、`skillConfig` 等）

---

### Decision 4: `AgentInitOptions` 扩展

**选择:** 在现有 `AgentInitOptions` 上新增可选字段，不创建新类型。

```typescript
// packages/core/src/agents/types/core.ts
export interface AgentInitOptions {
  externalConfig?: ExternalConfig
  skillConfig?: SkillSystemConfig
  sessionConfig?: SessionCapabilityConfig
  timeout?: TimeoutConfig
  // 新增（可选）:
  dbPath?: string
  scheduleEngineConfig?: {
    onCircuitBreak?: (event: ScheduleCircuitBreakEvent) => void
  }
}
```

**理由:** `plugins` 和 `heartbeat` 不放入 `AgentInitOptions`——这些是 Server 层关注点，放入会导致 Agent 类膨胀。继续由 `createServer()` 在构造时传入。

---

### Decision 5: `HeartbeatScheduler` 改用 cron

**选择:** `HeartbeatScheduler` 内部改用 `node-cron` 的 cron 调度替代 `setInterval`。

**实现:** `HeartbeatScheduler` 私有字段从 `timer: ReturnType<typeof setInterval>` 改为 `task: ScheduledTask`（来自 `node-cron`）。

```typescript
// apps/server/src/heartbeat-scheduler.ts
import { schedule as cronSchedule, ScheduledTask } from 'node-cron'

export class HeartbeatScheduler {
  private task?: ScheduledTask

  start(): void {
    this.task = cronSchedule(`*/${Math.floor(this.config.intervalMs / 60000)} * * * *`, () => {
      this.tick().catch(...)
    })
    this.task.start()
    // 立即执行一次
    this.tick().catch(...)
  }

  stop(): void {
    this.task?.stop()
    this.task = undefined
  }
}
```

**注意:** 如果 `intervalMs` 小于 1 分钟（< 60000ms），仍然使用 `setInterval`，因为 cron 不能表示秒级精度。但正常配置下 heartbeat 间隔通常 >= 1 分钟。

---

### Decision 6: bootstrap.ts 简化

**最终 `apps/server/bootstrap.ts` (~50 行):**
```typescript
import { createServer } from '@hive/core/server'
import { resolve } from 'path'

export async function bootstrap(config: ServerConfig): Promise<HiveContext> {
  const server = createServer({
    config: {
      externalConfig: { providers: [config.provider], activeProvider: config.provider.id },
      plugins: config.plugins.map(name => ({ name, config: config.pluginConfigs[name] ?? {} })),
      heartbeat: config.heartbeat.enabled ? config.heartbeat : undefined,
    },
    dbPath: resolve(process.cwd(), '.hive/hive.db'),
    logger: createLogger(config.logLevel),
  })

  await server.start()

  return {
    agent: server.agent,
    bus: server.bus,
    config,
    plugins: [],    // 从 server 内部获取
    logger: server.logger,
    heartbeatScheduler: null,  // 内嵌在 server
    scheduleEngine: null,     // 内嵌在 server
  }
}
```

## Risks / Trade-offs

**[Risk] `MessageBus` 迁移后的事件订阅兼容性**
→ `FeishuPlugin.activate()` 订阅了 `message:response`，`bootstrap.subscribeScheduleHandlers` 也订阅了 `schedule:completed`。迁移后行为不变，但需要确认没有其他地方直接引用了 `@hive/orchestrator`。

**[Risk] 删除了未来的多 Agent 可能性**
→ `Scheduler` 和 `AgentPool` 删除后，将来如果需要多 Agent 调度场景需要重新实现。但用户明确当前不考虑多 Agent，短中期优先简化。

**[Trade-off] ChannelContext 不对外暴露**
→ Server 的 Channel 管理逻辑完全内聚，如果用户只想用 Agent 而不想启动 Server，这些 Channel 管理 API 不可见。这是合理的——Channel 路由本来就是 Server 层的职责。

**[Trade-off] orchestrator 包删除 vs 保留空包**
→ 直接删除更干净，但如果外部有其他消费者会有破坏。检查了 `apps/server` 和 `apps/cli` 的 import，仅本项目使用。

## Migration Plan

1. **新增 `packages/core/src/bus/`** — 迁移 MessageBus 和 types
2. **新增 `packages/core/src/server/`** — 实现 Server 类和 ChannelContext
3. **修改 `@hive/core/src/index.ts`** — 导出 MessageBus
4. **更新 `apps/server/src/bootstrap.ts`** — 使用 createServer
5. **更新 `apps/server/package.json`** — 移除 `@hive/orchestrator` 依赖
6. **删除 `packages/orchestrator/` 整个目录**
7. **修改 `HeartbeatScheduler`** — 改用 cron
8. **更新所有 import 路径** — `@hive/orchestrator` → `@hive/core`
9. **运行测试验证** — 单元测试 + 集成测试
10. **验证构建** — `npm run build`

## Open Questions

**Q1: `apps/server` 的 `shutdown()` 函数** —— 当前接受 `HiveContext` 包含 `scheduleEngine`、`heartbeatScheduler`、`plugins` 等字段，瘦身后的 `Server` 是否直接返回这些？还是 `shutdown(server: Server)` 更简单？

**Q2: 飞书等插件的 `channel.send()` 调用** —— 定时任务完成后的推送目前通过 `bus.publish('message:response')` + `ChannelContext` subscriber 转发。如果 Channel 直接实现了一个内部 subscriber 直接发飞书，有没有重复发送的风险？需要确认飞书插件自身的 `handleResponse` 是否也订阅了 `message:response`。

**Q3: `createServer()` 是否应该返回完整的 `HiveContext` 结构** —— 还是只返回 `{ agent, bus, start, stop }` 四件套，让应用层按需获取其余信息？
