## MODIFIED Requirements

### Requirement: Load schedules from SQLite on startup
ScheduleEngine SHALL 在启动时从 SQLite schedules 表加载所有 enabled 任务，并根据 schedule_kind 注册对应的调度器。

#### Scenario: 正常启动加载任务
- **WHEN** 宿主应用调用 `engine.start()`
- **THEN** Engine SHALL 查询 schedules 表中 `enabled = true` 的所有记录
- **THEN** Engine SHALL 根据 schedule_kind 注册调度器：cron → node-cron 定时器，every → setInterval + nextRunAt 计算，at → setTimeout + 精确到期时间
- **THEN** Engine SHALL 返回已加载的任务数量

#### Scenario: 无可用任务
- **WHEN** schedules 表中没有 enabled 的任务
- **THEN** Engine SHALL 正常启动，返回 0 个任务

### Requirement: Trigger agent execution on schedule fire
当调度器触发时，ScheduleEngine SHALL 通过回调执行 Agent 任务。

#### Scenario: 定时触发执行
- **WHEN** 调度器到达预定时间
- **THEN** Engine SHALL 调用宿主传入的 `onTrigger(task)` 回调
- **THEN** 回调 SHALL 在独立会话中执行 agent.dispatch(task.prompt)
- **THEN** Engine SHALL 更新 schedules 表的 lastRunAt 和 nextRunAt 字段
- **THEN** Engine SHALL 在 schedule_runs 表中记录本次执行

#### Scenario: 执行成功
- **WHEN** agent.dispatch() 正常返回
- **THEN** Engine SHALL 记录执行状态为 `success`
- **THEN** Engine SHALL 记录生成的会话 ID
- **THEN** Engine SHALL 重置 consecutiveErrors 为 0

#### Scenario: 执行失败
- **WHEN** agent.dispatch() 抛出异常
- **THEN** Engine SHALL 捕获异常并记录执行状态为 `failed`
- **THEN** Engine SHALL 记录错误信息
- **THEN** Engine SHALL 将 consecutiveErrors 加 1
- **THEN** 其他任务的调度器 SHALL 不受影响继续运行

#### Scenario: 执行完成后发送推送事件
- **WHEN** 任务执行完成（成功或失败）
- **THEN** Engine SHALL 通过 MessageBus 发送 `schedule:completed` 事件，携带 `{ scheduleId, result, status, consecutiveErrors, notifyConfig }`

### Requirement: Hot reload schedule changes
ScheduleEngine SHALL 支持运行时动态添加、暂停、恢复、删除任务。

#### Scenario: 运行时添加新任务
- **WHEN** 外部调用 `engine.addTask(task)`
- **THEN** Engine SHALL 根据 task.scheduleKind 立即注册对应调度器
- **THEN** 不需要重启 Engine

#### Scenario: 运行时暂停任务
- **WHEN** 外部调用 `engine.pauseTask(taskId)`
- **THEN** Engine SHALL 取消该任务的调度器
- **THEN** 任务配置保留在数据库中

#### Scenario: 运行时恢复任务
- **WHEN** 外部调用 `engine.resumeTask(taskId)`
- **THEN** Engine SHALL 重新加载任务配置并注册调度器

#### Scenario: 运行时删除任务
- **WHEN** 外部调用 `engine.removeTask(taskId)`
- **THEN** Engine SHALL 取消该任务的调度器

### Requirement: Graceful shutdown
ScheduleEngine SHALL 支持优雅关闭，取消所有定时器。

#### Scenario: 宿主应用关闭
- **WHEN** 调用 `engine.stop()`
- **THEN** Engine SHALL 取消所有已注册的调度器（包括 node-cron、setInterval、setTimeout）
- **THEN** Engine SHALL 等待当前正在执行的任务完成（超时时间可配置）
- **THEN** Engine SHALL 返回关闭状态

### Requirement: ScheduleEngine lifecycle management
ScheduleEngine SHALL 作为独立模块，不依赖 Agent 实例，通过回调函数与 Agent 交互。

#### Scenario: Engine 构造
- **WHEN** 创建 ScheduleEngine 实例
- **THEN** Engine SHALL 接收 `onTrigger` 回调函数、数据库依赖和 MessageBus 实例
- **THEN** Engine SHALL 不直接持有 Agent 引用

#### Scenario: Engine 状态查询
- **WHEN** 调用 `engine.getStatus()`
- **THEN** Engine SHALL 返回当前状态：已注册任务数、运行中任务数、下次触发时间列表

## ADDED Requirements

### Requirement: 三种调度模式
ScheduleEngine SHALL 支持三种调度模式：cron（cron 表达式）、every（固定间隔）、at（一次性定时）。

#### Scenario: cron 模式调度
- **WHEN** schedule_kind 为 `cron`
- **THEN** Engine SHALL 使用 node-cron 注册定时器
- **THEN** 下次执行时间 SHALL 由 cron 表达式计算

#### Scenario: every 模式调度
- **WHEN** schedule_kind 为 `every`
- **THEN** Engine SHALL 使用 setInterval 注册周期调度器
- **THEN** Engine SHALL 使用 `computeNextRunAtMs(task)` 精确计算 nextRunAt（基于 anchor 时间戳 + interval_ms）
- **THEN** 每次触发后 SHALL 重新计算 nextRunAt

#### Scenario: at 模式一次性调度
- **WHEN** schedule_kind 为 `at`
- **THEN** Engine SHALL 使用 setTimeout 注册一次性调度器
- **THEN** Engine SHALL 精确计算到期时间（run_at 字段）

#### Scenario: at 模式过期任务不注册
- **WHEN** schedule_kind 为 `at` 且 run_at 已过
- **THEN** `computeNextRunAtMs()` SHALL 返回 undefined
- **THEN** Engine SHALL 不注册调度器
- **THEN** Engine SHALL 标记该任务为 disabled

### Requirement: 一次性任务自动清理
当 deleteAfterRun 为 true 时，任务执行完成后 SHALL 自动从数据库删除。

#### Scenario: 一次性任务执行后删除
- **WHEN** 任务执行完成且 deleteAfterRun 为 true
- **THEN** Engine SHALL 从 schedules 表删除该任务
- **THEN** Engine SHALL 取消该任务的调度器
- **THEN** Engine SHALL 在 schedule_runs 表保留执行记录

#### Scenario: 一次性任务执行失败不删除
- **WHEN** 任务执行失败且 deleteAfterRun 为 true
- **THEN** Engine SHALL 保留该任务（不删除），等待下次重试

### Requirement: 连续失败熔断
当任务连续失败达到阈值时，Engine SHALL 自动暂停任务并通知用户。

#### Scenario: 连续失败触发熔断
- **WHEN** 任务的 consecutiveErrors 达到阈值（默认 3）
- **THEN** Engine SHALL 自动将任务设为 paused
- **THEN** Engine SHALL 取消该任务的调度器
- **THEN** Engine SHALL 通过 MessageBus 发送 `schedule:circuit-break` 事件，携带 `{ scheduleId, name, consecutiveErrors }`

#### Scenario: 熔断后用户手动恢复
- **WHEN** 用户手动恢复已熔断的任务
- **THEN** Engine SHALL 重置 consecutiveErrors 为 0
- **THEN** Engine SHALL 重新注册调度器
