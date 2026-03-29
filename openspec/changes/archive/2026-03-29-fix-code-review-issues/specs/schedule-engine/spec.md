## MODIFIED Requirements

### Requirement: Hot reload schedule changes
ScheduleEngine SHALL 支持运行时动态添加、暂停、恢复、删除任务。

#### Scenario: 运行时添加新任务
- **WHEN** 外部调用 `engine.addTask(task)`
- **THEN** Engine SHALL 立即为该任务注册对应模式的调度器（cron/every/timeout）
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

## ADDED Requirements

### Requirement: parseIntentV2 无副作用
`ScheduleCapability.parseIntentV2()` SHALL 仅解析用户意图并返回结构化数据，MUST NOT 修改实例状态（如 `pendingAutoSchedule`）。

#### Scenario: parseIntentV2 不修改 pendingAutoSchedule
- **WHEN** 调用 `parseIntentV2(userMessage)`
- **THEN** 方法 SHALL 返回 `ParsedScheduleIntent` 对象
- **THEN** `this.pendingAutoSchedule` SHALL 保持调用前的值不变

#### Scenario: autoSchedule 负责设置 pendingAutoSchedule
- **WHEN** 调用 `autoSchedule(message)` 且通过 LLM 解析
- **THEN** `autoSchedule` 方法 SHALL 在调用 `parseIntentV2` 后自行设置 `pendingAutoSchedule`

### Requirement: fallbackParseV2 不硬编码调度表达式
当 LLM 解析失败时，`fallbackParseV2()` SHALL 返回 `needsConfirmation: true` 而非硬编码 cron 表达式。

#### Scenario: 输入无数字内容
- **WHEN** 用户输入不包含数字（如 "提醒我开会"）
- **THEN** `fallbackParseV2` SHALL 返回 `needsConfirmation: true`
- **THEN** 返回的 `cron` 字段 SHALL 为空或 undefined（而非 `'0 9 * * *'`）

#### Scenario: 输入包含数字内容
- **WHEN** 用户输入包含数字（如 "每天9点检查日志"）
- **THEN** `fallbackParseV2` SHALL 返回 `needsConfirmation: true`
- **THEN** SHALL 不猜测 cron 表达式，仅提取可识别的数字信息

### Requirement: ScheduleRepository 使用白名单列映射
`ScheduleRepository.update()` SHALL 使用预定义的白名单列映射表，MUST NOT 将任意字段名直接拼入 SQL。

#### Scenario: 更新已知字段
- **WHEN** 调用 `update(id, { name: '新名称' })`
- **THEN** Repository SHALL 从白名单映射中查找列名 `name`
- **THEN** SHALL 生成参数化 SQL 更新

#### Scenario: 更新未知字段
- **WHEN** 调用 `update(id, { unknownField: 'value' })`
- **THEN** Repository SHALL 忽略不在白名单中的字段
- **THEN** SHALL 不抛出异常
