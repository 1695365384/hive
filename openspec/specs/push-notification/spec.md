## ADDED Requirements

### Requirement: 定时任务执行结果推送
定时任务执行完成后，系统 SHALL 根据 NotifyConfig 配置将结果推送给用户。

#### Scenario: announce 模式推送成功
- **WHEN** 定时任务执行完成且 NotifyConfig.mode 为 `announce`
- **THEN** 系统 SHALL 通过 MessageBus 发送 `schedule:completed` 事件，携带 `{ scheduleId, result, status, notifyConfig }`
- **THEN** bootstrap subscriber SHALL 将结果路由到目标 Channel，调用 `bus.publish('message:response', { channelId, chatId, content })`
- **THEN** 对应 Channel.send() SHALL 将内容推送给用户

#### Scenario: none 模式不推送
- **WHEN** 定时任务执行完成且 NotifyConfig.mode 为 `none`
- **THEN** 系统 SHALL 不发送推送通知
- **THEN** 执行结果仅写入 schedule_runs 表

#### Scenario: bestEffort 静默跳过
- **WHEN** 定时任务执行完成且 NotifyConfig.bestEffort 为 true
- **AND** 目标 Channel 当前不可用
- **THEN** 系统 SHALL 静默跳过推送，不报错
- **THEN** 执行记录 SHALL 标记为 `success`（推送失败不影响任务状态）

#### Scenario: 非 bestEffort 推送失败
- **WHEN** 定时任务执行完成且 NotifyConfig.bestEffort 为 false
- **AND** 目标 Channel 不可用
- **THEN** 系统 SHALL 记录推送失败日志
- **THEN** 执行记录 SHALL 标记为 `success`，附加推送失败备注

### Requirement: 默认推送目标为最后交互 Channel
当用户未指定推送目标时，系统 SHALL 使用 "last" 策略，推送到用户最后交互的 Channel 和 chatId。

#### Scenario: 使用 last 策略推送
- **WHEN** 定时任务创建时 NotifyConfig.channel 为 `last`
- **AND** 用户之前通过飞书 Channel (channelId=feishu_1, chatId=chat_1) 与 Agent 交互
- **THEN** 系统 SHALL 推送结果到飞书 Channel 的 chat_1

#### Scenario: last 策略无历史记录
- **WHEN** 定时任务创建时 NotifyConfig.channel 为 `last`
- **AND** 用户从未通过任何 Channel 与 Agent 交互
- **THEN** 系统 SHALL 视为 bestEffort，静默跳过推送

### Requirement: bootstrap subscriber 监听推送事件
apps/server/src/bootstrap.ts SHALL 注册 `schedule:completed` 事件订阅者，将执行结果路由到 Channel。

#### Scenario: subscriber 接收事件并推送
- **WHEN** MessageBus 收到 `schedule:completed` 事件
- **THEN** subscriber SHALL 解析 notifyConfig 确定推送目标
- **THEN** subscriber SHALL 调用 `bus.publish('message:response')` 触发 Channel 推送

#### Scenario: subscriber 解析 channel 为 last
- **WHEN** notifyConfig.channel 为 `last`
- **THEN** subscriber SHALL 从 session 映射中查找用户最后交互的 { channelId, chatId }
- **THEN** 若找到，SHALL 使用该映射作为推送目标
