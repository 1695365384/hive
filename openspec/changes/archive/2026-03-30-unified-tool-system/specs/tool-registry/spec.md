## ADDED Requirements

### Requirement: Tool registration and retrieval
系统 SHALL 提供 ToolRegistry 类，支持注册、查询和检索工具。注册时 SHALL 接受工具名称和 AI SDK Tool 对象。查询时 SHALL 支持按名称获取单个工具、获取所有工具、按 agent 类型获取工具集。工具名称 SHALL 唯一，重复注册 SHALL 覆盖已有工具。

#### Scenario: Register and retrieve a tool
- **WHEN** 注册名为 "bash" 的工具后，调用 getTool("bash")
- **THEN** SHALL 返回该工具的 AI SDK Tool 对象

#### Scenario: Get all tools
- **WHEN** 注册了 bash、file、glob 三个工具后，调用 getAllTools()
- **THEN** SHALL 返回包含三个工具的 Record<string, Tool>

#### Scenario: Register with same name overwrites
- **WHEN** 先注册 "bash" 工具 A，再注册 "bash" 工具 B
- **THEN** getTool("bash") SHALL 返回工具 B

#### Scenario: Get non-existent tool
- **WHEN** 调用 getTool("nonexistent")
- **THEN** SHALL 返回 undefined

### Requirement: Agent-type tool assignment
ToolRegistry SHALL 支持按 agent 类型（explore/plan/general）获取预定义的工具集。每种 agent 类型 SHALL 有对应的工具白名单。不在白名单中的工具 SHALL 不传递给对应类型的 Agent。

#### Scenario: Get tools for explore agent
- **WHEN** 调用 getToolsForAgent("explore")
- **THEN** SHALL 返回 file(view only)、glob、grep、web-search、web-fetch 工具，不包含 bash、ask-user

#### Scenario: Get tools for plan agent
- **WHEN** 调用 getToolsForAgent("plan")
- **THEN** SHALL 返回与 explore 相同的工具集（file view only、glob、grep、web-search、web-fetch）

#### Scenario: Get tools for general agent
- **WHEN** 调用 getToolsForAgent("general")
- **THEN** SHALL 返回全部 7 个内置工具

#### Scenario: Custom agent type falls back to general
- **WHEN** 调用 getToolsForAgent("unknown_type")
- **THEN** SHALL 返回与 general 相同的全量工具集

### Requirement: Built-in tool auto-registration
ToolRegistry SHALL 提供 `registerBuiltInTools()` 方法，一次性注册所有 7 个内置工具。每个内置工具 SHALL 使用 AI SDK `tool()` + Zod schema 定义。工具注册后 SHALL 可通过名称查询。

#### Scenario: Register all built-in tools
- **WHEN** 调用 registerBuiltInTools()
- **THEN** bash、file、glob、grep、web-search、web-fetch、ask-user 工具 SHALL 全部可用

#### Scenario: Built-in tools use standard AI SDK format
- **WHEN** 获取任意内置工具
- **THEN** 返回值 SHALL 为 AI SDK Tool 类型，包含 description、parameters (Zod schema)、execute 函数

### Requirement: External tool registration
ToolRegistry SHALL 支持注册外部自定义工具。外部工具 SHALL 与内置工具使用相同的 AI SDK Tool 格式。外部工具 SHALL 不受 agent 类型白名单限制，始终在所有 agent 类型中可用。

#### Scenario: Register custom tool
- **WHEN** 注册名为 "my-custom-tool" 的自定义工具
- **THEN** getTool("my-custom-tool") SHALL 返回该工具

#### Scenario: Custom tool available to all agent types
- **WHEN** 注册了自定义工具后，调用 getToolsForAgent("explore")
- **THEN** 返回的工具集中 SHALL 包含该自定义工具

### Requirement: Memory tool integration
ToolRegistry SHALL 支持将现有 memory-tools（remember/recall/forget）注册为外部工具。memory-tools SHALL 保持现有 SQLite 实现，通过适配器包装为 AI SDK Tool 格式后注册。

#### Scenario: Register memory tools
- **WHEN** 调用 registerMemoryTools(memoryRepository)
- **THEN** remember、recall、forget 工具 SHALL 可用

#### Scenario: Memory tools available to all agent types
- **WHEN** memory-tools 已注册，调用 getToolsForAgent("explore")
- **THEN** 返回的工具集中 SHALL 包含 remember、recall、forget
