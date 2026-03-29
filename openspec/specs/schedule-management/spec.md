## MODIFIED Requirements

### Requirement: Create schedule from natural language
用户 SHALL 能够通过自然语言对话创建定时任务。系统 SHALL 使用 LLM 将自然语言解析为结构化任务定义（scheduleKind + 调度参数 + 执行 prompt），持久化到 SQLite schedules 表。

#### Scenario: 用户说"每天早上9点检查日志"
- **WHEN** 用户发送消息 "每天早上9点检查日志"
- **THEN** 系统 SHALL 调用 LLM 解析意图，生成 `{ scheduleKind: 'cron', cron: "0 9 * * *", prompt: "检查日志" }`
- **THEN** 系统 SHALL 将任务存入 schedules 表，状态为 enabled
- **THEN** 系统 SHALL 返回确认信息，包含任务名称、调度参数和下次执行时间

#### Scenario: 用户说"每隔5分钟检查一次服务状态"
- **WHEN** 用户发送消息 "每隔5分钟检查一次服务状态"
- **THEN** 系统 SHALL 解析为 `{ scheduleKind: 'every', everyMs: 300000, prompt: "检查服务状态" }`
- **THEN** 系统 SHALL 将任务存入 schedules 表

#### Scenario: 用户说"明天下午3点提醒我开会"
- **WHEN** 用户发送消息 "明天下午3点提醒我开会"
- **THEN** 系统 SHALL 解析为 `{ scheduleKind: 'at', runAt: '<ISO datetime>', deleteAfterRun: true, prompt: "提醒开会" }`
- **THEN** 系统 SHALL 将任务存入 schedules 表，标记 deleteAfterRun 为 true

#### Scenario: 用户说模糊时间"以后每天提醒我"
- **WHEN** 用户发送的消息中缺少明确时间
- **THEN** 系统 SHALL 向用户追问具体时间
- **THEN** 收到明确时间后再创建任务

#### Scenario: LLM 生成的调度参数无效
- **WHEN** LLM 返回的调度参数无法通过验证（如 cron 语法错误、everyMs 为负数）
- **THEN** 系统 SHALL 要求 LLM 重新生成
- **THEN** 若重试仍失败，SHALL 提示用户手动指定参数

### Requirement: List schedules
用户 SHALL 能够查看当前工作空间下所有定时任务列表。

#### Scenario: 查看所有任务
- **WHEN** 用户发送 "查看定时任务" 或类似请求
- **THEN** 系统 SHALL 返回任务列表，包含：名称、调度模式（cron/every/at）、状态（enabled/paused）、下次执行时间、上次执行时间

#### Scenario: 无定时任务
- **WHEN** 用户请求查看定时任务但没有任何任务
- **THEN** 系统 SHALL 返回 "暂无定时任务" 提示

### Requirement: ScheduleCapability 作为 Agent 能力注册
ScheduleCapability SHALL 作为 Agent 的标准能力模块，遵循 Capability 委托模式。

#### Scenario: Capability 初始化
- **WHEN** Agent 初始化时启用 ScheduleCapability
- **THEN** Capability SHALL 接收 AgentContext 和 ScheduleRepository 依赖
- **THEN** Capability SHALL 可通过 `agent.getCapability('schedule')` 访问

## ADDED Requirements

### Requirement: Agent 自主创建定时任务（关键词预过滤）
当用户消息包含调度相关关键词时，ScheduleCapability SHALL 激活自动调度分析流程。

#### Scenario: 关键词匹配激活
- **WHEN** 用户消息包含触发词（"每天/每周/每隔/定期/监控/提醒/推送/cron/定时"）
- **THEN** Capability SHALL 激活 LLM 结构化输出流程

#### Scenario: 无关键词跳过
- **WHEN** 用户消息不包含任何触发词
- **THEN** Capability SHALL 跳过自动调度分析，正常处理对话

### Requirement: Agent 自主创建定时任务（LLM 结构化输出）
关键词匹配后，系统 SHALL 使用 LLM 生成结构化任务定义，并通过 JSON Schema 校验。

#### Scenario: LLM 成功生成结构化输出
- **WHEN** 关键词匹配激活
- **THEN** 系统 SHALL 调用 LLM 生成 `{ name, scheduleKind, cron/everyMs/runAt, prompt, notifyConfig }`
- **THEN** 系统 SHALL 通过 JSON Schema 校验：scheduleKind 合法性、cron 语法、interval 范围、频率上限

#### Scenario: LLM 输出校验失败
- **WHEN** LLM 返回的结构化数据未通过 JSON Schema 校验
- **THEN** 系统 SHALL 要求 LLM 重新生成
- **THEN** 超过重试上限后 SHALL 降级为普通对话处理

#### Scenario: 任务数量上限
- **WHEN** 用户已拥有 50 个 source='auto' 的任务
- **THEN** 系统 SHALL 拒绝创建新任务
- **THEN** 系统 SHALL 提示用户先清理现有任务

### Requirement: Agent 自主创建定时任务（用户确认）
所有 Agent 自主建议的任务 MUST 经过用户确认后才能创建。

#### Scenario: 用户确认创建
- **WHEN** LLM 成功生成结构化任务定义
- **THEN** Agent SHALL 返回确认卡片，展示任务名称、调度模式、执行 prompt、推送配置
- **THEN** 用户确认后 SHALL 创建任务，source 设为 `auto`，autoCreatedBy 设为 Agent ID

#### Scenario: 用户拒绝创建
- **WHEN** 用户对确认卡片选择拒绝
- **THEN** 系统 SHALL 不创建任务
- **THEN** 系统 SHALL 正常继续对话

### Requirement: Agent 直接操作 ScheduleRepository
Agent SHALL 可通过编程接口直接操作 ScheduleRepository，精确控制任务生命周期。

#### Scenario: Agent 通过 Repository 创建任务
- **WHEN** Agent 在工作流中需要精确创建定时任务
- **THEN** Agent SHALL 通过 `context.getDependency<IScheduleRepository>()` 获取 Repository
- **THEN** Agent SHALL 调用 `repo.create({ name, scheduleKind, ... })` 直接创建任务

#### Scenario: Agent 通过 Repository 管理任务
- **WHEN** Agent 需要管理已创建的任务
- **THEN** Agent SHALL 可调用 `repo.update()`、`repo.delete()`、`repo.pause()` 等方法
- **THEN** 操作 SHALL 不经过 LLM 解析层，消除幻觉风险

### Requirement: NotifyConfig 推送配置
每个定时任务 SHALL 可配置推送通知参数。

#### Scenario: 创建带推送的任务
- **WHEN** 创建任务时指定 notifyConfig `{ mode: 'announce', channel: 'last', bestEffort: true }`
- **THEN** 任务 SHALL 在执行完成后通过目标 Channel 推送结果

#### Scenario: 创建不带推送的任务
- **WHEN** 创建任务时 notifyConfig.mode 为 `none` 或未指定
- **THEN** 任务 SHALL 不推送执行结果

### Requirement: Session-Channel 映射记录
bootstrap.ts SHALL 在用户交互时记录 session 到 channel 的映射关系。

#### Scenario: 记录用户最后交互 Channel
- **WHEN** MessageBus 收到 `message:received` 事件
- **THEN** bootstrap subscriber SHALL 记录 `{ sessionId → { channelId, chatId } }` 映射
- **THEN** 该映射 SHALL 用于 `channel: 'last'` 推送策略的目标解析
