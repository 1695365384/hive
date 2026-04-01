## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: PromptBuildContext 支持环境上下文
`PromptBuildContext` interface SHALL 新增可选字段 `environmentContext?: EnvironmentContext`，用于传递系统环境信息到 prompt 构建流程。

#### Scenario: 构建上下文时传入环境信息
- **WHEN** 调用 `DynamicPromptBuilder.buildPrompt()` 时传入包含 `environmentContext` 的 context
- **THEN** 生成的 system prompt SHALL 包含 `## Environment` section

#### Scenario: 未传入环境信息
- **WHEN** 调用 `buildPrompt()` 时 `environmentContext` 为 undefined
- **THEN** 生成的 system prompt SHALL NOT 包含 `## Environment` section

### Requirement: Environment section 渲染到 System Prompt
`DynamicPromptBuilder` SHALL 将 `EnvironmentContext` 渲染为 Markdown 格式的 `## Environment` section，包含 OS、Shell、Node.js、Package Manager、Project Type、Available Tools、Working Directory 信息。

#### Scenario: 完整环境信息渲染
- **WHEN** `environmentContext` 包含所有字段
- **THEN** 生成的 prompt SHALL 包含如下格式的 section：
  ```
  ## Environment

  - **OS**: macOS (darwin/arm64)
  - **Shell**: zsh
  - **Node.js**: v20.11.0
  - **Package Manager**: pnpm
  - **Project Type**: typescript
  - **Available Tools**: pnpm, npm, git, docker
  - **Working Directory**: /Users/xxx/project
  ```

#### Scenario: Environment section 优先级
- **WHEN** prompt 总长度超过 token budget
- **THEN** Environment section SHALL NOT 被截裁或移除（优先级 0，与 base/task 同级）
