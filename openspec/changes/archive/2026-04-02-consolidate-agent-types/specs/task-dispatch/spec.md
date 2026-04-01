## MODIFIED Requirements

### Requirement: Unified task dispatch entry point
Agent SHALL expose a single `dispatch(task, options?)` method as the sole task execution entry point. The method SHALL return a `DispatchResult` containing text, success status, tool calls, duration, and optional cost.

#### Scenario: Server dispatches a chat message
- **WHEN** Server calls `agent.dispatch(task, { chatId, onText, onToolCall, onToolResult })`
- **THEN** ExecutionCapability builds system prompt from `intelligent.md`, injects environment context, schedule summary, and tool descriptions
- **AND** the full tool set (bash, file, glob, grep, web-search, web-fetch, ask-user, send-file) plus subagent tools (explore, plan) are available
- **AND** LLM response streams via `onText` callback
- **AND** session is automatically persisted with user message and assistant response

#### Scenario: CLI dispatches with forceMode explore
- **WHEN** CLI calls `agent.dispatch(task, { forceMode: 'explore' })`
- **THEN** ExecutionCapability uses `explore.md` as base template
- **AND** only read-only tools are provided (file readonly, glob, grep, web-search, web-fetch, env)
- **AND** subagent tools are NOT injected

#### Scenario: CLI dispatches with forceMode plan
- **WHEN** CLI calls `agent.dispatch(task, { forceMode: 'plan' })`
- **THEN** ExecutionCapability uses `explore.md` as base template (plan is an alias for explore)
- **AND** only read-only tools are provided
- **AND** subagent tools are NOT injected

#### Scenario: CLI dispatches without forceMode
- **WHEN** CLI calls `agent.dispatch(task)` without forceMode
- **THEN** behavior is identical to Server dispatch (full tools + subagent tools + intelligent.md)

### Requirement: Dynamic tool set based on forceMode
ExecutionCapability SHALL select tools based on `forceMode`:
- `undefined` (normal): all general tools + subagent tools
- `'explore'` / `'plan'`: read-only tools only, no subagent tools

#### Scenario: Normal mode includes subagent tools
- **WHEN** dispatch is called without forceMode
- **THEN** the LLM receives `explore` and `plan` as available tools in addition to all general tools

#### Scenario: Forced explore mode excludes subagent tools
- **WHEN** dispatch is called with `forceMode: 'explore'`
- **THEN** the LLM does NOT receive `explore` or `plan` as available tools

#### Scenario: Forced plan mode maps to explore
- **WHEN** dispatch is called with `forceMode: 'plan'`
- **THEN** behavior is identical to `forceMode: 'explore'`

## REMOVED Requirements

### Requirement: Deleted public methods
**Reason**: Agent 公共方法已在 unify-agent-dispatch 中移除，此处不再重复。runner.ts 的便捷方法（plan/evaluator）将在本 change 中处理。
**Migration**: runner.execute('explore', ...) 和 runner.execute('plan', ...) 仍可用。runner.evaluator() 和 runner.plan() 保留但标记 @deprecated。

## ADDED Requirements

### Requirement: CORE_AGENTS consolidation
CORE_AGENTS SHALL 只包含 `explore` 和 `general` 两种 Agent 配置。`AGENT_NAMES` SHALL 保留 `EVALUATOR` 和 `PLAN` 字段但标记 @deprecated。

#### Scenario: getAgentConfig returns explore
- **WHEN** `getAgentConfig('explore')` 被调用
- **THEN** 返回 type='explore'、tools=[只读]、maxTurns=10 的配置

#### Scenario: getAgentConfig returns general
- **WHEN** `getAgentConfig('general')` 被调用
- **THEN** 返回 type='general'、tools=[全量]、maxTurns=30 的配置

#### Scenario: getAgentConfig plan alias
- **WHEN** `getAgentConfig('plan')` 被调用
- **THEN** 返回与 explore 相同的配置

#### Scenario: getAgentConfig evaluator alias
- **WHEN** `getAgentConfig('evaluator')` 被调用
- **THEN** 返回与 general 相同的配置

### Requirement: AGENT_PRESETS consolidation
AGENT_PRESETS SHALL 只包含 `explore`（maxSteps: 10）和 `general`（maxSteps: 30）。`plan` 和 `evaluator` SHALL 通过 fallback 获取对应预设。

#### Scenario: explore preset
- **WHEN** AGENT_PRESETS['explore'] 被访问
- **THEN** 返回 maxSteps: 10

#### Scenario: general preset
- **WHEN** AGENT_PRESETS['general'] 被访问
- **THEN** 返回 maxSteps: 30

#### Scenario: plan fallback
- **WHEN** AGENT_PRESETS['plan'] 被访问
- **THEN** 返回 undefined（fallback 到 explore 的配置）

### Requirement: Prompt template consolidation
explore.md SHALL 合并原 explore.md 和 plan.md 的优点。plan.md SHALL 被删除。`buildPlanPrompt()` SHALL 标记 @deprecated 并内部委托给 `buildExplorePrompt()`。

#### Scenario: explore template supports thoroughness
- **WHEN** explore Agent 使用 thoroughness='very-thorough' 运行
- **THEN** prompt 包含结构化输出指引（Relevant Files / Current Implementation / Dependencies / Recommendations）

#### Scenario: buildPlanPrompt delegates
- **WHEN** `buildPlanPrompt('task')` 被调用
- **THEN** 内部调用 `buildExplorePrompt('task', 'very-thorough')`
