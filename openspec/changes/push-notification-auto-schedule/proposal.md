## Why

当前定时任务系统（scheduled-tasks）执行结果仅写入 `schedule_runs` 表，用户无法收到任务执行的通知。同时 Agent 缺乏自主创建定时任务的能力——只能由用户通过自然语言显式触发。本 change 补齐这两个缺失能力：**结果推送通知**和 **Agent 自主调度**，并借鉴 OpenClaw 的 cron 系统增强调度灵活性。

## What Changes

- **三种调度模式**：扩展 `Schedule` 支持 `cron`（现有）、`every`（固定间隔）、`at`（一次性定时）三种调度模式
- **一次性任务自动清理**：新增 `deleteAfterRun` 标记，执行后自动从数据库删除
- **执行熔断**：新增 `consecutiveErrors` 追踪，连续失败达到阈值自动暂停任务并通知用户
- **推送通知**：新增 `NotifyConfig` 配置（mode/channel/to/bestEffort），任务执行完成后通过 Channel 推送结果给用户
- **Agent 自主创建任务**：ScheduleCapability 支持关键词预过滤 + LLM 结构化输出 + 用户确认流程，Agent 可自主建议并创建定时任务
- **Agent 直接操作接口**：暴露 `ScheduleRepository` 给 Agent 上下文，支持精确的编程式任务管理（无幻觉风险）

## Capabilities

### New Capabilities
- `push-notification`: 定时任务执行结果通过 Channel 推送给用户，支持 announce/none 模式、bestEffort 策略

### Modified Capabilities
- `schedule-engine`: 新增 every/at 调度模式、deleteAfterRun 一次性清理、consecutiveErrors 熔断
- `schedule-management`: 新增 NotifyConfig 推送配置、auto source 区分、auto-created-by 追踪、关键词预过滤、用户确认流程、Agent 直接操作接口

## Impact

- `packages/core/src/scheduler/types.ts`: 扩展 Schedule 类型（ScheduleKind、NotifyConfig、consecutiveErrors 等）
- `packages/core/src/storage/migrations/003-schedules-v2.ts`: 新增列（schedule_kind、notify_config、delete_after_run、consecutive_errors 等）
- `packages/core/src/scheduler/ScheduleEngine.ts`: 支持 every/at 调度、熔断逻辑、推送事件
- `packages/core/src/storage/ScheduleRepository.ts`: 适配新字段
- `packages/core/src/agents/capabilities/ScheduleCapability.ts`: 推送配置、关键词预过滤、确认流程、Agent 直接操作
- `apps/server/src/bootstrap.ts`: 新增 schedule:completed subscriber，路由推送结果到 Channel
- `openspec/specs/schedule-engine/spec.md`: 新增 every/at 调度、熔断、推送事件
- `openspec/specs/schedule-management/spec.md`: 新增推送配置、Agent 自主创建、确认流程
