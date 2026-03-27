## MODIFIED Requirements

### Requirement: AgentCapability 接口定义
`AgentCapability` 接口 SHALL 定义能力模块的标准契约，包含名称、同步初始化、异步初始化（可选）、销毁（可选）。

```typescript
interface AgentCapability {
  readonly name: string;
  initialize(context: AgentContext): void | Promise<void>;
  initializeAsync?(context: AgentContext): Promise<void>;
  dispose?(): void | Promise<void>;
}
```

#### Scenario: 实现同步能力
- **WHEN** 一个能力不需要异步初始化
- **THEN** 只实现 `initialize(context)`，不实现 `initializeAsync`

#### Scenario: 实现异步能力
- **WHEN** 一个能力需要异步初始化（如数据库连接）
- **THEN** 实现 `initializeAsync(context)` 方法，该方法在所有能力的 `initialize()` 完成后被调用

#### Scenario: 向后兼容
- **WHEN** 现有能力只实现了 `initialize()` 和 `dispose()`
- **THEN** 不需要任何修改即可正常工作
