## MODIFIED Requirements

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
