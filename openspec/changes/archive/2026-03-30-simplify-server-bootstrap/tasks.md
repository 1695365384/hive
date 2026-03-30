## 1. MessageBus 迁移到 @bundy-lmw/hive-core

- [x] 1.1 创建 `packages/core/src/bus/` 目录
- [x] 1.2 复制 `packages/orchestrator/src/bus/MessageBus.ts` → `packages/core/src/bus/MessageBus.ts`
- [x] 1.3 复制 `packages/orchestrator/src/bus/types.ts` → `packages/core/src/bus/types.ts`
- [x] 1.4 更新 `packages/core/src/index.ts` 添加 `export { MessageBus } from './bus/MessageBus.js'` 和类型导出
- [x] 1.5 更新 `packages/core/src/bus/MessageBus.ts` 的 import 路径（移除 `../bus/` 前缀引用）

## 2. 删除 @bundy-lmw/hive-orchestrator 包

- [x] 2.1 从 `apps/server/package.json` 移除 `@bundy-lmw/hive-orchestrator` 依赖
- [x] 2.2 删除 `packages/orchestrator/` 整个目录
- [x] 2.3 更新 `apps/server/src/bootstrap.ts` import：`from '@bundy-lmw/hive-orchestrator'` → `from '@bundy-lmw/hive-core'`
- [x] 2.4 更新 `apps/server/src/heartbeat-scheduler.ts` import：`from '@bundy-lmw/hive-orchestrator'` → `from '@bundy-lmw/hive-core'`
- [x] 2.5 更新 `packages/orchestrator/package.json` 的 `pnpm-workspace.yaml`（如果有workspace引用）
- [x] 2.6 从根 `pnpm-workspace.yaml` 移除 orchestrator 包引用

## 3. 实现 Server 工厂（packages/core/src/server/）

- [x] 3.1 创建 `packages/core/src/server/types.ts`：定义 `ServerOptions`、`Server`、`ChannelContext` 接口
- [x] 3.2 创建 `packages/core/src/server/ChannelContext.ts`：内部类，管理 channelRegistry + sessionChannelMap + resolveNotifyTarget
- [x] 3.3 创建 `packages/core/src/server/ServerImpl.ts`：实现 `Server` 接口，包含：
  - Agent 创建和初始化
  - DatabaseManager + ScheduleEngine（如果 dbPath 提供）
  - setDependencies 自动调用
  - 插件加载（factory + initialize + activate）
  - 心跳调度器（如果配置了）
  - 总线订阅编排（message:received → agent.dispatch → message:response → channel.send）
  - schedule:completed → 推送通知
- [x] 3.4 创建 `packages/core/src/server/index.ts`：导出 `createServer`
- [x] 3.5 更新 `packages/core/src/index.ts`：导出 Server 相关类型

## 4. AgentInitOptions 扩展

- [x] 4.1 在 `packages/core/src/agents/types/core.ts` 的 `AgentInitOptions` 中新增可选字段：
  - `dbPath?: string`
  - `scheduleEngineConfig?: { onCircuitBreak?: (event: ScheduleCircuitBreakEvent) => void }`

## 5. HeartbeatScheduler 改用 cron

- [x] 5.1 修改 `apps/server/src/heartbeat-scheduler.ts`：
  - 将 `timer: ReturnType<typeof setInterval>` 改为 `task?: ScheduledTask`
  - `start()` 改用 `cronSchedule()` 注册 cron 表达式（间隔分钟数转为 cron）
  - `stop()` 改用 `task?.stop()`
- [x] 5.2 如果 `intervalMs < 60000`，fallback 到 `setInterval`（cron 不支持秒级）

## 6. 重写 apps/server/bootstrap.ts

- [x] 6.1 重写 `apps/server/src/bootstrap.ts`：使用 `createServer()` 替代所有手写编排逻辑
- [x] 6.2 瘦到约 50 行，只负责：读取配置、调用 `createServer`、返回 `HiveContext`
- [x] 6.3 `shutdown()` 函数适配新的 Server 实例（调用 `server.stop()`）

## 7. 验证

- [x] 7.1 运行 `npm run build` 验证编译通过
- [x] 7.2 运行 `npm test` 验证所有测试通过（重点：scheduler、agent、message-bus 相关测试）
- [x] 7.3 检查没有遗留的 `@bundy-lmw/hive-orchestrator` 引用
- [x] 7.4 确认 `packages/orchestrator` 目录已完全删除
