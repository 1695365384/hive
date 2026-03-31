## Context

当前 `apps/server` 的日志体系存在分裂：

1. **HiveLogger**（hive-logger.ts）：完整的 pino 封装，具备 console pretty-print + LogBuffer + 文件轮转，但只在 AdminWsHandler 和 ChatWsHandler 中各自创建独立实例
2. **bootstrap.ts createLogger**：简单的 console.log 封装，完全不经过 HiveLogger
3. **散落的裸 console 调用**：~77 处分布在 13 个文件中，只有被 overrideConsole 劫持的才能进 HiveLogger 管道

双重 overrideConsole 竞态：AdminWsHandler 和 ChatWsHandler 各自调用 overrideConsole()，后调用的覆盖前一个，导致前一个 HiveLogger 的 console 拦截失效。

## Goals / Non-Goals

**Goals:**
- HiveLogger 在 main.ts 中单例创建，全局 overrideConsole() 只调用一次
- bootstrap.ts 的 ILogger 适配到 HiveLogger 的 pino 实例
- AdminWsHandler / ChatWsHandler 改为注入 HiveLogger，不再自行创建
- 所有散落的 console 调用自动走 HiveLogger 管道（console → pino → stdout + logBuffer + file）

**Non-Goals:**
- CLI 子命令（hive plugin/skill/chat）不在范围内
- 不改变 HiveLogger 内部实现（pino 配置、文件轮转逻辑等）
- 不改变 core 的 ILogger 接口定义

## Decisions

### D1: HiveLogger 在 main.ts 最早阶段创建

**选择**：在 startServer() 函数体的第一行创建 HiveLogger，在 bootstrap() 调用之前。

**替代方案**：延迟到 AdminWsHandler 创建后通过 getter 获取。
**否决理由**：bootstrap 阶段的日志会丢失，无法满足"所有日志走 HiveLogger"的要求。

### D2: broadcastLog 使用 subscriber 数组扇出

**选择**：创建 subscriber 数组，AdminWsHandler 和 ChatWsHandler 各自 push 一个 broadcast 函数。HiveLogger 的 broadcastLog 回调遍历所有 subscriber。

**替代方案**：通过 EventEmitter 发射 log 事件。
**否决理由**：subscriber 数组更轻量，无需引入 EventEmitter 额外抽象，且与现有 LogBuffer 模式一致。

### D3: bootstrap.ts 接收 pino Logger 参数

**选择**：bootstrap() 新增可选的 `pinoLogger` 参数。当提供时，用 pino adapter 替代 createLogger()；不提供时回退到现有行为（兼容 CLI `hive chat` 路径）。

```typescript
export async function bootstrap(options: BootstrapOptions): Promise<HiveContext> {
  const logger = options.pinoLogger
    ? createPinoAdapter(options.pinoLogger)
    : createFallbackLogger(options.config.logLevel)
  // ...
}
```

**替代方案**：直接删除 createLogger，强制要求 pinoLogger。
**否决理由**：CLI `hive chat` 子命令也调用 bootstrap()，此时没有 HiveLogger，需要回退路径。

### D4: AdminWsHandler / ChatWsHandler 构造函数改为注入

**选择**：构造函数新增 `HiveLogger` 参数，内部不再创建 HiveLogger 也不调用 overrideConsole。

**影响**：createAdminWsHandler / createChatWsHandler 工厂函数签名变更。

### D5: 共享 LogBuffer

**选择**：LogBuffer 在 main.ts 创建，注入到 AdminWsHandler 和 HiveLogger。ChatWsHandler 不需要独立的 LogBuffer（它不提供 log.tail API）。

## Risks / Trade-offs

- **[overrideConsole 时序]** → 必须在任何 console 调用之前执行。main.ts 作为入口点天然满足。
- **[CLI hive chat 兼容]** → CLI 路径不经过 startServer()，bootstrap 使用 fallback logger，不受影响。
- **[双重 dispose]** → close 函数中只需调用一次 hiveLogger.dispose()，由 main.ts 统一管理。AdminWsHandler.closeAll() 不再 dispose HiveLogger。
