## ADDED Requirements

### Requirement: Agent 注册
系统 SHALL 支持注册 Agent 实例到调度器。

#### Scenario: 注册新 Agent
- **WHEN** 调用 scheduler.register(agent)
- **THEN** Agent 被添加到实例池
- **AND** Agent 可接收消息

#### Scenario: 重复注册
- **WHEN** 尝试注册相同 ID 的 Agent
- **THEN** 抛出错误 "Agent already registered"

### Requirement: Agent 注销
系统 SHALL 支持从调度器移除 Agent。

#### Scenario: 注销 Agent
- **WHEN** 调用 scheduler.unregister(agentId)
- **THEN** Agent 从实例池移除
- **AND** 该 Agent 不再接收消息

### Requirement: 消息路由
系统 SHALL 根据消息的 agent 字段路由到目标 Agent。

#### Scenario: 路由到指定 Agent
- **WHEN** 消息指定 agent: "agent-001"
- **THEN** 仅 agent-001 接收该消息

#### Scenario: 目标 Agent 不存在
- **WHEN** 消息指定不存在的 agent ID
- **THEN** 触发错误事件
- **AND** 消息被丢弃

### Requirement: 广播消息
系统 SHALL 支持向所有 Agent 广播消息。

#### Scenario: 广播到所有
- **WHEN** 调用 scheduler.broadcast(message)
- **THEN** 所有注册的 Agent 都收到消息

### Requirement: Agent 状态查询
系统 SHALL 支持查询 Agent 状态（idle、busy、error）。

#### Scenario: 查询空闲 Agent
- **WHEN** 调用 scheduler.getIdleAgents()
- **THEN** 返回所有状态为 idle 的 Agent 列表
