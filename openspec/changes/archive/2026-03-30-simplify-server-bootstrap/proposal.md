## Why

`apps/server/bootstrap.ts` 目前 509 行，承担了太多职责：插件加载、数据库创建、定时任务引擎初始化、HeartbeatScheduler、心跳订阅、Session→Channel 路由映射、消息总线订阅编排。这些本该是 SDK 的内置逻辑，却全扔给了应用层。同时 `@hive/orchestrator` 包包含废弃的 `PluginHost` 和 `Scheduler`，只在 `apps/server` 里用到了一个 `MessageBus`，其余都是死代码。

## What Changes

- 将 `MessageBus` 从 `@hive/orchestrator` 迁移到 `@hive/core/src/bus/`
- 删除 `@hive/orchestrator` 包的剩余内容（PluginHost、Scheduler、AgentPool）
- 将 `ChannelContext`（sessionChannelMap + channelRegistry + resolveNotifyTarget）抽象为 `Server` 类内部成员
- `HeartbeatScheduler` 改用 cron（`node-cron`）实现持久化调度
- 新增 `createServer()` 工厂函数，将 bootstrap 的编排逻辑内聚到 SDK
- `apps/server/bootstrap.ts` 从 509 行瘦到 ~50 行
- `AgentInitOptions` 新增 `dbPath`、`scheduleEngineConfig`、`plugins`、`heartbeat` 选项

## Capabilities

### New Capabilities

- `server-factory`: 新的 `createServer()` 工厂，将 Agent、数据库、定时任务引擎、插件加载、Channel 注册表、消息总线订阅、心跳调度收拢到一个入口。向后兼容 `createAgent()`，Server 特性为可选扩展。
- `message-bus`: 将 `MessageBus` 从 `@hive/orchestrator` 迁移到 `@hive/core/src/bus/`，保留所有现有功能（pub/sub、request/response、wildcard、middleware）。`@hive/orchestrator` 包删除。
- `channel-context`: 将 bootstrap 里的 sessionChannelMap + channelRegistry + resolveNotifyTarget 合并为 Server 内部抽象，外部只暴露 `server.getChannel(id)` 和 `server.resolvePushTarget(contextId, notifyConfig)`。

### Modified Capabilities

- `schedule-engine`: 实现细节变更（every/at 模式改用 cron），但接口和外部行为不变，无需修改 spec。

## Impact

- `@hive/orchestrator` 包删除，apps/server 和 apps/cli 的 import 路径从 `@hive/orchestrator` 改为 `@hive/core`
- `apps/server/src/bootstrap.ts` 重写，外部调用方式变为 `createServer(config).start()`
- `apps/server/src/heartbeat-scheduler.ts` 改用 cron 实现，保留 `start()/stop()/tick()` 接口
- `apps/server/src/` 下的独立文件减少：bootstrap.ts 瘦身后，heartbeat-scheduler.ts 保留或内嵌
- `packages/core/src/` 新增 `bus/` 目录（MessageBus + types）
- `packages/core/src/agents/types/core.ts` 的 `AgentInitOptions` 新增可选字段
