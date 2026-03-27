## ADDED Requirements

### Requirement: 统一异步初始化接口
`AgentCapability` 接口 SHALL 定义可选的 `initializeAsync(context: AgentContext): Promise<void>` 方法。需要异步初始化的能力（如数据库连接、网络请求）MUST 实现此方法，而非在接口之外添加自定义的异步初始化方法。

#### Scenario: 异步初始化能力
- **WHEN** `AgentContextImpl.initializeAll()` 被调用
- **THEN** 先按注册顺序调用所有能力的 `initialize(context)`
- **THEN** 再按注册顺序调用所有能力的 `initializeAsync(context)`（如果已实现）

#### Scenario: 同步能力不受影响
- **WHEN** 一个能力只实现了 `initialize()` 而未实现 `initializeAsync()`
- **THEN** `initializeAll()` 正常完成，不报错

### Requirement: 移除自定义异步初始化方法
`SessionCapability` 和 `ProviderCapability` MUST NOT 暴露公共的 `initializeAsync()` 方法。它们的异步初始化逻辑 MUST 通过 `AgentCapability.initializeAsync()` 接口实现。

#### Scenario: SessionCapability 不再有公共 initializeAsync
- **WHEN** 外部代码尝试调用 `sessionCap.initializeAsync()`
- **THEN** 该方法不存在（编译期错误），异步初始化由 `initializeAll()` 统一管理

#### Scenario: 初始化顺序保证
- **WHEN** `Agent.initialize()` 中调用 `_context.initializeAll()`
- **THEN** SessionCapability 先完成异步初始化（数据库就绪），然后 ProviderCapability 再完成异步初始化（可使用数据库做持久化）

### Requirement: Agent.initialize 简化
`Agent.initialize()` MUST NOT 手动调用特定能力的异步初始化方法。所有能力的初始化 MUST 通过 `AgentContextImpl.initializeAll()` 统一完成。

#### Scenario: Agent.initialize 不再手动调用
- **WHEN** `Agent.initialize()` 被调用
- **THEN** 只需调用 `await this._context.initializeAll()`
- **THEN** 不存在对 `sessionCap.initializeAsync()` 或 `providerCap.initializeAsync()` 的直接调用
