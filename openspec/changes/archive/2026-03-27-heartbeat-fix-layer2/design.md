## Context

Hive 的 Agent 心跳系统由 `TimeoutCapability` 实现，当前只覆盖了执行中的健康监控（Layer 1）。代码审查发现 3 个 bug 和 1 个架构缺口。同时参考 OpenClaw 的 Gateway Heartbeat 机制，Hive 缺少空闲时的主动巡检能力（Layer 2）。

**当前架构：**
- `TimeoutCapability` 提供 `startHeartbeat` / `stopHeartbeat` / `updateActivity` / `withTimeout`
- `ChatCapability.processStream()` 在每次 SDK 消息到达时调用 `updateActivity()`
- `Agent.chat()` / `chatStream()` 在外层包装心跳+超时
- `WorkflowCapability` 和 `runner.execute()` 没有任何超时保护

**约束：** Hive 定位是 SDK，不是 Gateway。Layer 2 的调度由宿主应用负责，SDK 只提供原语。

## Goals / Non-Goals

**Goals:**
- 修复 onStalled 检测到卡住但不中断执行的问题
- 为 WorkflowCapability 增加超时保护
- 消除 chat/chatStream 的心跳代码重复
- 为子 Agent 增加可选超时
- 提供 `runHeartbeatOnce()` 原语供宿主应用实现 Layer 2

**Non-Goals:**
- 不在 SDK 内实现调度器（setInterval / cron 等）— 由宿主应用负责
- 不实现 HEARTBEAT.md 文件协议 — 宿主应用通过 prompt 参数自定义
- 不实现 channel 投递路由 — 宿主应用通过 onResult 回调自行处理
- 不实现 activeHours / isolatedSession — 这些是 Gateway 层面的关注点

## Decisions

### D1: onStalled 行为可配置（warn vs abort）

**选择:** 在 `HeartbeatConfig` 增加 `action: 'warn' | 'abort'` 字段，默认 `'warn'`。

**理由:** 向后兼容，不改变现有行为。宿主应用按需选择严格模式。

**备选方案:**
- 直接改为 abort — 会破坏现有依赖 warn 行为的宿主应用
- 新增单独的 `abortOnStall` boolean — 语义不如 action 清晰

### D2: withHeartbeat 提取为私有方法

**选择:** 在 `Agent` 类中提取 `private async withHeartbeat<T>()` 方法。

**理由:** `chat()` 和 `chatStream()` 的心跳+超时包装代码完全一致（约 20 行），提取后消除重复且保证行为一致。

### D3: 子 Agent 超时通过 AgentExecuteOptions 传入

**选择:** 在 `AgentExecuteOptions` 增加 `timeout?: number`，由 `runner.executeWithConfig()` 使用 `AbortController` 实现。

**理由:** 不在 runner 内部硬编码超时，由调用方（Agent / WorkflowCapability）决定超时策略。保持 runner 的职责单一。

### D4: Layer 2 作为独立公开方法

**选择:** `Agent.runHeartbeatOnce(config?: HeartbeatTaskConfig): Promise<HeartbeatResult>`。

**理由:** SDK 只提供"执行一次心跳"的原语，调度逻辑由宿主应用控制。这样 SDK 保持轻量，宿主应用可以自由选择调度方式（setInterval、node-cron、agenda 等）。

### D5: stallTimeout 默认值调整为 120s

**选择:** 将 `DEFAULT_TIMEOUT_CONFIG.stallTimeout` 从 60000 改为 120000。

**理由:** 国产模型（DeepSeek、GLM）API 响应可能需要 30-60 秒，加上工具执行时间，60 秒的 stallTimeout 容易误报。120 秒 = apiTimeout（2 分钟）的等值，更合理。

## Risks / Trade-offs

- **[stallTimeout 调大可能延迟检测]** → 宿主应用可通过 `TimeoutConfig` 自定义更短的值
- **[abort action 可能丢失部分结果]** → abort 后 `chat()` 的 `finally` 块仍会执行 `stopHeartbeat()`，确保资源清理。宿主应用可通过 hook 事件保存已收到的部分结果
- **[runHeartbeatOnce 每次消耗 token]** → 文档明确标注成本，建议宿主应用使用 `lightContext` 或便宜模型。后续可考虑 `isolatedSession` 支持
- **[WorkflowCapability 超时可能中断长任务]** → 默认使用 `executionTimeout`（10 分钟），宿主应用可通过 WorkflowOptions 覆盖
