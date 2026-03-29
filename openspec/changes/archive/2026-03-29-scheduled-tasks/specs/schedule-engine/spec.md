## ADDED Requirements

### Requirement: Load schedules from SQLite on startup
ScheduleEngine SHALL 在启动时从 SQLite schedules 表加载所有 enabled 任务，并注册对应的 cron 定时器。

#### Scenario: 正常启动加载任务
- **WHEN** 宿主应用调用 `engine.start()`
- **THEN** Engine SHALL 查询 schedules 表中 `enabled = true` 的所有记录
- **THEN** Engine SHALL 为每条记录使用 node-cron 注册定时器
- **THEN** Engine SHALL 返回已加载的任务数量

#### Scenario: 无可用任务
- **WHEN** schedules 表中没有 enabled 的任务
- **THEN** Engine SHALL 正常启动，返回 0 个任务

### Requirement: Trigger agent execution on schedule fire
当 cron 定时器触发时，ScheduleEngine SHALL 通过回调执行 Agent 任务。

#### Scenario: 定时触发执行
- **WHEN** cron 定时器到达预定时间
- **THEN** Engine SHALL 调用宿主传入的 `onTrigger(task)` 回调
- **THEN** 回调 SHALL 在独立会话中执行 agent.dispatch(task.prompt)
- **THEN** Engine SHALL 更新 schedules 表的 lastRunAt 和 nextRunAt 字段
- **THEN** Engine SHALL 在 schedule_runs 表中记录本次执行

#### Scenario: 执行成功
- **WHEN** agent.dispatch() 正常返回
- **THEN** Engine SHALL 记录执行状态为 `success`
- **THEN** Engine SHALL 记录生成的会话 ID

#### Scenario: 执行失败
- **WHEN** agent.dispatch() 抛出异常
- **THEN** Engine SHALL 捕获异常并记录执行状态为 `failed`
- **THEN** Engine SHALL 记录错误信息
- **THEN** 其他任务的 cron 定时器 SHALL 不受影响继续运行

### Requirement: Hot reload schedule changes
ScheduleEngine SHALL 支持运行时动态添加、暂停、恢复、删除任务。

#### Scenario: 运行时添加新任务
- **WHEN** 外部调用 `engine.addTask(task)`
- **THEN** Engine SHALL 立即为该任务注册 cron 定时器
- **THEN** 不需要重启 Engine

#### Scenario: 运行时暂停任务
- **WHEN** 外部调用 `engine.pauseTask(taskId)`
- **THEN** Engine SHALL 取消该任务的 cron 定时器
- **THEN** 任务配置保留在数据库中

#### Scenario: 运行时恢复任务
- **WHEN** 外部调用 `engine.resumeTask(taskId)`
- **THEN** Engine SHALL 重新加载任务配置并注册 cron 定时器

#### Scenario: 运行时删除任务
- **WHEN** 外部调用 `engine.removeTask(taskId)`
- **THEN** Engine SHALL 取消该任务的 cron 定时器

### Requirement: Graceful shutdown
ScheduleEngine SHALL 支持优雅关闭，取消所有定时器。

#### Scenario: 宿主应用关闭
- **WHEN** 调用 `engine.stop()`
- **THEN** Engine SHALL 取消所有已注册的 cron 定时器
- **THEN** Engine SHALL 等待当前正在执行的任务完成（超时时间可配置）
- **THEN** Engine SHALL 返回关闭状态

### Requirement: ScheduleEngine lifecycle management
ScheduleEngine SHALL 作为独立模块，不依赖 Agent 实例，通过回调函数与 Agent 交互。

#### Scenario: Engine 构造
- **WHEN** 创建 ScheduleEngine 实例
- **THEN** Engine SHALL 接收 `onTrigger` 回调函数和数据库依赖
- **THEN** Engine SHALL 不直接持有 Agent 引用

#### Scenario: Engine 状态查询
- **WHEN** 调用 `engine.getStatus()`
- **THEN** Engine SHALL 返回当前状态：已注册任务数、运行中任务数、下次触发时间列表
