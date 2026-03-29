## MODIFIED Requirements

### Requirement: Sub-agent tool restriction by phase
explore and plan sub-agents SHALL be restricted to read-only tools via ToolRegistry.getToolsForAgent(), not prompt-level suggestion. LLMRuntime SHALL accept AI SDK standard Tool format directly via `tools` parameter in RuntimeConfig.

#### Scenario: Explore agent cannot call Write
- **WHEN** SubAgentCapability.explore() calls runner.execute('explore', prompt)
- **THEN** runner.execute() SHALL use ToolRegistry.getToolsForAgent('explore') 获取工具集，传递给 LLMRuntime，不包含 bash、ask-user

#### Scenario: Plan agent cannot call Write
- **WHEN** SubAgentCapability.plan() calls runner.execute('plan', prompt)
- **THEN** runner.execute() SHALL use ToolRegistry.getToolsForAgent('plan') 获取工具集

#### Scenario: General agent has full tools
- **WHEN** SubAgentCapability.general() calls runner.execute('general', prompt)
- **THEN** runner.execute() SHALL use ToolRegistry.getToolsForAgent('general') 获取全量工具集

#### Scenario: Custom tools override
- **WHEN** caller provides `options.tools` array
- **THEN** the provided tools SHALL take precedence over the default agent tools

### Requirement: LLMRuntime accepts AI SDK Tool format
LLMRuntime.run() SHALL accept `tools` parameter as `Record<string, Tool>` (AI SDK standard format) directly, without requiring conversion via convertTools(). The legacy `AITool` interface and `convertTools()` method SHALL be deprecated and removed.

#### Scenario: Pass tools to LLMRuntime
- **WHEN** RuntimeConfig 包含 tools: { bash: bashTool, file: fileTool }
- **THEN** LLMRuntime SHALL 直接传递给 generateText/streamText 的 tools 参数

#### Scenario: No tools provided
- **WHEN** RuntimeConfig 不包含 tools 参数
- **THEN** LLMRuntime SHALL 正常执行，不传递 tools 给 AI SDK

#### Scenario: Legacy AITool format not supported
- **WHEN** 调用方传入旧格式 AITool 对象
- **THEN** LLMRuntime SHALL 抛出 TypeError，提示使用 AI SDK tool() 格式
