## ADDED Requirements

### Requirement: CapabilityRegistry 独立管理
系统 SHALL 提供 `CapabilityRegistry` 类，负责能力的注册、查找、遍历。`AgentContextImpl` MUST 通过 `CapabilityRegistry` 管理能力，而非直接使用 `Map<string, AgentCapability>`。

#### Scenario: 注册能力
- **WHEN** 调用 `registry.register(capability)`
- **THEN** 能力按名称注册，后续可通过 `registry.get(name)` 获取

#### Scenario: 查找能力（类型安全）
- **WHEN** 调用 `registry.get<SessionCapability>('session')`
- **THEN** 返回类型为 `SessionCapability` 的实例，若不存在则抛出错误

#### Scenario: 遍历所有能力
- **WHEN** 调用 `registry.getAll()`
- **THEN** 返回所有已注册能力的数组，按注册顺序排列

### Requirement: AgentContextImpl 职责简化
`AgentContextImpl` MUST 仅承担两个职责：DI 容器（持有依赖实例）和生命周期管理器（initializeAll / disposeAll）。能力的注册管理 MUST 委托给 `CapabilityRegistry`。

#### Scenario: AgentContextImpl 使用 CapabilityRegistry
- **WHEN** `AgentContextImpl` 需要注册或查找能力
- **THEN** 通过内部的 `this.capabilityRegistry` 实例操作，而非直接操作 Map

#### Scenario: initializeAll 委托遍历
- **WHEN** `AgentContextImpl.initializeAll()` 被调用
- **THEN** 通过 `capabilityRegistry.getAll()` 遍历能力进行初始化

### Requirement: 移除 Service Locator 反模式
能力模块之间 MUST NOT 通过 `context.getCapability(name)` 以字符串名称查找依赖。能力之间的依赖 SHOULD 通过构造函数注入或 `initialize(context)` 时的类型安全访问解决。

#### Scenario: WorkflowCapability 不再字符串查找
- **WHEN** `WorkflowCapability` 需要访问 `SessionCapability`
- **THEN** 通过 `context` 上的类型安全属性访问（如 `context.getSessionCap()`），而非 `context.getCapability('session')`

#### Scenario: ProviderCapability 不再做类型强转
- **WHEN** `ProviderCapability` 需要访问 WorkspaceManager
- **THEN** 通过类型安全的方式获取，不使用 `as unknown as` 强转
