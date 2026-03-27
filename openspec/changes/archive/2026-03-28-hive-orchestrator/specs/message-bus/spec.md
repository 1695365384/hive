## ADDED Requirements

### Requirement: 发布订阅模式
系统 SHALL 支持发布/订阅模式，允许组件订阅特定主题并接收消息。

#### Scenario: 订阅并接收消息
- **WHEN** 组件 A 订阅主题 "agent.task.started"
- **AND** 组件 B 发布消息到该主题
- **THEN** 组件 A 接收到消息

#### Scenario: 多订阅者
- **WHEN** 组件 A、B、C 同时订阅同一主题
- **AND** 发布一条消息
- **THEN** 三个组件都接收到消息

### Requirement: 请求响应模式
系统 SHALL 支持请求/响应模式，允许发送请求并等待回复。

#### Scenario: 请求并收到响应
- **WHEN** 组件 A 发送请求到主题 "agent.query"
- **AND** 组件 B 监听该主题并回复
- **THEN** 组件 A 收到响应

#### Scenario: 请求超时
- **WHEN** 组件 A 发送请求
- **AND** 5 秒内无响应
- **THEN** 请求超时并抛出错误

### Requirement: 广播消息
系统 SHALL 支持广播消息到所有订阅者。

#### Scenario: 广播到所有 Agent
- **WHEN** 网关广播消息
- **THEN** 所有注册的 Agent 都收到该消息

### Requirement: 中间件支持
系统 SHALL 支持注册中间件，在消息传递前后执行。

#### Scenario: 日志中间件
- **WHEN** 注册日志中间件
- **AND** 消息被发送
- **THEN** 中间件记录消息内容

### Requirement: 通配符订阅
系统 SHALL 支持通配符订阅，如 "agent:*" 匹配所有 agent 开头的主题。

#### Scenario: 通配符匹配
- **WHEN** 订阅 "agent:*"
- **AND** 发布消息到 "agent.started" 和 "agent.completed"
- **THEN** 两条消息都被接收
