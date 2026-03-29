## ADDED Requirements

### Requirement: Create schedule from natural language
用户 SHALL 能够通过自然语言对话创建定时任务。系统 SHALL 使用 LLM 将自然语言解析为结构化任务定义（cron 表达式 + 执行 prompt + action 类型），持久化到 SQLite schedules 表。

#### Scenario: 用户说"每天早上9点检查日志"
- **WHEN** 用户发送消息 "每天早上9点检查日志"
- **THEN** 系统 SHALL 调用 LLM 解析意图，生成 `{ cron: "0 9 * * *", prompt: "检查日志", action: "chat" }`
- **THEN** 系统 SHALL 将任务存入 schedules 表，状态为 enabled
- **THEN** 系统 SHALL 返回确认信息，包含任务名称、cron 表达式和下次执行时间

#### Scenario: 用户说模糊时间"以后每天提醒我"
- **WHEN** 用户发送的消息中缺少明确时间
- **THEN** 系统 SHALL 向用户追问具体时间
- **THEN** 收到明确时间后再创建任务

#### Scenario: LLM 生成的 cron 表达式无效
- **WHEN** LLM 返回的 cron 表达式无法通过验证（如语法错误）
- **THEN** 系统 SHALL 要求 LLM 重新生成
- **THEN** 若重试仍失败，SHALL 提示用户手动指定时间

### Requirement: List schedules
用户 SHALL 能够查看当前工作空间下所有定时任务列表。

#### Scenario: 查看所有任务
- **WHEN** 用户发送 "查看定时任务" 或类似请求
- **THEN** 系统 SHALL 返回任务列表，包含：名称、cron 表达式、状态（enabled/paused）、下次执行时间、上次执行时间

#### Scenario: 无定时任务
- **WHEN** 用户请求查看定时任务但没有任何任务
- **THEN** 系统 SHALL 返回 "暂无定时任务" 提示

### Requirement: Pause and resume schedule
用户 SHALL 能够暂停和恢复已创建的定时任务。

#### Scenario: 暂停任务
- **WHEN** 用户发送 "暂停日志检查任务"
- **THEN** 系统 SHALL 将对应 schedules 记录的 enabled 字段设为 false
- **THEN** 系统 SHALL 通知 ScheduleEngine 取消该任务的 cron 注册

#### Scenario: 恢复任务
- **WHEN** 用户发送 "恢复日志检查任务"
- **THEN** 系统 SHALL 将对应 schedules 记录的 enabled 设为 true
- **THEN** 系统 SHALL 通知 ScheduleEngine 重新注册 cron

### Requirement: Delete schedule
用户 SHALL 能够删除不再需要的定时任务。

#### Scenario: 删除指定任务
- **WHEN** 用户发送 "删除日志检查任务"
- **THEN** 系统 SHALL 从 schedules 表中删除该记录
- **THEN** 系统 SHALL 通知 ScheduleEngine 取消 cron 注册

#### Scenario: 任务不存在
- **WHEN** 用户请求删除不存在的任务
- **THEN** 系统 SHALL 返回 "未找到该任务" 提示

### Requirement: View schedule execution history
用户 SHALL 能够查看某个定时任务的历史执行记录。

#### Scenario: 查看执行记录
- **WHEN** 用户发送 "查看日志检查的执行记录"
- **THEN** 系统 SHALL 返回该任务的所有执行记录，包含执行时间、执行状态、对应会话 ID
- **THEN** 用户 SHALL 能够通过会话 ID 查看具体执行结果

### Requirement: ScheduleCapability 作为 Agent 能力注册
ScheduleCapability SHALL 作为 Agent 的标准能力模块，遵循 Capability 委托模式。

#### Scenario: Capability 初始化
- **WHEN** Agent 初始化时启用 ScheduleCapability
- **THEN** Capability SHALL 接收 AgentContext 和 ScheduleRepository 依赖
- **THEN** Capability SHALL 可通过 `agent.getCapability('schedule')` 访问
