## Requirements

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

### Requirement: IPlugin 接口定义
`IPlugin` 接口 SHALL 定义插件的标准契约。`initialize()` 方法 SHALL 接收第四个可选参数 `context`，包含运行时环境信息。

```typescript
interface PluginContext {
  /** 工作空间根目录（只读，插件不应修改此目录本身） */
  workspaceDir: string
}

interface IPlugin {
  readonly metadata: PluginMetadata
  initialize(
    messageBus: IMessageBus,
    logger: ILogger,
    registerChannel: (channel: IChannel) => void,
    context?: PluginContext
  ): Promise<void>
  activate(): Promise<void>
  deactivate(): Promise<void>
  destroy?(): Promise<void>
  getChannels(): IChannel[]
}
```

#### Scenario: Server 传递 workspace 目录
- **WHEN** ServerImpl 初始化插件且 WorkspaceManager 已配置
- **THEN** 系统 SHALL 调用 `plugin.initialize(bus, logger, registerChannel, { workspaceDir: rootPath })`

#### Scenario: 向后兼容
- **WHEN** 现有插件未使用 context 参数
- **THEN** 插件 SHALL 正常工作（context 为可选参数）

#### Scenario: 插件访问 workspace 目录
- **WHEN** 插件通过 `context.workspaceDir` 获取路径
- **THEN** 插件 SHALL 只读访问该目录
- **AND** 插件创建的子目录（如 `files/`） SHALL 位于 workspace 目录下，不修改 workspace 本身的结构

### Requirement: ILogger 从 plugins/types 重新导出
`plugins/types.ts` SHALL 保留 `ILogger` 和 `noopLogger` 的导出，但实际定义来自 `types/logger.ts`。这确保向后兼容性。

#### Scenario: 现有代码从 plugins/types 导入 ILogger
- **WHEN** 现有代码使用 `import { ILogger } from '../plugins/types.js'`
- **THEN** 编译通过，运行时行为不变

#### Scenario: 新代码从 types/logger 导入
- **WHEN** 新代码使用 `import { ILogger } from '../types/logger.js'`
- **THEN** 编译通过，与从 plugins/types 导入等效
